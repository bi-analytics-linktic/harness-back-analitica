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
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` / `INVALID_CREDENTIALS` / `SESSION_EXPIRED` | guard, login o refresh |
| 403 | `FORBIDDEN` | — |
| 404 | `NOT_FOUND` | ruta o recurso |
| 429 | `TOO_MANY_ATTEMPTS` | login bloqueado por intentos fallidos (con `Retry-After`) |
| 503 | `DATABASE_UNAVAILABLE` | pg: conexión rechazada, `08*`, `57P01` |
| 504 | `QUERY_TIMEOUT` | pg: `57014` (statement_timeout) |
| 500 | `INTERNAL_ERROR` | cualquier otro; sin stack ni SQL |

## Autenticación

| Endpoint | Body | Respuesta |
|---|---|---|
| `POST /api/v1/auth/login` | `{ "password": "..." }` | `{ data: { accessToken, refreshToken, expiresIn } }` |
| `POST /api/v1/auth/refresh` | `{ "refreshToken": "..." }` | `{ data: { accessToken, refreshToken, expiresIn } }` |

- `password` se compara con `ACCESS_TOKEN` en tiempo constante: `crypto.timingSafeEqual` sobre el sha256 de ambos valores.
- Los tokens usan secretos distintos; el claim `type` (`access` o `refresh`) se valida. Un token de otro tipo (`refresh`, o el `monitor` de la cookie) como `Bearer` → `401 UNAUTHORIZED`; un access token en `/auth/refresh` → `401 UNAUTHORIZED`.
- Los clientes envían `Authorization: Bearer <accessToken>`. Ante `401 TOKEN_EXPIRED`, llaman a `/auth/refresh` y reintentan una vez. Ante `401 SESSION_EXPIRED` o `429`, vuelven al login.

### Vida máxima de la sesión

- `/auth/login` emite el par con el claim `auth_time` (segundos, hora del login). `/auth/refresh` **copia** el `auth_time` del refresh token al par nuevo: refrescar nunca extiende la sesión.
- Si `ahora - auth_time >= AUTH_SESSION_MAX_AGE_SECONDS` (default 12 h), o el refresh token no trae `auth_time`, el refresh responde `401 SESSION_EXPIRED` y el cliente debe volver a `/auth/login`. Así, un refresh token robado deja de servir como mucho al cumplir esa edad.
- Para cortar todas las sesiones de inmediato, se rota `JWT_REFRESH_SECRET` (y `JWT_ACCESS_SECRET` si hace falta).
- Implementación de referencia: `templates/security/session-lifetime.ts` → `src/common/security/` (`sessionClaims`, `isSessionExpired`).

### Límite de intentos

- `/auth/login` y `/monitor/login` comparten `LoginAttemptLimiter` (`templates/security/login-attempts.ts` → `src/common/security/`, provisto por `SecurityModule`, global). Cuenta los intentos fallidos **por IP** (`req.ip`) en memoria.
- Al llegar a `AUTH_LOGIN_MAX_ATTEMPTS` fallos (default 5) dentro de `AUTH_LOGIN_WINDOW_SECONDS` (default 900, contados desde el primer fallo), la IP queda bloqueada hasta que termina la ventana: responde `429 TOO_MANY_ATTEMPTS` con `Retry-After: <segundos>` **sin comparar la contraseña**. Un login correcto reinicia el contador.
- Orden en el controller: `check(ip)` → si no está permitido, `429`; si la contraseña es incorrecta, `registerFailure(ip)` y `401 INVALID_CREDENTIALS`; si es correcta, `reset(ip)` y el par de tokens.
- **IP real detrás de un proxy:** con `HTTP_TRUST_PROXY_HOPS=<n>` (Azure App Service o un gateway: `1`), `main.ts` llama a `app.set('trust proxy', n)` y `req.ip` sale de `X-Forwarded-For`. Con `0` (default) se usa la IP del socket. Nunca `true`: permitiría falsificar la IP con la cabecera.
- El contador es **por instancia** y no depende de Redis: con varias réplicas, cada una cuenta aparte. El map tiene un tope de 10 000 IPs.

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

Además quita `X-Powered-By`. El monitor reemplaza la CSP por la suya (sección Monitor).

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

- JSON estructurado (`nestjs-pino`). `requestId` desde `X-Request-Id` (si es seguro: `[A-Za-z0-9._-]`, máximo 128) o UUID generado, devuelto en la respuesta.
- Por request: método, ruta, status, duración, resultado de caché y conexión de BD.
- Redact: `authorization`, cookies (`cookie` y `set-cookie`), `password`, `accessToken`, `refreshToken`, `*_SECRET` y `*_PASSWORD`.
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
- **Límite de intentos:** comparte `LoginAttemptLimiter` con `/auth/login` (sección Autenticación). Bloqueado → `429` con `Retry-After` y el formulario con "Demasiados intentos", sin cookie.
- **Cabeceras en toda respuesta:** `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, `Cache-Control: no-store`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.
- **Widgets:** `MonitorWidget { id; title; order; collect(): Promise<MonitorValue> }`, registrados en el multi-provider `MONITOR_WIDGETS` de `MonitorModule`. Un widget que lanza o tarda más de 2 s se muestra como "No disponible"; el log registra solo el tipo de error, nunca su mensaje.
- **Widget base `endpoints-total`:** cuenta las rutas HTTP con `DiscoveryService` y `MetadataScanner`, excluye `monitor`, `health` y `auth`, y desglosa por el primer segmento de la ruta (el módulo).
- **Nunca se muestran:** secretos, variables de entorno, SQL, errores de PostgreSQL ni datos de negocio (filas, montos, nombres de clientes). Solo conteos y estados técnicos.
- **Tests:** unit de servicio, página, sesión, guard y widget; e2e `test/monitor.e2e-spec.ts` (redirección sin cookie, `401` sin cookie con contraseña incorrecta, login y conteo correcto con controllers de prueba, widget con error que no rompe la página, sin `<script>`, `404` con `MONITOR_ENABLED=false`).
