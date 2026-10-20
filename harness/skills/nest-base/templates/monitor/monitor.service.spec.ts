// Plantilla del harness → src/common/monitor/monitor.service.spec.ts
import { Test } from '@nestjs/testing';
import { MONITOR_WIDGETS, MonitorWidget } from './monitor-widget.interface';
import { MonitorService } from './monitor.service';

const widget = (id: string, order: number, collect: MonitorWidget['collect']): MonitorWidget => ({
  id,
  title: id,
  order,
  collect,
});

describe('MonitorService', () => {
  const build = async (widgets: MonitorWidget[]): Promise<MonitorService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [MonitorService, { provide: MONITOR_WIDGETS, useValue: widgets }],
    }).compile();
    return moduleRef.get(MonitorService);
  };

  it('returns the widgets ordered by order', async () => {
    const service = await build([
      widget('b', 20, () => Promise.resolve({ value: 2 })),
      widget('a', 10, () => Promise.resolve({ value: 1 })),
    ]);
    expect((await service.collect()).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('marks a failing widget as unavailable without exposing the error', async () => {
    const service = await build([
      widget('ok', 1, () => Promise.resolve({ value: 7 })),
      widget('broken', 2, () =>
        Promise.reject(new Error('password authentication failed for user "x"')),
      ),
      widget('throws', 3, () => {
        throw new Error('sync');
      }),
    ]);
    const cards = await service.collect();
    expect(cards).toEqual([
      { id: 'ok', title: 'ok', status: 'ok', value: { value: 7 } },
      { id: 'broken', title: 'broken', status: 'unavailable' },
      { id: 'throws', title: 'throws', status: 'unavailable' },
    ]);
  });

  it('marks a slow widget as unavailable', async () => {
    jest.useFakeTimers();
    const service = await build([widget('slow', 1, () => new Promise(() => undefined))]);
    const pending = service.collect();
    await jest.advanceTimersByTimeAsync(2000);
    expect((await pending)[0].status).toBe('unavailable');
    jest.useRealTimers();
  });
});
