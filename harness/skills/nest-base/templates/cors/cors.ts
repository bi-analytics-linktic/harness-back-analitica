// Plantilla del harness → src/config/cors.ts (AGENTS.md §9, harness/reference/contrato-http.md "CORS").
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const CORS_METHODS = ['GET', 'POST', 'OPTIONS'];
export const CORS_ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'X-Request-Id'];
export const CORS_EXPOSED_HEADERS = ['X-Cache', 'X-Request-Id'];
export const CORS_DEFAULT_MAX_AGE_SECONDS = 600;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Parses CORS_ORIGINS (comma separated) into exact origins.
 * Throws on an empty list, wildcards, values that are not an origin, or http:// outside localhost.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  const items = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new Error('CORS_ORIGINS is required: list the allowed origins separated by commas');
  }
  return [
    ...new Set(
      items.map((item) => {
        if (item.includes('*')) {
          throw new Error(`CORS_ORIGINS does not accept wildcards: ${item}`);
        }
        let url: URL;
        try {
          url = new URL(item);
        } catch {
          throw new Error(`CORS_ORIGINS has an invalid origin: ${item}`);
        }
        if (url.origin === 'null' || url.origin !== item.replace(/\/$/, '')) {
          throw new Error(`CORS_ORIGINS must contain origins only (scheme://host[:port]): ${item}`);
        }
        if (
          url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
        ) {
          throw new Error(`CORS_ORIGINS requires https:// except for localhost: ${item}`);
        }
        return url.origin;
      }),
    ),
  ];
}

/** Parses CORS_MAX_AGE_SECONDS; defaults to 600 seconds. */
export function parseCorsMaxAge(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return CORS_DEFAULT_MAX_AGE_SECONDS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 86400) {
    throw new Error('CORS_MAX_AGE_SECONDS must be an integer between 0 and 86400');
  }
  return value;
}

/** Options for app.enableCors(): only origins in the allowlist get Access-Control-Allow-Origin. */
export function buildCorsOptions(origins: readonly string[], maxAgeSeconds: number): CorsOptions {
  const allowed = new Set(origins);
  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ): void => callback(null, origin !== undefined && allowed.has(origin)),
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: false,
    maxAge: maxAgeSeconds,
    optionsSuccessStatus: 204,
  };
}
