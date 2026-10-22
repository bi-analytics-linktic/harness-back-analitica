// Plantilla del harness → src/common/monitor/monitor-session.guard.spec.ts
import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MonitorLoginRequiredException, MonitorSessionGuard } from './monitor-session.guard';
import { MonitorSessionService } from './monitor-session.service';

const context = (cookie?: string): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers: { cookie } }) }),
  }) as unknown as ExecutionContext;

describe('MonitorSessionGuard', () => {
  const session = { isEnabled: jest.fn(), hasValidSession: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new MonitorSessionGuard(
    reflector as unknown as Reflector,
    session as unknown as MonitorSessionService,
  );

  beforeEach(() => {
    session.isEnabled.mockReturnValue(true);
    session.hasValidSession.mockResolvedValue(false);
    reflector.getAllAndOverride.mockReturnValue(false);
  });

  it('answers 404 when the monitor is disabled', async () => {
    session.isEnabled.mockReturnValue(false);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets login routes through without a session', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('requires a valid session cookie', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      MonitorLoginRequiredException,
    );
    session.hasValidSession.mockResolvedValue(true);
    await expect(guard.canActivate(context('arness_monitor=t'))).resolves.toBe(true);
    expect(session.hasValidSession).toHaveBeenCalledWith('arness_monitor=t');
  });
});
