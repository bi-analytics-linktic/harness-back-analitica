// Plantilla del harness → src/common/monitor/monitor-session.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_MONITOR_LOGIN_KEY } from './monitor.decorators';
import { MonitorSessionService } from './monitor-session.service';

/** Caught by MonitorLoginRedirectFilter, which redirects to the login form. */
export class MonitorLoginRequiredException extends UnauthorizedException {}

/** Cookie session for /monitor. 404 when MONITOR_ENABLED is not true. */
@Injectable()
export class MonitorSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly session: MonitorSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.session.isEnabled()) throw new NotFoundException();
    const isLogin = this.reflector.getAllAndOverride<boolean>(IS_MONITOR_LOGIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isLogin) return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (await this.session.hasValidSession(request.headers.cookie)) return true;
    throw new MonitorLoginRequiredException();
  }
}
