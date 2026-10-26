// Plantilla del harness → src/common/security/login-attempts.ts (AGENTS.md §8, contrato-http.md "Límite de intentos").
// Counts failed logins per client in memory: one counter per instance, never depends on Redis.
// /auth/login and /monitor/login share it.

export interface LoginAttemptOptions {
  maxAttempts: number;
  windowSeconds: number;
  /** Upper bound of tracked clients, so an attacker cannot grow the map without limit. */
  maxTrackedClients?: number;
}

export interface LoginAttemptStatus {
  allowed: boolean;
  /** Seconds until the client can try again (0 when allowed). Goes to the Retry-After header. */
  retryAfterSeconds: number;
}

interface Failures {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_TRACKED_CLIENTS = 10000;

export class LoginAttemptLimiter {
  private readonly failures = new Map<string, Failures>();
  private readonly maxTrackedClients: number;

  constructor(
    private readonly options: LoginAttemptOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.maxTrackedClients = options.maxTrackedClients ?? DEFAULT_MAX_TRACKED_CLIENTS;
  }

  /** Call before comparing the password: a blocked client gets 429 without checking it. */
  check(client: string): LoginAttemptStatus {
    const entry = this.current(client);
    if (!entry || entry.count < this.options.maxAttempts) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return { allowed: false, retryAfterSeconds: this.secondsUntil(entry.resetAt) };
  }

  /** Call after a wrong password. The window starts at the first failure. */
  registerFailure(client: string): LoginAttemptStatus {
    const entry = this.current(client);
    if (entry) {
      entry.count += 1;
    } else {
      this.makeRoom();
      this.failures.set(client, {
        count: 1,
        resetAt: this.now() + this.options.windowSeconds * 1000,
      });
    }
    return this.check(client);
  }

  /** Call after a successful login. */
  reset(client: string): void {
    this.failures.delete(client);
  }

  private current(client: string): Failures | undefined {
    const entry = this.failures.get(client);
    if (entry && entry.resetAt <= this.now()) {
      this.failures.delete(client);
      return undefined;
    }
    return entry;
  }

  private makeRoom(): void {
    if (this.failures.size < this.maxTrackedClients) return;
    const now = this.now();
    for (const [client, entry] of this.failures) {
      if (entry.resetAt <= now) this.failures.delete(client);
    }
    // Still full: drop the oldest entry (Map keeps insertion order).
    if (this.failures.size >= this.maxTrackedClients) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
  }

  private secondsUntil(timestamp: number): number {
    return Math.max(1, Math.ceil((timestamp - this.now()) / 1000));
  }
}
