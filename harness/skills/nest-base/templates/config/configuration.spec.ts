// Plantilla del harness → src/config/configuration.spec.ts
import { buildConfiguration, type Env } from './configuration';

const base: Env = {
  DATABASES: 'MAIN',
  DB_MAIN_HOST: 'localhost',
  DB_MAIN_NAME: 'analytics',
  DB_MAIN_USER: 'readonly_user',
  DB_MAIN_PASSWORD: 'change-me',
  CORS_ORIGINS: 'http://localhost:4200',
};

describe('buildConfiguration', () => {
  it('groups variables by topic and applies non-sensitive defaults', () => {
    const config = buildConfiguration(base);
    expect(config.app).toEqual({ nodeEnv: 'development', port: 3000, trustProxy: undefined });
    expect(config.logging).toEqual({ level: 'info', format: 'json' });
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
    expect(config.cors).toEqual({ origins: ['http://localhost:4200'], maxAgeSeconds: 600 });
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

  it('fails without the secret DB_MAIN_PASSWORD and does not print any value', () => {
    const env = { ...base, DB_MAIN_PASSWORD: '' };
    expect(() => buildConfiguration(env)).toThrow('DB_MAIN_PASSWORD is required');
  });

  it('accepts trusted proxies by network name or subnet', () => {
    const config = buildConfiguration({ ...base, HTTP_TRUST_PROXY: 'loopback, uniquelocal,10.0.0.0/8' });
    expect(config.app.trustProxy).toBe('loopback, uniquelocal, 10.0.0.0/8');
  });

  it('requires REDIS_URL only when the cache is enabled', () => {
    expect(() => buildConfiguration({ ...base, CACHE_ENABLED: 'true' })).toThrow(
      'REDIS_URL is required',
    );
  });

  it('does not allow pretty logs in production', () => {
    expect(() =>
      buildConfiguration({ ...base, NODE_ENV: 'production', LOG_FORMAT: 'pretty' }),
    ).toThrow('not allowed');
  });

  it.each([
    ['PORT', 'abc', /integer/],
    ['CACHE_ENABLED', 'yes', /true or false/],
    ['LOG_FORMAT', 'xml', /json or pretty/],
    ['HTTP_TRUST_PROXY', 'true', /never true or a hop count/],
    ['HTTP_TRUST_PROXY', '1', /never true or a hop count/],
    ['HTTP_TRUST_PROXY', '10.0.0.0/33', /never true or a hop count/],
  ])('rejects %s=%p', (name, value, message) => {
    expect(() => buildConfiguration({ ...base, [name]: value })).toThrow(message);
  });
});
