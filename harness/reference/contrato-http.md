# Referencia: contrato HTTP

Parte de la base del harness (AGENTS.md §9 y §10).

## Respuesta exitosa

`meta` aparece **solo** cuando el endpoint pagina o filtra.

```jsonc
// Sin paginación ni filtros
{ "data": [ /* filas */ ] }

// Con paginación y/o filtros
{
  "data": [ /* filas */ ],
  "meta": {
    "pagination": { "page": 1, "pageSize": 50, "total": 1234, "totalPages": 25 },
    "filters": { "desde": "2026-01-01", "regional": "ANT" }
  }
}
```

## Respuesta de error

Siempre con el status HTTP correcto. `details` es opcional.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El parámetro 'desde' debe ser una fecha ISO",
    "details": [{ "field": "desde", "issue": "isDateString" }],
    "requestId": "b1f2c3...",
    "path": "/api/v1/cartera/resumen",
    "timestamp": "2026-09-25T14:00:00.000Z"
  }
}
```

| Status | `code` | Origen típico |
|---|---|---|
| 400 | `VALIDATION_ERROR` | DTO inválido |
| 403 | `FORBIDDEN` | — |
| 404 | `NOT_FOUND` | ruta o recurso |
| 503 | `DATABASE_UNAVAILABLE` | pg: conexión rechazada, `08*`, `57P01` |
| 504 | `QUERY_TIMEOUT` | pg: `57014` (statement_timeout) |
| 500 | `INTERNAL_ERROR` | cualquier otro; sin stack ni SQL |

## Cabeceras de seguridad

`securityHeaders()` (`templates/security/security-headers.ts` → `src/common/security/`) se registra en `src/main.ts` con `app.use(...)` antes de las rutas, sin helmet. En toda respuesta:

| Cabecera | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Strict-Transport-Security` | `max-age=31536000` |
| `Cache-Control` | `no-store` (las respuestas llevan datos privados; la caché es la de Redis) |

Además quita `X-Powered-By`.

**IP real detrás de un proxy:** `HTTP_TRUST_PROXY` lista los proxies de confianza por red (`loopback`, `linklocal`, `uniquelocal`) o por IP/subred (`10.0.0.0/8`). Si está definida, `main.ts` llama a `app.set('trust proxy', <valor>)` y `req.ip` sale de `X-Forwarded-For` solo cuando la conexión viene de esos proxies. Vacía (default), se usa la IP del socket. Balanceador en red privada: `loopback, uniquelocal`. **Nunca `true` ni un número de saltos**: si la app también es accesible sin pasar por el balanceador, cualquiera falsificaría su IP con la cabecera (y el IAM limita los intentos de login por IP).

## CORS

Allowlist por entorno: solo los orígenes de `CORS_ORIGINS` reciben `Access-Control-Allow-Origin`. Implementación de referencia: `harness/skills/nest-base/templates/cors/cors.ts` → `src/config/cors.ts`.

| Opción de `app.enableCors()` | Valor |
|---|---|
| `origin` | función que acepta solo los orígenes exactos de `CORS_ORIGINS` (sin `Origin` → sin cabeceras CORS) |
| `methods` | `GET, POST, OPTIONS` |
| `allowedHeaders` | `Authorization, Content-Type, X-Request-Id` |
| `exposedHeaders` | `X-Cache, X-Request-Id` |
| `credentials` | `true`: la sesión de autenticación va en cookies `HttpOnly`. Es seguro solo porque `origin` compara contra la allowlist exacta |
| `maxAge` | `CORS_MAX_AGE_SECONDS` (default 600) |
| `optionsSuccessStatus` | `204` |

- **Validación al arrancar** (`src/config/`): `CORS_ORIGINS` es obligatoria; se rechazan `*` y comodines, valores que no son un origen (`esquema://host[:puerto]`, sin ruta) y `http://` fuera de `localhost`, `127.0.0.1` o `[::1]`.
- **Prohibido:** `enableCors()` sin opciones, `origin: true`, `origin: '*'`, reflejar el `Origin` recibido, o `credentials: true` con cualquier `origin` que no sea la allowlist exacta.
- **Mismos orígenes en la autenticación:** `CORS_ORIGINS` es también el `allowedOrigins` de las rutas de autenticación (`/api/v1/auth`), que verifican el `Origin` de cada petición. No se mantiene una segunda lista.
- **Tests:** `src/config/cors.spec.ts` (parseo y validación) y `test/cors.e2e-spec.ts`: preflight permitido → `204` con `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, métodos, cabeceras y `max-age`; preflight de un origen no permitido → sin `Access-Control-Allow-Origin` ni `Access-Control-Allow-Credentials`.
- `init.sh` advierte si `.env.example` no define `CORS_ORIGINS` o lo define con `*`, y si `src/main.ts` no llama a `enableCors` o lo abre a cualquier origen.

## Caché

- Header `X-Cache: HIT | MISS | BYPASS` en toda respuesta cacheable.
- Clave: `<prefix>:<cliente>:<modulo>:<endpoint>:v<version>:<hash-estable-de-filtros>`. El hash se calcula con sha256 sobre el JSON de los filtros con las claves ordenadas.

## Logging

- JSON estructurado (`nestjs-pino`). `requestId` desde `X-Request-Id` (si es seguro: `[A-Za-z0-9._-]`, máximo 128) o UUID generado, devuelto en la respuesta.
- Por request: método, ruta, status, duración, resultado de caché y conexión de BD.
- Redact: `authorization`, cookies (`cookie` y `set-cookie`) y `password`.
- Plantilla: `harness/skills/nest-base/templates/logging/logger-options.ts` (`buildLoggerParams`, `parseLogFormat`, `REDACT_PATHS`).

### Formato por entorno (`LOG_FORMAT`)

| Entorno | `LOG_FORMAT` | Ejemplo |
|---|---|---|
| Producción, QA, CI (y por defecto) | `json` | `{"level":30,"requestId":"a1b2c3","req":{"method":"GET","url":"/api/v1/cartera/resumen"},"res":{"statusCode":200},"responseTime":42,"msg":"GET /api/v1/cartera/resumen 200 42ms"}` |
| Desarrollo local | `pretty` | `10:21:03 INFO: [a1b2c3] GET /api/v1/cartera/resumen 200 42ms {"cache":"HIT"}` |

- Ambos formatos llevan los mismos campos y la **misma redacción**: el formato legible nunca muestra secretos.
- `pretty` usa `pino-pretty`, que es **devDependency**: la imagen de producción no lo incluye. Si se pide `pretty` y no está instalado, el logger vuelve a JSON.
- La validación rechaza `LOG_FORMAT=pretty` con `NODE_ENV=production`, y cualquier valor distinto de `json` o `pretty`.
- Los logs no incluyen el SQL ejecutado ni sus parámetros en ningún formato.

## Health

`GET /health` es público y usa terminus. Indicadores:
- `db_<nombre en minúsculas>`, uno por conexión;
- `cache`, con estado `up`, `down` o `disabled`.

| Situación | Respuesta |
|---|---|
| Todas las BDs arriba | `200` |
| Alguna BD caída | `503` |
| Redis caído o deshabilitado | sigue en `200`; `cache: down / disabled` |

`init.sh` consume este formato para informar qué base está caída.
