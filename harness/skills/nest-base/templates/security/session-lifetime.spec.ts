// Plantilla del harness → src/common/security/session-lifetime.spec.ts
import { AUTH_TIME_CLAIM, isSessionExpired, nowInSeconds, sessionClaims } from './session-lifetime';

describe('session lifetime', () => {
  const maxAge = 3600;

  it('keeps the session alive until it reaches the max age', () => {
    const claims = sessionClaims(1000);
    expect(claims).toEqual({ [AUTH_TIME_CLAIM]: 1000 });
    expect(isSessionExpired(claims, maxAge, 1000 + maxAge - 1)).toBe(false);
    expect(isSessionExpired(claims, maxAge, 1000 + maxAge)).toBe(true);
  });

  it('treats tokens without auth_time as expired', () => {
    expect(isSessionExpired({}, maxAge, 1000)).toBe(true);
  });

  it('converts milliseconds to JWT seconds', () => {
    expect(nowInSeconds(1_700_000_000_999)).toBe(1_700_000_000);
  });
});
