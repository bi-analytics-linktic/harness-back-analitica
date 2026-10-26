// Plantilla del harness → src/config/auth.spec.ts
import { parseAuthConfig } from './auth';

const base = {
  ACCESS_TOKEN: 'example123',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
};

describe('parseAuthConfig', () => {
  it('applies non-sensitive defaults', () => {
    const auth = parseAuthConfig(base);
    expect(auth.jwt).toEqual({
      accessSecret: 'access-secret',
      accessExpiresIn: '15m',
      refreshSecret: 'refresh-secret',
      refreshExpiresIn: '7d',
    });
    expect(auth.login).toEqual({ maxAttempts: 5, windowSeconds: 900 });
    expect(auth.sessionMaxAgeSeconds).toBe(43200);
  });

  it.each([
    [{ ACCESS_TOKEN: undefined }, /ACCESS_TOKEN is required/],
    [{ JWT_REFRESH_SECRET: ' ' }, /JWT_REFRESH_SECRET is required/],
    [{ AUTH_LOGIN_MAX_ATTEMPTS: '0' }, /AUTH_LOGIN_MAX_ATTEMPTS must be an integer/],
    [{ AUTH_LOGIN_WINDOW_SECONDS: 'abc' }, /AUTH_LOGIN_WINDOW_SECONDS must be an integer/],
    [{ AUTH_SESSION_MAX_AGE_SECONDS: '30' }, /AUTH_SESSION_MAX_AGE_SECONDS must be an integer/],
  ])('rejects %p', (overrides, message) => {
    expect(() => parseAuthConfig({ ...base, ...overrides })).toThrow(message);
  });
});
