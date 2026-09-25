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
