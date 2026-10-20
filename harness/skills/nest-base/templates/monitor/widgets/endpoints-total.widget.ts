// Plantilla del harness → src/common/monitor/widgets/endpoints-total.widget.ts
import { Injectable } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { MONITOR_EXCLUDED_SEGMENTS } from '../monitor.constants';
import { MonitorValue, MonitorWidget } from '../monitor-widget.interface';

const toPaths = (value: string | string[] | undefined): string[] =>
  (Array.isArray(value) ? value : [value ?? '']).map((path) => path.replace(/^\/+|\/+$/g, ''));

/** Counts the HTTP routes of the API (excluding monitor, health and auth), grouped by module segment. */
@Injectable()
export class EndpointsTotalWidget implements MonitorWidget {
  readonly id = 'endpoints-total';
  readonly title = 'Endpoints de la API';
  readonly order = 10;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  collect(): Promise<MonitorValue> {
    const byModule = new Map<string, number>();
    for (const { metatype, instance } of this.discovery.getControllers()) {
      if (!metatype || !instance) continue;
      const prefixes = toPaths(
        this.reflector.get<string | string[] | undefined>(PATH_METADATA, metatype),
      );
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== 'function') continue;
        if (this.reflector.get<number | undefined>(METHOD_METADATA, handler) === undefined)
          continue;
        for (const prefix of prefixes) {
          for (const path of toPaths(
            this.reflector.get<string | string[] | undefined>(PATH_METADATA, handler),
          )) {
            const segment = [prefix, path].filter(Boolean).join('/').split('/')[0] || '/';
            if (MONITOR_EXCLUDED_SEGMENTS.has(segment)) continue;
            byModule.set(segment, (byModule.get(segment) ?? 0) + 1);
          }
        }
      }
    }
    const detail = [...byModule.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));
    return Promise.resolve({ value: detail.reduce((sum, item) => sum + item.value, 0), detail });
  }
}
