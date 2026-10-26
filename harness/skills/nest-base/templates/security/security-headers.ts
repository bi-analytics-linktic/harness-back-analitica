// Plantilla del harness → src/common/security/security-headers.ts (AGENTS.md §9, contrato-http.md "Cabeceras de seguridad").
// Security headers for every response, without helmet. The monitor overwrites the CSP with its own.
import type { NextFunction, Request, Response } from 'express';

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cache-Control': 'no-store',
});

/** Express middleware: app.use(securityHeaders()) in src/main.ts, before any route. */
export function securityHeaders(): (req: Request, res: Response, next: NextFunction) => void {
  return (_req, res, next) => {
    res.removeHeader('X-Powered-By');
    res.set(API_SECURITY_HEADERS);
    next();
  };
}
