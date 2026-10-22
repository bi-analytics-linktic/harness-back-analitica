// Plantilla del harness → src/common/monitor/monitor.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MONITOR_WIDGET_TIMEOUT_MS } from './monitor.constants';
import { MONITOR_WIDGETS, MonitorValue, MonitorWidget } from './monitor-widget.interface';

export interface MonitorCard {
  id: string;
  title: string;
  status: 'ok' | 'unavailable';
  value?: MonitorValue;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(@Inject(MONITOR_WIDGETS) private readonly widgets: MonitorWidget[]) {}

  /** A failing or slow widget becomes "unavailable"; the page always renders. */
  async collect(): Promise<MonitorCard[]> {
    const ordered = [...this.widgets].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    return Promise.all(
      ordered.map(async (widget): Promise<MonitorCard> => {
        const { id, title } = widget;
        try {
          const value = await withTimeout(
            Promise.resolve().then(() => widget.collect()),
            MONITOR_WIDGET_TIMEOUT_MS,
          );
          return { id, title, status: 'ok', value };
        } catch (error) {
          // Only the error type: messages may carry SQL, hosts or data.
          this.logger.warn(
            `Monitor widget "${id}" unavailable (${error instanceof Error ? error.name : 'unknown'})`,
          );
          return { id, title, status: 'unavailable' };
        }
      }),
    );
  }
}
