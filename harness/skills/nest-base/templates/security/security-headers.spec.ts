// Plantilla del harness → src/common/security/security-headers.spec.ts
import express from 'express';
import request from 'supertest';
import { API_SECURITY_HEADERS, securityHeaders } from './security-headers';

describe('securityHeaders', () => {
  const app = express();
  app.use(securityHeaders());
  app.get('/api/v1/ping', (_req, res) => {
    res.json({ data: 'pong' });
  });

  it('sends every security header and hides X-Powered-By', async () => {
    const res = await request(app).get('/api/v1/ping');
    expect(res.status).toBe(200);
    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
      expect(res.headers[name.toLowerCase()]).toBe(value);
    }
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('also covers responses that are not handled by a route', async () => {
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
