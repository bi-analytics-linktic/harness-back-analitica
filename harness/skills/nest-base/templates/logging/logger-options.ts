// Plantilla del harness → src/common/logging/logger-options.ts (AGENTS.md §10, harness/reference/contrato-http.md "Logging").
// JSON in production; one readable line per event in local development (LOG_FORMAT=pretty).
// Both formats carry the same fields and the same redaction.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

export const LOG_FORMATS = ['json', 'pretty'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

export interface LoggingConfig {
  level: string;
  format: LogFormat;
}

/** Never logged in any format: credentials, tokens, session cookies and secrets. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.accessToken',
  '*.refreshToken',
  '*.ACCESS_TOKEN',
  '*.JWT_ACCESS_SECRET',
  '*.JWT_REFRESH_SECRET',
];

/** Incoming X-Request-Id is reused only if it is short and safe; otherwise a UUID is generated. */
const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const PRETTY_OPTIONS = {
  colorize: true,
  singleLine: true,
  translateTime: 'SYS:HH:MM:ss',
  ignore: 'pid,hostname,req,res,requestId,responseTime',
  messageFormat: '[{requestId}] {msg}',
};

/** Parses LOG_FORMAT (default json). pretty is rejected with NODE_ENV=production. */
export function parseLogFormat(raw: string | undefined, nodeEnv: string): LogFormat {
  const value = (raw ?? '').trim().toLowerCase() || 'json';
  if (!(LOG_FORMATS as readonly string[]).includes(value)) {
    throw new Error('LOG_FORMAT must be json or pretty');
  }
  if (value === 'pretty' && nodeEnv === 'production') {
    throw new Error('LOG_FORMAT=pretty is not allowed with NODE_ENV=production');
  }
  return value as LogFormat;
}

/** pino-pretty is a devDependency: images built for production do not include it. */
export function isPrettyInstalled(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const incoming = typeof header === 'string' ? header.trim() : '';
  const id = REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Options for LoggerModule.forRootAsync({ useFactory }). Falls back to JSON if pino-pretty is missing. */
export function buildLoggerParams(config: LoggingConfig, prettyInstalled = isPrettyInstalled()): Params {
  const pretty = config.format === 'pretty' && prettyInstalled;
  return {
    pinoHttp: {
      level: config.level,
      genReqId: requestId,
      customProps: (req) => ({ requestId: String(req.id) }),
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
      customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode} failed`,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      ...(pretty ? { transport: { target: 'pino-pretty', options: PRETTY_OPTIONS } } : {}),
    },
  };
}
