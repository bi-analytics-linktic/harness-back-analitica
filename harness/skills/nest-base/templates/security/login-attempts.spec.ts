// Plantilla del harness → src/common/security/login-attempts.spec.ts
import { LoginAttemptLimiter } from './login-attempts';

describe('LoginAttemptLimiter', () => {
  let now: number;
  const limiter = (maxTrackedClients?: number): LoginAttemptLimiter =>
    new LoginAttemptLimiter({ maxAttempts: 3, windowSeconds: 60, maxTrackedClients }, () => now);

  beforeEach(() => {
    now = 1_000_000;
  });

  it('blocks a client after maxAttempts failures until the window ends', () => {
    const attempts = limiter();
    expect(attempts.registerFailure('10.0.0.1')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    attempts.registerFailure('10.0.0.1');
    expect(attempts.registerFailure('10.0.0.1')).toEqual({ allowed: false, retryAfterSeconds: 60 });

    now += 59_500;
    expect(attempts.check('10.0.0.1')).toEqual({ allowed: false, retryAfterSeconds: 1 });

    now += 500;
    expect(attempts.check('10.0.0.1')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('counts each client separately', () => {
    const attempts = limiter();
    for (let i = 0; i < 3; i += 1) attempts.registerFailure('10.0.0.1');
    expect(attempts.check('10.0.0.1').allowed).toBe(false);
    expect(attempts.check('10.0.0.2').allowed).toBe(true);
  });

  it('a successful login resets the counter', () => {
    const attempts = limiter();
    attempts.registerFailure('10.0.0.1');
    attempts.registerFailure('10.0.0.1');
    attempts.reset('10.0.0.1');
    expect(attempts.registerFailure('10.0.0.1').allowed).toBe(true);
  });

  it('never tracks more than maxTrackedClients', () => {
    const attempts = limiter(2);
    for (let i = 0; i < 3; i += 1) attempts.registerFailure('10.0.0.1');
    attempts.registerFailure('10.0.0.2');
    attempts.registerFailure('10.0.0.3');
    expect(attempts.check('10.0.0.1').allowed).toBe(true);
  });
});
