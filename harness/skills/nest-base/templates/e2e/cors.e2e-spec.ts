// Plantilla del harness → test/cors.e2e-spec.ts
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { buildCorsOptions } from '../src/config/cors';

@Controller('probe')
class ProbeController {
  @Get()
  get(): { data: string } {
    return { data: 'ok' };
  }
}

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;
  const allowed = 'https://app.example.com';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors(buildCorsOptions([allowed], 600));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an allowed preflight with the CORS headers', async () => {
    const res = await request(app.getHttpServer())
      .options('/probe')
      .set('Origin', allowed)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(allowed);
    expect(res.headers['access-control-allow-methods']).toBe('GET,POST,OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type,X-Request-Id',
    );
    expect(res.headers['access-control-max-age']).toBe('600');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('exposes X-Cache and X-Request-Id to allowed origins', async () => {
    const res = await request(app.getHttpServer()).get('/probe').set('Origin', allowed);
    expect(res.headers['access-control-allow-origin']).toBe(allowed);
    expect(res.headers['access-control-expose-headers']).toBe('X-Cache,X-Request-Id');
  });

  it('does not allow an origin outside the allowlist', async () => {
    const res = await request(app.getHttpServer())
      .options('/probe')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
