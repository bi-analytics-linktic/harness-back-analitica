// Plantilla del harness → src/common/monitor/monitor-login-redirect.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { MONITOR_LOGIN_URL, MONITOR_SECURITY_HEADERS } from './monitor.constants';
import { MonitorLoginRequiredException } from './monitor-session.guard';

@Catch(MonitorLoginRequiredException)
export class MonitorLoginRedirectFilter implements ExceptionFilter {
  catch(_exception: MonitorLoginRequiredException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .set(MONITOR_SECURITY_HEADERS)
      .redirect(303, MONITOR_LOGIN_URL);
  }
}
