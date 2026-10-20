// Plantilla del harness → src/common/monitor/monitor-widget.interface.ts
export interface MonitorValue {
  /** Main figure shown on the card. Never secrets, SQL, driver errors or business data. */
  value: string | number;
  /** Optional breakdown (label → value). */
  detail?: ReadonlyArray<{ label: string; value: string | number }>;
}

export interface MonitorWidget {
  readonly id: string;
  readonly title: string;
  /** Ascending position on the page. */
  readonly order: number;
  collect(): Promise<MonitorValue>;
}

/** Multi-provider token: every widget registered in MonitorModule. */
export const MONITOR_WIDGETS = Symbol('MONITOR_WIDGETS');
