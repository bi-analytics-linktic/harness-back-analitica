// Plantilla del harness → src/common/monitor/monitor.module.ts
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MonitorController } from './monitor.controller';
import { MonitorSessionGuard } from './monitor-session.guard';
import { MonitorSessionService } from './monitor-session.service';
import { MonitorService } from './monitor.service';
import { MONITOR_WIDGETS, MonitorWidget } from './monitor-widget.interface';
import { EndpointsTotalWidget } from './widgets/endpoints-total.widget';

/** Widgets del tablero: agrega la clase a WIDGETS (playbook new-monitor-widget). */
const WIDGETS = [EndpointsTotalWidget];

@Module({
  imports: [DiscoveryModule, JwtModule.register({})],
  controllers: [MonitorController],
  providers: [
    MonitorService,
    MonitorSessionService,
    MonitorSessionGuard,
    ...WIDGETS,
    {
      provide: MONITOR_WIDGETS,
      useFactory: (...widgets: MonitorWidget[]): MonitorWidget[] => widgets,
      inject: WIDGETS,
    },
  ],
})
export class MonitorModule {}
