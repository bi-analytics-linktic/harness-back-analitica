// Plantilla del harness → test/monitor.e2e-spec.ts
import { Controller, Get, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { MonitorModule } from '../src/common/monitor/monitor.module';
import { MONITOR_WIDGETS, MonitorWidget } from '../src/common/monitor/monitor-widget.interface';
import { EndpointsTotalWidget } from '../src/common/monitor/widgets/endpoints-total.widget';
import { SecurityModule } from '../src/common/security/security.module';

@Controller('cartera')
class CarteraController {
  @Get('resumen')
  summary(): void {}

  @Get('detalle')
  detail(): void {}
}

@Controller('health')
class HealthController {
  @Get()
  check(): void {}
}

const brokenWidget: MonitorWidget = {
  id: 'broken',
  title: 'Widget roto',
  order: 99,
  collect: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
};

async function createApp(enabled: boolean): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            MONITOR_ENABLED: String(enabled),
            MONITOR_SESSION_EXPIRES_IN: '15m',
            ACCESS_TOKEN: 'example123',
            JWT_ACCESS_SECRET: 'e2e-access-secret-with-enough-length',
            auth: { login: { maxAttempts: 3, windowSeconds: 60 } },
          }),
        ],
      }),
      SecurityModule,
      MonitorModule,
    ],
    controllers: [CarteraController, HealthController],
  })
    .overrideProvider(MONITOR_WIDGETS)
    .useFactory({
      factory: (total: EndpointsTotalWidget) => [total, brokenWidget],
      inject: [EndpointsTotalWidget],
    })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

describe('Monitor (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp(true);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (password: string): request.Test =>
    request(app.getHttpServer()).post('/monitor/login').type('form').send({ password });

  it('redirects to the login form without a session', async () => {
    const res = await request(app.getHttpServer()).get('/monitor');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/monitor/login');
  });

  it('serves the login form with the security headers and no scripts', async () => {
    const res = await request(app.getHttpServer()).get('/monitor/login');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.text).not.toMatch(/<script/i);
  });

  it('rejects a wrong password with 401 and no cookie', async () => {
    const res = await login('wrong');
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.text).toContain('Contraseña incorrecta');
  });

  it('logs in, shows the endpoint count and isolates a failing widget', async () => {
    const res = await login('example123');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/monitor');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(
      /arness_monitor=.+; Max-Age=900; Path=\/monitor; HttpOnly; Secure; SameSite=Strict/,
    );

    const page = await request(app.getHttpServer())
      .get('/monitor')
      .set('Cookie', cookie.split(';')[0]);
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/data-widget="endpoints-total".*?>2</);
    expect(page.text).toContain('No disponible');
    expect(page.text).not.toContain('ECONNREFUSED');
    expect(page.text).not.toMatch(/<script/i);
  });

  it('logout clears the cookie', async () => {
    const res = await request(app.getHttpServer()).post('/monitor/logout');
    expect(res.status).toBe(303);
    expect(String(res.headers['set-cookie'])).toContain('arness_monitor=; Max-Age=0');
  });

  it('answers 429 with Retry-After after too many wrong passwords, even with the right one', async () => {
    const limited = await createApp(true);
    const attempt = (password: string): request.Test =>
      request(limited.getHttpServer()).post('/monitor/login').type('form').send({ password });
    for (let i = 0; i < 3; i += 1) expect((await attempt('wrong')).status).toBe(401);

    const res = await attempt('example123');
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.text).toContain('Demasiados intentos');
    await limited.close();
  });

  it('answers 404 when MONITOR_ENABLED=false', async () => {
    const disabled = await createApp(false);
    await request(disabled.getHttpServer()).get('/monitor').expect(404);
    await request(disabled.getHttpServer()).get('/monitor/login').expect(404);
    await disabled.close();
  });
});
