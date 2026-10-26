// Plantilla del harness → src/common/monitor/monitor.controller.ts
import { Body, Controller, Get, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginAttemptLimiter } from '../security/login-attempts';
import {
  MONITOR_HOME_URL,
  MONITOR_LOGIN_URL,
  MONITOR_PATH,
  MONITOR_SECURITY_HEADERS,
} from './monitor.constants';
import { MonitorLogin, MonitorRoute } from './monitor.decorators';
import { MonitorLoginRedirectFilter } from './monitor-login-redirect.filter';
import { MonitorLoginDto } from './monitor-login.dto';
import { renderLoginPage, renderMonitorPage } from './monitor-page';
import { MonitorSessionGuard } from './monitor-session.guard';
import { MonitorSessionService } from './monitor-session.service';
import { MonitorService } from './monitor.service';

function sendHtml(res: Response, status: number, html: string): void {
  res.status(status).set(MONITOR_SECURITY_HEADERS).type('html').send(html);
}

/** Fuera de /api/v1. No es @Public(): lo protege MonitorSessionGuard con cookie, no el Bearer. */
@MonitorRoute()
@UseGuards(MonitorSessionGuard)
@UseFilters(MonitorLoginRedirectFilter)
@Controller(MONITOR_PATH)
export class MonitorController {
  constructor(
    private readonly monitor: MonitorService,
    private readonly session: MonitorSessionService,
    private readonly attempts: LoginAttemptLimiter,
  ) {}

  @Get()
  async page(@Res() res: Response): Promise<void> {
    sendHtml(res, 200, renderMonitorPage(await this.monitor.collect(), new Date()));
  }

  @MonitorLogin()
  @Get('login')
  loginForm(@Res() res: Response): void {
    sendHtml(res, 200, renderLoginPage());
  }

  @MonitorLogin()
  @Post('login')
  async login(
    @Body() body: MonitorLoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Same limiter as /auth/login (contrato-http.md, Límite de intentos).
    const client = req.ip ?? 'unknown';
    const status = this.attempts.check(client);
    if (!status.allowed) {
      const minutes = Math.ceil(status.retryAfterSeconds / 60);
      res.setHeader('Retry-After', String(status.retryAfterSeconds));
      sendHtml(
        res,
        429,
        renderLoginPage(`Demasiados intentos. Intenta de nuevo en ${minutes} min.`),
      );
      return;
    }
    if (!this.session.verifyPassword(body.password)) {
      this.attempts.registerFailure(client);
      sendHtml(res, 401, renderLoginPage('Contraseña incorrecta'));
      return;
    }
    this.attempts.reset(client);
    res
      .set(MONITOR_SECURITY_HEADERS)
      .setHeader('Set-Cookie', await this.session.createSessionCookie());
    res.redirect(303, MONITOR_HOME_URL);
  }

  @MonitorLogin()
  @Post('logout')
  logout(@Res() res: Response): void {
    res.set(MONITOR_SECURITY_HEADERS).setHeader('Set-Cookie', this.session.clearSessionCookie());
    res.redirect(303, MONITOR_LOGIN_URL);
  }
}
