// Plantilla del harness → src/config/cors.spec.ts
import { buildCorsOptions, parseCorsMaxAge, parseCorsOrigins } from './cors';

describe('parseCorsOrigins', () => {
  it('returns normalized, unique origins', () => {
    expect(
      parseCorsOrigins(' https://app.example.com ,http://localhost:4200,https://app.example.com/'),
    ).toEqual(['https://app.example.com', 'http://localhost:4200']);
  });

  it.each([
    ['', /required/],
    [undefined, /required/],
    ['*', /wildcards/],
    ['https://*.example.com', /wildcards/],
    ['not-a-url', /invalid origin/],
    ['https://app.example.com/path', /origins only/],
    ['http://app.example.com', /https/],
  ])('rejects %p', (raw, message) => {
    expect(() => parseCorsOrigins(raw)).toThrow(message);
  });
});

describe('parseCorsMaxAge', () => {
  it('defaults to 600 and validates the range', () => {
    expect(parseCorsMaxAge(undefined)).toBe(600);
    expect(parseCorsMaxAge('120')).toBe(120);
    expect(() => parseCorsMaxAge('-1')).toThrow();
    expect(() => parseCorsMaxAge('abc')).toThrow();
  });
});

describe('buildCorsOptions', () => {
  const options = buildCorsOptions(['https://app.example.com'], 600);
  const decide = (origin: string | undefined): boolean | undefined => {
    let result: boolean | undefined;
    (
      options.origin as (
        o: string | undefined,
        cb: (e: Error | null, allow?: boolean) => void,
      ) => void
    )(origin, (_err, allow) => (result = allow));
    return result;
  };

  it('allows only origins in the allowlist and never uses credentials', () => {
    expect(decide('https://app.example.com')).toBe(true);
    expect(decide('https://evil.example.com')).toBe(false);
    expect(decide(undefined)).toBe(false);
    expect(options.credentials).toBe(false);
    expect(options.methods).toEqual(['GET', 'POST', 'OPTIONS']);
  });
});
