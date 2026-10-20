// Plantilla del harness → src/common/monitor/monitor-page.spec.ts
import { renderLoginPage, renderMonitorPage } from './monitor-page';

describe('monitor pages', () => {
  const html = renderMonitorPage(
    [
      {
        id: 'endpoints-total',
        title: 'Endpoints de la API',
        status: 'ok',
        value: { value: 3, detail: [{ label: 'cartera', value: 3 }] },
      },
      { id: 'broken', title: 'Roto', status: 'unavailable' },
    ],
    new Date('2026-10-20T12:00:00Z'),
  );

  it('renders the widgets, "No disponible" and a logout form', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Endpoints de la API');
    expect(html).toContain('cartera');
    expect(html).toContain('No disponible');
    expect(html).toContain('action="/monitor/logout"');
  });

  it('never ships scripts or inline event handlers', () => {
    for (const page of [html, renderLoginPage('Contraseña incorrecta')]) {
      expect(page).not.toMatch(/<script/i);
      expect(page).not.toMatch(/\son[a-z]+=/i);
    }
  });

  it('escapes widget values', () => {
    const page = renderMonitorPage(
      [{ id: 'x', title: '<b>', status: 'ok', value: { value: '<script>' } }],
      new Date(),
    );
    expect(page).not.toContain('<script>');
    expect(page).toContain('&lt;script&gt;');
  });
});
