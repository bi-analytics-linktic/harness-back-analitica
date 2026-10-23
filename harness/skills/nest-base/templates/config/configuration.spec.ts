// Plantilla del harness → src/config/configuration.spec.ts
import { buildConfiguration, Env } from './configuration';

const base: Env = {
  DATABASES: 'MAIN',
  DB_MAIN_HOST: 'localhost',
  DB_MAIN_NAME: 'analytics',
  DB_MAIN_USER: 'readonly_user',
  DB_MAIN_PASSWORD: 'change-me',
  ACCESS_TOKEN: 'example123',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  CORS_ORIGINS: 'http://localhost:4200',
};

describe('buildConfiguration', () => {
  it('groups variables by topic and applies non-sensitive defaults', () => {
    const config = buildConfiguration(base);
    expect(config.app).toEqual({ nodeEnv: 'development', port: 3000 });
    expect(config.databases.MAIN).toEqual({
      host: 'localhost',
      port: 5432,
      name: 'analytics',
      user: 'readonly_user',
      password: 'change-me',
      ssl: false,
      poolMax: 10,
      statementTimeoutMs: 30000,
    });
    expect(config.cache.enabled).toBe(false);
    expect(config.auth.jwt.accessExpiresIn).toBe('15m');
    expect(config.cors).toEqual({ origins: ['http://localhost:4200'], maxAgeSeconds: 600 });
    expect(config.monitor).toEqual({ enabled: false, sessionExpiresIn: '15m' });
  });

  it('converts numbers, booleans and one block per database', () => {
    const config = buildConfiguration({
      ...base,
      PORT: '8080',
      DATABASES: 'MAIN, reports',
      DB_MAIN_SSL: 'true',
      DB_REPORTS_HOST: 'replica',
      DB_REPORTS_PORT: '6432',
      DB_REPORTS_NAME: 'reports',
      DB_REPORTS_USER: 'ro',
      DB_REPORTS_PASSWORD: 'x',
      CACHE_ENABLED: 'true',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(config.app.port).toBe(8080);
    expect(config.databases.MAIN.ssl).toBe(true);
    expect(config.databases.REPORTS.port).toBe(6432);
    expect(config.cache).toMatchObject({ enabled: true, redisUrl: 'redis://localhost:6379' });
  });

  it.each(['ACCESS_TOKEN', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DB_MAIN_PASSWORD'])(
    'fails without the secret %s and does not print any value',
    (name) => {
      const env = { ...base, [name]: '' };
      expect(() => buildConfiguration(env)).toThrow(`${name} is required`);
    },
  );

  it('requires REDIS_URL only when the cache is enabled', () => {
    expect(() => buildConfiguration({ ...base, CACHE_ENABLED: 'true' })).toThrow(
      'REDIS_URL is required',
    );
  });

  it.each([
    ['PORT', 'abc', /integer/],
    ['MONITOR_ENABLED', 'yes', /true or false/],
  ])('rejects %s=%p', (name, value, message) => {
    expect(() => buildConfiguration({ ...base, [name]: value })).toThrow(message);
  });
});
