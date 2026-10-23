// Plantilla del harness → src/common/logging/logger-options.spec.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildLoggerParams, parseLogFormat, REDACT_PATHS, requestId } from './logger-options';

type PinoHttpOptions = Exclude<NonNullable<ReturnType<typeof buildLoggerParams>['pinoHttp']>, unknown[]>;
const options = (params: ReturnType<typeof buildLoggerParams>): PinoHttpOptions =>
  params.pinoHttp as PinoHttpOptions;

describe('parseLogFormat', () => {
  it('defaults to json and accepts pretty outside production', () => {
    expect(parseLogFormat(undefined, 'production')).toBe('json');
    expect(parseLogFormat(' Pretty ', 'development')).toBe('pretty');
  });

  it('rejects unknown formats and pretty in production', () => {
    expect(() => parseLogFormat('xml', 'development')).toThrow('json or pretty');
    expect(() => parseLogFormat('pretty', 'production')).toThrow('not allowed');
  });
});

describe('buildLoggerParams', () => {
  it('json: no transport and the same redaction as pretty', () => {
    const json = options(buildLoggerParams({ level: 'info', format: 'json' }, true));
    const pretty = options(buildLoggerParams({ level: 'debug', format: 'pretty' }, true));
    expect(json.transport).toBeUndefined();
    expect(pretty.transport).toEqual(expect.objectContaining({ target: 'pino-pretty' }));
    expect(json.redact).toEqual(pretty.redact);
    expect(REDACT_PATHS).toEqual(
      expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie', '*.password']),
    );
  });

  it('falls back to json when pino-pretty is not installed', () => {
    expect(options(buildLoggerParams({ level: 'info', format: 'pretty' }, false)).transport).toBeUndefined();
  });
});

describe('requestId', () => {
  const call = (header?: string): { id: string; sent: string } => {
    const res = { setHeader: jest.fn() };
    const id = requestId(
      { headers: header === undefined ? {} : { 'x-request-id': header } } as IncomingMessage,
      res as unknown as ServerResponse,
    );
    return { id, sent: res.setHeader.mock.calls[0][1] as string };
  };

  it('reuses a safe X-Request-Id and returns it in the response', () => {
    expect(call('abc-123')).toEqual({ id: 'abc-123', sent: 'abc-123' });
  });

  it.each([undefined, '', 'bad id <script>', 'x'.repeat(129)])('generates a UUID for %p', (header) => {
    const { id, sent } = call(header);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent).toBe(id);
  });
});
