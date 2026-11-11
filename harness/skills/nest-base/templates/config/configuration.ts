// Plantilla del harness → src/config/configuration.ts (AGENTS.md §14, harness/reference/configuracion.md).
// Single place in the project that reads process.env. The rest of the code receives AppConfig
// through ConfigService<AppConfig, true>. Variables are validated at startup (env validation in
// src/config/); this file only groups them and converts their types.
import { isIP } from 'node:net';
import { type LogFormat, parseLogFormat } from '../common/logging/logger-options';
import { parseCorsMaxAge, parseCorsOrigins } from './cors';

export type Env = Record<string, string | undefined>;

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
  poolMax: number;
  statementTimeoutMs: number;
}

export interface AppConfig {
  app: { nodeEnv: string; port: number; trustProxy: string | undefined };
  logging: { level: string; format: LogFormat };
  databases: Record<string, DatabaseConfig>;
  cache: {
    enabled: boolean;
    redisUrl: string | undefined;
    defaultTtlSeconds: number;
    keyPrefix: string;
    opTimeoutMs: number;
  };
  cors: { origins: string[]; maxAgeSeconds: number };
}

/** Required variable. The error names the variable, never its value. Secrets have no default. */
export function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Optional text variable with a non-sensitive default. */
export function text(env: Env, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

export function int(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

export function bool(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

/** DATABASES=MAIN,REPORTS → one block per name, read from DB_<NAME>_*. */
export function parseDatabases(env: Env): Record<string, DatabaseConfig> {
  const names = required(env, 'DATABASES')
    .split(',')
    .map((name) => name.trim().toUpperCase())
    .filter(Boolean);
  return Object.fromEntries(
    names.map((name): [string, DatabaseConfig] => {
      const key = (part: string): string => `DB_${name}_${part}`;
      return [
        name,
        {
          host: required(env, key('HOST')),
          port: int(env, key('PORT'), 5432),
          name: required(env, key('NAME')),
          user: required(env, key('USER')),
          password: required(env, key('PASSWORD')),
          ssl: bool(env, key('SSL'), false),
          poolMax: int(env, key('POOL_MAX'), 10),
          statementTimeoutMs: int(env, key('STATEMENT_TIMEOUT_MS'), 30000),
        },
      ];
    }),
  );
}

export const TRUST_PROXY_NAMES: readonly string[] = ['loopback', 'linklocal', 'uniquelocal'];

/** IPv4/IPv6 address, optionally with a CIDR prefix (10.0.0.0/8, fd00::/8). */
function isIpOrSubnet(value: string): boolean {
  const [ip, bits, ...rest] = value.split('/');
  const version = isIP(ip);
  if (version === 0 || rest.length > 0) return false;
  if (bits === undefined) return true;
  const prefix = Number(bits);
  return /^\d+$/.test(bits) && prefix <= (version === 4 ? 32 : 128);
}

/**
 * Trusted proxies in front of the app (Express 'trust proxy'): loopback, linklocal, uniquelocal or
 * IP/CIDR subnets, comma separated. Empty = none, req.ip is the socket address.
 * Never true nor a hop count: anyone reaching the app directly could forge X-Forwarded-For.
 */
export function parseTrustProxy(env: Env): string | undefined {
  const items = text(env, 'HTTP_TRUST_PROXY', '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) return undefined;
  for (const item of items) {
    if (!TRUST_PROXY_NAMES.includes(item) && !isIpOrSubnet(item)) {
      throw new Error(
        'HTTP_TRUST_PROXY accepts loopback, linklocal, uniquelocal or IP/CIDR subnets (never true or a hop count)',
      );
    }
  }
  return items.join(', ');
}

/** Pure: builds the configuration from an env object (tests pass their own). */
export function buildConfiguration(env: Env): AppConfig {
  const cacheEnabled = bool(env, 'CACHE_ENABLED', false);
  const nodeEnv = text(env, 'NODE_ENV', 'development');
  return {
    app: { nodeEnv, port: int(env, 'PORT', 3000), trustProxy: parseTrustProxy(env) },
    logging: {
      level: text(env, 'LOG_LEVEL', 'info'),
      format: parseLogFormat(env.LOG_FORMAT, nodeEnv),
    },
    databases: parseDatabases(env),
    cache: {
      enabled: cacheEnabled,
      redisUrl: cacheEnabled ? required(env, 'REDIS_URL') : env.REDIS_URL,
      defaultTtlSeconds: int(env, 'CACHE_DEFAULT_TTL_SECONDS', 300),
      keyPrefix: text(env, 'CACHE_KEY_PREFIX', 'arness'),
      opTimeoutMs: int(env, 'CACHE_OP_TIMEOUT_MS', 200),
    },
    cors: {
      origins: parseCorsOrigins(env.CORS_ORIGINS),
      maxAgeSeconds: parseCorsMaxAge(env.CORS_MAX_AGE_SECONDS),
    },
  };
}

/** Factory for ConfigModule.forRoot({ load: [configuration] }). */
export default (): AppConfig => buildConfiguration(process.env);
