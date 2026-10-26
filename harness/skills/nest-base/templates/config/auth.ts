// Plantilla del harness → src/config/auth.ts (AGENTS.md §8, harness/reference/configuracion.md "Autenticación").
// Auth block of AppConfig: secrets (required, no default), login attempt limit and session max age.
// Errors name the variable, never its value.

export const AUTH_DEFAULT_LOGIN_MAX_ATTEMPTS = 5;
export const AUTH_DEFAULT_LOGIN_WINDOW_SECONDS = 900;
export const AUTH_DEFAULT_SESSION_MAX_AGE_SECONDS = 43200;

export interface AuthConfig {
  accessToken: string;
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  login: { maxAttempts: number; windowSeconds: number };
  sessionMaxAgeSeconds: number;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function intInRange(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function text(env: Env, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

/** Pure: reads and validates the auth block. */
export function parseAuthConfig(env: Env): AuthConfig {
  return {
    accessToken: required(env, 'ACCESS_TOKEN'),
    jwt: {
      accessSecret: required(env, 'JWT_ACCESS_SECRET'),
      accessExpiresIn: text(env, 'JWT_ACCESS_EXPIRES_IN', '15m'),
      refreshSecret: required(env, 'JWT_REFRESH_SECRET'),
      refreshExpiresIn: text(env, 'JWT_REFRESH_EXPIRES_IN', '7d'),
    },
    login: {
      maxAttempts: intInRange(
        env,
        'AUTH_LOGIN_MAX_ATTEMPTS',
        AUTH_DEFAULT_LOGIN_MAX_ATTEMPTS,
        1,
        100,
      ),
      windowSeconds: intInRange(
        env,
        'AUTH_LOGIN_WINDOW_SECONDS',
        AUTH_DEFAULT_LOGIN_WINDOW_SECONDS,
        1,
        86400,
      ),
    },
    sessionMaxAgeSeconds: intInRange(
      env,
      'AUTH_SESSION_MAX_AGE_SECONDS',
      AUTH_DEFAULT_SESSION_MAX_AGE_SECONDS,
      60,
      2592000,
    ),
  };
}
