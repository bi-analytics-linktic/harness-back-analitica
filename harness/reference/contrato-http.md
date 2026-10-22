# Referencia: contrato HTTP

Parte de la base del harness (AGENTS.md §8, §9 y §10).

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
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` / `INVALID_CREDENTIALS` | guard o login |
| 403 | `FORBIDDEN` | — |
| 404 | `NOT_FOUND` | ruta o recurso |
| 503 | `DATABASE_UNAVAILABLE` | pg: conexión rechazada, `08*`, `57P01` |
| 504 | `QUERY_TIMEOUT` | pg: `57014` (statement_timeout) |
| 500 | `INTERNAL_ERROR` | cualquier otro; sin stack ni SQL |

## Autenticación

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /api/v1/auth/login` | `{ "password": "..." }` | `{ data: { accessToken, refreshToken, expiresIn } }` |
| `POST /api/v1/auth/refresh` | `{ "refreshToken": "..." }` | `{ data: { accessToken, refreshToken, expiresIn } }` |

- `password` se compara con `ACCESS_TOKEN` en tiempo constante: `crypto.timingSafeEqual` sobre el sha256 de ambos valores.
- Los tokens usan secretos distintos; el claim `type` (`access` o `refresh`) se valida.
- Los clientes envían `Authorization: Bearer <accessToken>`. Ante `401 TOKEN_EXPIRED`, llaman a `/auth/refresh` y reintentan una vez.

## CORS

Allowlist por entorno: solo los orígenes de `CORS_ORIGINS` reciben `Access-Control-Allow-Origin`. Implementación de referencia: `harness/skills/nest-base/templates/cors/cors.ts` → `src/config/cors.ts`.

| Opción de `app.enableCors()` | Valor |
|---|---|
| `origin` | función que acepta solo los orígenes exactos de `CORS_ORIGINS` (sin `Origin` → sin cabeceras CORS) |
| `methods` | `GET, POST, OPTIONS` |
| `allowedHeaders` | `Authorization, Content-Type, X-Request-Id` |
| `exposedHeaders` | `X-Cache, X-Request-Id` |
| `credentials` | `false` (la API usa `Bearer`, no cookies) |
| `maxAge` | `CORS_MAX_AGE_SECONDS` (default 600) |
| `optionsSuccessStatus` | `204` |

- **Validación al arrancar** (`src/config/`): `CORS_ORIGINS` es obligatoria; se rechazan `*` y comodines, valores que no son un origen (`esquema://host[:puerto]`, sin ruta) y `http://` fuera de `localhost`, `127.0.0.1` o `[::1]`.
- **Prohibido:** `enableCors()` sin opciones, `origin: true`, `origin: '*'`, reflejar el `Origin` recibido o `credentials: true`.
- **Tests:** `src/config/cors.spec.ts` (parseo y validación) y `test/cors.e2e-spec.ts`: preflight permitido → `204` con `Access-Control-Allow-Origin`, métodos, cabeceras y `max-age`; preflight de un origen no permitido → sin `Access-Control-Allow-Origin`.
- `init.sh` advierte si `.env.example` no define `CORS_ORIGINS` o lo define con `*`, y si `src/main.ts` no llama a `enableCors` o lo abre a cualquier origen.

## Caché

- Header `X-Cache: HIT | MISS | BYPASS` en toda respuesta cacheable.
- Clave: `<prefix>:<cliente>:<modulo>:<endpoint>:v<version>:<hash-estable-de-filtros>`. El hash se calcula con sha256 sobre el JSON de los filtros con las claves ordenadas.

## Logging

- JSON estructurado (`nestjs-pino`). `requestId` desde `X-Request-Id` o UUID generado, devuelto en la respuesta.
- Por request: método, ruta, status, duración, resultado de caché y conexión de BD.
- Redact: `authorization`, `password`, `accessToken`, `refreshToken`, `*_SECRET` y `*_PASSWORD`.

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

## Monitor

Tablero de estado para el equipo, **fuera de `/api/v1`** y apagado por defecto. Implementación de referencia: `harness/skills/nest-base/templates/monitor/` → `src/common/monitor/`.

| Ruta | Sesión | Respuesta |
|---|---|---|
| `GET /monitor` | cookie | HTML con los widgets; sin sesión → `303` a `/monitor/login` |
| `GET /monitor/login` | — | formulario HTML (`password`) |
| `POST /monitor/login` | — | correcta → `303` a `/monitor` y `Set-Cookie`; incorrecta → `401` con el formulario y sin cookie |
| `POST /monitor/logout` | — | borra la cookie (`Max-Age=0`) y `303` a `/monitor/login` |

- **Activación:** `MONITOR_ENABLED=true`. Con cualquier otro valor, todas las rutas responden `404`.
- **Render:** `react-dom/server` (`renderToStaticMarkup`) con `createElement`, sin JSX, sin hidratación, sin bundler y sin `<script>`. Estilos inline.
- **Login:** la contraseña se compara con `ACCESS_TOKEN` en tiempo constante, igual que `/auth/login`. Al acertar se emite un JWT con `type: "monitor"` (firmado con `JWT_ACCESS_SECRET`, dura `MONITOR_SESSION_EXPIRES_IN`) en la cookie `arness_monitor`: `HttpOnly; Secure; SameSite=Strict; Path=/monitor; Max-Age=<duración>`. Un access token (`type: "access"`) no sirve como cookie ni la cookie sirve como `Bearer`.
- **Guards:** el controller lleva `@MonitorRoute()`, que `JwtAuthGuard` omite, y `MonitorSessionGuard`, que exige la cookie salvo en los handlers `@MonitorLogin()` (formulario, login y logout). No es `@Public()`.
- **Rate limiting:** cuando el harness incorpore límite de intentos para `/auth/login`, el login del monitor lo comparte.
- **Cabeceras en toda respuesta:** `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, `Cache-Control: no-store`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.
- **Widgets:** `MonitorWidget { id; title; order; collect(): Promise<MonitorValue> }`, registrados en el multi-provider `MONITOR_WIDGETS` de `MonitorModule`. Un widget que lanza o tarda más de 2 s se muestra como "No disponible"; el log registra solo el tipo de error, nunca su mensaje.
- **Widget base `endpoints-total`:** cuenta las rutas HTTP con `DiscoveryService` y `MetadataScanner`, excluye `monitor`, `health` y `auth`, y desglosa por el primer segmento de la ruta (el módulo).
- **Nunca se muestran:** secretos, variables de entorno, SQL, errores de PostgreSQL ni datos de negocio (filas, montos, nombres de clientes). Solo conteos y estados técnicos.
- **Tests:** unit de servicio, página, sesión, guard y widget; e2e `test/monitor.e2e-spec.ts` (redirección sin cookie, `401` sin cookie con contraseña incorrecta, login y conteo correcto con controllers de prueba, widget con error que no rompe la página, sin `<script>`, `404` con `MONITOR_ENABLED=false`).
