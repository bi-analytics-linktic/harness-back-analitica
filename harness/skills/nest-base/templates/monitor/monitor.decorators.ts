// Plantilla del harness → src/common/monitor/monitor.decorators.ts
import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_MONITOR_ROUTE_KEY = 'arness:monitor-route';
export const IS_MONITOR_LOGIN_KEY = 'arness:monitor-login';

/** Marks the monitor controller: JwtAuthGuard skips it and MonitorSessionGuard protects it instead. */
export const MonitorRoute = (): CustomDecorator<string> => SetMetadata(IS_MONITOR_ROUTE_KEY, true);

/** Monitor handlers reachable without a session (login form, login and logout). */
export const MonitorLogin = (): CustomDecorator<string> => SetMetadata(IS_MONITOR_LOGIN_KEY, true);
