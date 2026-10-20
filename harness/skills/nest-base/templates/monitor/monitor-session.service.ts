// Plantilla del harness → src/common/monitor/monitor-session.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  MONITOR_COOKIE,
  MONITOR_DEFAULT_SESSION_EXPIRES_IN,
  MONITOR_HOME_URL,
  MONITOR_TOKEN_TYPE,
} from './monitor.constants';

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Reads one cookie from a raw Cookie header without extra dependencies. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

@Injectable()
export class MonitorSessionService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  isEnabled(): boolean {
    const value = this.config.get<unknown>('MONITOR_ENABLED');
    return value === true || value === 'true';
  }

  /** Same comparison as /auth/login: sha256 of both values and timingSafeEqual. */
  verifyPassword(candidate: string): boolean {
    const expected = this.config.get<string>('ACCESS_TOKEN') ?? '';
    return expected.length > 0 && timingSafeEqual(sha256(candidate), sha256(expected));
  }

  async createSessionCookie(): Promise<string> {
    const expiresIn = (this.config.get<string>('MONITOR_SESSION_EXPIRES_IN') ||
      MONITOR_DEFAULT_SESSION_EXPIRES_IN) as JwtSignOptions['expiresIn'];
    const token = await this.jwt.signAsync(
      { type: MONITOR_TOKEN_TYPE },
      { secret: this.secret(), expiresIn },
    );
    const { exp, iat } = this.jwt.decode<{ exp: number; iat: number }>(token);
    return this.cookie(token, exp - iat);
  }

  clearSessionCookie(): string {
    return this.cookie('', 0);
  }

  async hasValidSession(cookieHeader: string | undefined): Promise<boolean> {
    const token = readCookie(cookieHeader, MONITOR_COOKIE);
    if (!token) return false;
    try {
      const payload = await this.jwt.verifyAsync<{ type?: string }>(token, {
        secret: this.secret(),
      });
      return payload.type === MONITOR_TOKEN_TYPE;
    } catch {
      return false;
    }
  }

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private cookie(value: string, maxAgeSeconds: number): string {
    return `${MONITOR_COOKIE}=${value}; Max-Age=${maxAgeSeconds}; Path=${MONITOR_HOME_URL}; HttpOnly; Secure; SameSite=Strict`;
  }
}
