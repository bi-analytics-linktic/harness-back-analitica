# Playbook: crear un endpoint (reporte)

Referencia de reglas: `AGENTS.md` §5 (patrón), §6 (BD), §7 (caché), §9 (contrato), §12 (documentación).

## 0. Confirmar el contrato (antes de escribir código)

Presenta esto al humano y espera su confirmación:

```
Endpoint:     GET /api/v1/<modulo>/<segmento>
Ubicación:    src/modules/<cliente>/<modulo>/<endpoint>/
Conexión BD:  <NOMBRE>   Origen: <schema.tabla | vista>
Columnas:     <col1: tipo>, <col2: tipo>, ...
Filtros:      <nombre: tipo, obligatorio|opcional, default>
Paginación:   sí|no  (pageSize default N, máx M)
Orden:        <columnas permitidas>, default <col DESC>
Caché TTL:    <segundos>
```

Si falta información, pregunta. No inventes columnas, tablas ni reglas.

## 1. Archivos, en este orden

1. `<endpoint>.columns.ts`: `export const X_COLUMNS = Object.freeze([...] as const)`.
2. `<endpoint>.entity.ts`: el tipo de la fila, derivado de las columnas.
3. `<endpoint>-query.dto.ts`: los params HTTP con `class-validator` (`@IsOptional`, `@IsDateString`, `@IsInt`, `@Min`, `@Max`, `@IsIn`).
4. `<endpoint>-filters.dto.ts`: los filtros normalizados (fechas como `Date`, defaults aplicados, `page`/`pageSize` resueltos).
5. `<endpoint>.sql.ts`: funciones puras `buildXQuery(filters): { text: string; values: unknown[] }` y, si pagina, `buildXCountQuery(filters)`. Todo valor va como `$n`, y el ORDER BY sale de una allowlist de `columns.ts`.
6. `<endpoint>.repository.ts`: el token `X_REPOSITORY`, la interfaz `XRepository` y la clase `PgXRepository`, que inyecta el pool de la conexión nombrada.
7. `<endpoint>.service.ts`: Cache-Aside con `CacheService`, y retorna `{ data, meta? }` junto al estado de caché.
8. `<endpoint>.controller.ts`: `@Get('<segmento>')`, recibe el DTO, lo convierte en filtros, llama al service y fija `X-Cache`.
9. Registrar controller, service y provider del repository (`{ provide: X_REPOSITORY, useClass: PgXRepository }`) en `<modulo>.module.ts`.

Aplica la regla de agrupación (más de 2 archivos del mismo tipo → carpeta por tipo).

## 2. Tests

- `*.sql.spec.ts`: valida `text` y `values` para cada combinación de filtros, y que ningún valor aparezca interpolado en `text`.
- `*.service.spec.ts`: HIT, MISS, BYPASS (caché lanza error o está deshabilitada), con y sin paginación.
- `*.controller.spec.ts`: delega al service y fija `X-Cache`.
- `*.repository.spec.ts`: con pool mockeado, verifica que ejecuta el SQL del builder y mapea las filas.
- `*-query.dto.spec.ts`: casos válidos e inválidos.
- E2E en `test/`: 401 sin token, 200 con token y envelope correcto, 400 con filtro inválido.

## 3. Documentación

### Postman

Agrega la request en `postman/arness-back.postman_collection.json`, dentro de la carpeta `<cliente>/<modulo>`:
- `GET {{baseUrl}}/api/v1/<modulo>/<segmento>?param=ejemplo`
- Auth: heredada de la colección (`Bearer {{accessToken}}`)
- Sin descripciones largas.

### FRONT.md

Agrega una sección con esta plantilla:

````markdown
### <Nombre legible del reporte>

`GET /api/v1/<modulo>/<segmento>` · requiere `Authorization: Bearer <accessToken>`

Qué devuelve: <una frase>.

| Parámetro | Tipo | Obligatorio | Ejemplo |
|---|---|---|---|
| desde | fecha ISO | sí | 2026-01-01 |
| page | número | no (default 1) | 1 |

```json
{ "data": [{ "col1": "…", "col2": 0 }], "meta": { "pagination": { "page": 1, "pageSize": 50, "total": 120, "totalPages": 3 } } }
```

**Consumo recomendado:** <paginar con pageSize ≤ N | traer completo>; <filtros a enviar siempre>; ante `401 TOKEN_EXPIRED`, llamar a `/auth/refresh` y reintentar una vez; datos cacheados en servidor por <TTL>, así que no hace falta hacer polling más frecuente.
````

### README del módulo

Agrega el endpoint, su conexión y el origen de datos.

## 4. Cierre

Corre `./harness/init.sh` y revisa el Definition of Done de `AGENTS.md` §15.
