// Plantilla del harness → src/common/monitor/monitor.constants.ts (AGENTS.md §10).
export const MONITOR_PATH = 'monitor';
export const MONITOR_LOGIN_URL = `/${MONITOR_PATH}/login`;
export const MONITOR_HOME_URL = `/${MONITOR_PATH}`;
export const MONITOR_COOKIE = 'arness_monitor';
export const MONITOR_TOKEN_TYPE = 'monitor';
export const MONITOR_DEFAULT_SESSION_EXPIRES_IN = '15m';
export const MONITOR_WIDGET_TIMEOUT_MS = 2000;

/** Route segments that never count as business endpoints. */
export const MONITOR_EXCLUDED_SEGMENTS: ReadonlySet<string> = new Set([
  MONITOR_PATH,
  'health',
  'auth',
]);

/** Sent on every monitor response: no scripts, no framing, no caching. */
export const MONITOR_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});
