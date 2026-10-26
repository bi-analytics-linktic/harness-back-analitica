// Plantilla del harness → src/common/security/session-lifetime.ts (AGENTS.md §8, contrato-http.md "Autenticación").
// A session starts at /auth/login and lasts at most AUTH_SESSION_MAX_AGE_SECONDS, however many
// times it is refreshed: a stolen refresh token stops working when the session reaches that age.

/** Claim with the login time (seconds since epoch). The refresh copies it into the new pair. */
export const AUTH_TIME_CLAIM = 'auth_time';

export interface SessionClaims {
  [AUTH_TIME_CLAIM]?: number;
}

/** Current time in seconds, as JWT iat/exp. */
export const nowInSeconds = (now: number = Date.now()): number => Math.floor(now / 1000);

/** Claims for a new pair: login starts a session; refresh keeps the original auth_time. */
export function sessionClaims(authTime: number): Required<SessionClaims> {
  return { [AUTH_TIME_CLAIM]: authTime };
}

/** True if the refresh must be rejected with 401 SESSION_EXPIRED. Tokens without auth_time count as expired. */
export function isSessionExpired(
  claims: SessionClaims,
  maxAgeSeconds: number,
  now: number = nowInSeconds(),
): boolean {
  const authTime = claims[AUTH_TIME_CLAIM];
  return typeof authTime !== 'number' || now - authTime >= maxAgeSeconds;
}
