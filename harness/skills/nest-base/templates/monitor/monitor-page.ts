// Plantilla del harness → src/common/monitor/monitor-page.ts
// HTML renderizado en el servidor con React, sin JSX, sin hidratación y sin JavaScript en el cliente.
import { createElement as h, type CSSProperties, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MONITOR_HOME_URL, MONITOR_LOGIN_URL } from './monitor.constants';
import type { MonitorCard } from './monitor.service';

const color = {
  bg: '#f5f6f8',
  card: '#ffffff',
  text: '#1f2933',
  muted: '#616e7c',
  line: '#e4e7eb',
  accent: '#2457c5',
  warn: '#9a5b00',
};

const styles: Record<string, CSSProperties> = {
  body: {
    margin: 0,
    background: color.bg,
    color: color.text,
    font: '15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 24px',
    background: color.card,
    borderBottom: `1px solid ${color.line}`,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600, flex: 1 },
  muted: { color: color.muted, fontSize: 13 },
  main: {
    padding: 24,
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  },
  card: {
    background: color.card,
    border: `1px solid ${color.line}`,
    borderRadius: 10,
    padding: 16,
  },
  cardTitle: {
    margin: '0 0 8px',
    fontSize: 13,
    fontWeight: 600,
    color: color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: { fontSize: 32, fontWeight: 600, margin: 0 },
  unavailable: { fontSize: 15, color: color.warn, margin: 0 },
  list: { listStyle: 'none', padding: 0, margin: '12px 0 0', borderTop: `1px solid ${color.line}` },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: `1px solid ${color.line}`,
    fontSize: 14,
  },
  button: {
    font: 'inherit',
    padding: '8px 14px',
    borderRadius: 8,
    border: `1px solid ${color.line}`,
    background: color.card,
    color: color.text,
    cursor: 'pointer',
  },
  primary: {
    font: 'inherit',
    padding: '10px 14px',
    borderRadius: 8,
    border: 0,
    background: color.accent,
    color: '#fff',
    cursor: 'pointer',
    width: '100%',
  },
  loginBox: {
    maxWidth: 360,
    margin: '12vh auto',
    background: color.card,
    border: `1px solid ${color.line}`,
    borderRadius: 12,
    padding: 24,
  },
  input: {
    font: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    margin: '6px 0 16px',
    borderRadius: 8,
    border: `1px solid ${color.line}`,
  },
  error: { color: '#b42318', margin: '0 0 12px' },
};

function document(title: string, body: ReactNode): string {
  const html = h(
    'html',
    { lang: 'es' },
    h(
      'head',
      null,
      h('meta', { charSet: 'utf-8' }),
      h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      h('meta', { name: 'robots', content: 'noindex, nofollow' }),
      h('title', null, title),
    ),
    h('body', { style: styles.body }, body),
  );
  return `<!doctype html>${renderToStaticMarkup(html)}`;
}

function card({ id, title, status, value }: MonitorCard): ReactNode {
  return h(
    'section',
    { key: id, style: styles.card, 'data-widget': id },
    h('h2', { style: styles.cardTitle }, title),
    status === 'ok' && value
      ? [
          h('p', { key: 'v', style: styles.value }, String(value.value)),
          value.detail?.length
            ? h(
                'ul',
                { key: 'd', style: styles.list },
                value.detail.map((item) =>
                  h(
                    'li',
                    { key: item.label, style: styles.row },
                    h('span', null, item.label),
                    h('strong', null, String(item.value)),
                  ),
                ),
              )
            : null,
        ]
      : h('p', { style: styles.unavailable }, 'No disponible'),
  );
}

export function renderMonitorPage(cards: readonly MonitorCard[], generatedAt: Date): string {
  return document('Monitor', [
    h(
      'header',
      { key: 'h', style: styles.header },
      h('h1', { style: styles.title }, 'Monitor'),
      h('span', { style: styles.muted }, `Actualizado ${generatedAt.toISOString()}`),
      h(
        'form',
        { method: 'post', action: `${MONITOR_HOME_URL}/logout` },
        h('button', { type: 'submit', style: styles.button }, 'Cerrar sesión'),
      ),
    ),
    h('main', { key: 'm', style: styles.main }, cards.map(card)),
  ]);
}

export function renderLoginPage(error?: string): string {
  return document(
    'Monitor · Ingresar',
    h(
      'main',
      { style: styles.loginBox },
      h('h1', { style: { ...styles.title, marginBottom: 16 } }, 'Monitor'),
      error ? h('p', { style: styles.error, role: 'alert' }, error) : null,
      h(
        'form',
        { method: 'post', action: MONITOR_LOGIN_URL },
        h('label', { htmlFor: 'password' }, 'Contraseña'),
        h('input', {
          id: 'password',
          name: 'password',
          type: 'password',
          required: true,
          autoComplete: 'current-password',
          autoFocus: true,
          style: styles.input,
        }),
        h('button', { type: 'submit', style: styles.primary }, 'Ingresar'),
      ),
    ),
  );
}
