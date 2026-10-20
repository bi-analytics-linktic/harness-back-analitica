// Plantilla del harness → src/common/monitor/monitor-session.service.spec.ts
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MonitorSessionService, readCookie } from './monitor-session.service';

const env: Record<string, string> = {
  MONITOR_ENABLED: 'true',
  ACCESS_TOKEN: 'example123',
  JWT_ACCESS_SECRET: 'test-access-secret-with-enough-length',
  MONITOR_SESSION_EXPIRES_IN: '10m',
};
const config = (overrides: Record<string, string> = {}): ConfigService =>
  new ConfigService({ ...env, ...overrides });

describe('MonitorSessionService', () => {
  const jwt = new JwtService({});
  const service = new MonitorSessionService(config(), jwt);

  it('is disabled unless MONITOR_ENABLED is true', () => {
    expect(service.isEnabled()).toBe(true);
    expect(new MonitorSessionService(config({ MONITOR_ENABLED: 'false' }), jwt).isEnabled()).toBe(
      false,
    );
  });

  it('compares the password with ACCESS_TOKEN', () => {
    expect(service.verifyPassword('example123')).toBe(true);
    expect(service.verifyPassword('example12')).toBe(false);
    expect(new MonitorSessionService(config({ ACCESS_TOKEN: '' }), jwt).verifyPassword('')).toBe(
      false,
    );
  });

  it('issues an HttpOnly, Secure, SameSite=Strict cookie scoped to /monitor', async () => {
    const cookie = await service.createSessionCookie();
    expect(cookie).toMatch(
      /^arness_monitor=[\w-]+\.[\w-]+\.[\w-]+; Max-Age=600; Path=\/monitor; HttpOnly; Secure; SameSite=Strict$/,
    );
    expect(await service.hasValidSession(cookie.split(';')[0])).toBe(true);
  });

  it('rejects missing, tampered and non-monitor tokens', async () => {
    const accessToken = await jwt.signAsync({ type: 'access' }, { secret: env.JWT_ACCESS_SECRET });
    expect(await service.hasValidSession(undefined)).toBe(false);
    expect(await service.hasValidSession('arness_monitor=abc.def.ghi')).toBe(false);
    expect(await service.hasValidSession(`arness_monitor=${accessToken}`)).toBe(false);
  });

  it('clears the cookie on logout', () => {
    expect(service.clearSessionCookie()).toContain('arness_monitor=; Max-Age=0; Path=/monitor');
  });

  it('reads a cookie from the header', () => {
    expect(readCookie('a=1; arness_monitor=xyz; b=2', 'arness_monitor')).toBe('xyz');
    expect(readCookie(undefined, 'arness_monitor')).toBeUndefined();
  });
});
