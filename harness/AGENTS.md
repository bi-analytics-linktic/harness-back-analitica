# AGENTS.md

Fuente única de instrucciones para cualquier agente IA (Claude Code, Codex, Gemini CLI, Cursor u otro). Vive en `harness/AGENTS.md`; el `AGENTS.md` de la raíz es un enlace simbólico a este archivo, y `CLAUDE.md`, `GEMINI.md` y `.cursor/rules/` solo apuntan aquí. **Todas las rutas son relativas a la raíz del proyecto.** Los detalles de consulta están en `harness/reference/` y se leen **solo cuando la tarea lo requiere**.

> **Base del harness: la instala y actualiza el paquete `@linktic/arness-back` (desde git; `pnpm arness sync`) y no se edita en este repo.** Toda decisión posterior va en `harness/decisiones/` (§17), que pertenece al repo. Lee `harness/decisiones/README.md` antes de trabajar.

## 0. Antes de empezar: `./harness/init.sh`

Ejecuta `./harness/init.sh` **antes de cualquier cambio**. Verifica el harness, la estructura y el toolchain, las reglas de SQL, lint, formato, build, tests y `/health` (cada base de datos y la caché).

- **Si falla (exit ≠ 0): no continúes.** Informa al usuario los fallos exactos (por ejemplo "la base REPORTS está caída") y espera instrucciones. No entres en ciclos de reintentos sobre un proyecto roto.
- Si el usuario pide corregir lo que falló: **máximo 3 intentos**; después vuelve a informar.
- Nunca modifiques `init.sh`, reglas de ESLint ni tests para que pasen.
- Opciones: `--quick` (sin lint, build, tests ni health), `--e2e`, `--no-health` e `--install`.
- Al terminar una tarea, `./harness/init.sh` debe pasar de nuevo.

## 1. Qué es este proyecto

Plantilla base para los **backends de analítica** del equipo:
- **Reportes de solo lectura** sobre una o varias bases **PostgreSQL**.
- Organización **cliente → módulo → endpoint**, con arquitectura hexagonal por feature.
- **JWT (access + refresh)** en todos los endpoints, sin usuarios en BD.
- **Redis como caché opcional**: la API funciona igual con Redis activo, desactivado o caído.

No es transaccional: no crea, modifica ni borra datos de negocio.

## 2. Stack

| Tema | Elección |
|---|---|
| Runtime | Node.js **última LTS** (`.nvmrc`) + TypeScript strict |
| Framework | NestJS **última versión estable** (dist-tag `latest`) |
| Paquetes | **pnpm** (nunca npm ni yarn) |
| BD | PostgreSQL vía `pg`, SQL nativo, **sin ORM ni query builder** |
| Caché | Redis vía `ioredis`, Cache-Aside, degradable |
| Config / validación | `@nestjs/config`, `class-validator`, `class-transformer` |
| Auth / logs / health | `@nestjs/jwt`, `nestjs-pino`, `@nestjs/terminus` |
| Calidad / tests | ESLint + Prettier; Jest + Supertest |
| Entrega | Docker + Azure Pipelines |

**Dependencias aprobadas:** las de la tabla, `pino-http`, `@types/pg`, `@linktic/arness-back` (dev) y las que genera `nest new`. Cualquier otra requiere aprobación humana registrada en `harness/decisiones/`. La base del proyecto se crea con la skill `nest-base`.

## 3. Comandos

```bash
./harness/init.sh                  # verificación: SIEMPRE antes y después de trabajar
pnpm start:dev | pnpm build
pnpm lint | pnpm lint:check        # --fix | sin corregir, 0 warnings
pnpm format | pnpm format:check
pnpm test | pnpm test:e2e | pnpm test:cov
pnpm arness status | sync           # integridad y versión del harness | actualizar la base
pnpm arness decision new "<título>" # nueva decisión en harness/decisiones/
```

## 4. Estructura

```
src/
├── main.ts · app.module.ts
├── config/          # carga y validación de variables de entorno
├── common/          # transversal, sin negocio: auth, database, cache, http, logging, health
└── modules/<cliente>/<modulo>/
    ├── README.md
    ├── <modulo>.module.ts
    └── <endpoint>/  # §5
```

Raíz (proyecto NestJS): `postman/`, `FRONT.md`, `test/` (e2e), `.env.example`, `Dockerfile`, `azure-pipelines.yml`, `.nvmrc`, ESLint y Prettier.

Harness (todo en `harness/`, separado del proyecto): `AGENTS.md`, `init.sh`, `agents/`, `skills/`, `playbooks/`, `reference/`, `decisiones/` y `progress.md` (estado de trabajo, no versionado). En la raíz solo quedan puentes: el enlace `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/`, y los enlaces `.claude/agents`, `.claude/skills` y `.agents/skills`. El código del proyecto nunca vive en `harness/`, y `harness/` nunca entra al build, a los tests ni a la imagen Docker.

- El primer nivel de `src/modules/` es **siempre el cliente** (ej. `src/modules/fiduprevisora/`).
- `common/` no importa de `modules/`. Los módulos no se importan entre sí; lo compartido va a `common/`.

## 5. Patrón por endpoint (hexagonal por feature)

Un reporte es `GET /api/v1/<modulo>/<segmento>` y vive en una carpeta con estos archivos:

| Archivo | Rol |
|---|---|
| `<e>.controller.ts` | HTTP: valida, delega y fija `X-Cache`. Sin lógica; nunca toca el repository |
| `<e>.service.ts` | Caso de uso: Cache-Aside y envelope `{ data, meta? }`. Depende de la **interfaz** del repository, nunca de `pg` |
| `<e>.repository.ts` | Token + interfaz (puerto) + implementación con `pg` (adaptador). Ejecuta el SQL y mapea filas |
| `<e>.sql.ts` | Funciones **puras** `(filters) => { text, values }`. **Único lugar con texto SQL** |
| `<e>.columns.ts` | Columnas expuestas, `Object.freeze`. Es el **contrato** con frontend |
| `<e>-query.dto.ts` | Query params tal como llegan por HTTP, con validación |
| `<e>-filters.dto.ts` | Filtros normalizados: lo que cruza las capas |
| `<e>.entity.ts` | Tipo de la fila devuelta |
| `*.spec.ts` | Un spec por archivo |

**Regla de agrupación:** si un módulo tiene **más de 2 archivos del mismo tipo**, se agrupan en una carpeta por tipo (`controllers/`, `services/`…). Con 1 o 2, estructura plana.

## 6. Base de datos

- **Solo lectura:** solo `SELECT` (incluye CTE y vistas). Prohibidos `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, DDL y migraciones.
- **Pools:** cada pool abre sesión con `default_transaction_read_only = on` y un `statement_timeout`.
- **Parámetros:** todo valor externo va como parámetro (`$1`, `$2`…). **Nunca** se concatenan ni interpolan valores.
- **Allowlist:** lo no parametrizable (columna de orden, `ASC`/`DESC`) sale de una allowlist basada en `.columns.ts`.
- **Paginación:** `LIMIT`/`OFFSET` parametrizados y `pageSize` máximo.
- **Estilo:** palabras clave SQL en MAYÚSCULAS, que es lo que detectan ESLint e `init.sh`.
- **Conexiones:** una o varias, nombradas en env (`DATABASES=MAIN,REPORTS` + `DB_<NOMBRE>_*`). Se inyectan con `getPoolToken('<NOMBRE>')` y cada repository declara la suya. Variables: `harness/reference/configuracion.md`.

## 7. Caché (Redis, degradable)

- **Cache-Aside** en el service: leer caché → si no hay dato o falla, consultar BD → escribir caché sin bloquear la respuesta.
- `CacheService` **nunca lanza hacia el negocio**: ante error, timeout o `CACHE_ENABLED=false`, registra un warning y actúa como MISS/BYPASS.
- Si Redis cae, la API sigue respondiendo desde PostgreSQL.
- **Clave versionada** (`...:v<n>:<hash-filtros>`): sube `v<n>` cuando cambian el SQL o las columnas.
- **Detalle** (clave, `X-Cache`): `harness/reference/contrato-http.md`.

## 8. Autenticación

- **Sin usuarios en BD:** `POST /api/v1/auth/login` recibe `{ password }` y lo compara en tiempo constante con `ACCESS_TOKEN`. Devuelve un access token y un refresh token.
- **Refresh:** `POST /api/v1/auth/refresh` emite un par nuevo.
- **Tokens:** secretos distintos para access y refresh, y el claim `type` se valida.
- **Guard global:** `JwtAuthGuard` protege todo; `@Public()` **solo** en `login`, `refresh` y `health`.
- **Detalle:** `harness/reference/contrato-http.md`.

## 9. Contrato HTTP

- Prefijo `/api/v1`, recursos en kebab-case y query params en camelCase.
- `ValidationPipe` con `whitelist`, `forbidNonWhitelisted` y `transform`.
- **Éxito:** `{ data, meta? }`. `meta` (`pagination` y `filters`) solo cuando el endpoint pagina o filtra.
- **Error:** `{ error: { code, message, details?, requestId, path, timestamp } }` con el status HTTP correcto.
- Los errores de PostgreSQL nunca se exponen tal cual.
- **Ejemplos y tabla de códigos:** `harness/reference/contrato-http.md`.

## 10. Logging y health

- **Logs:** JSON estructurado con `requestId` (`X-Request-Id`), con redacción de tokens, contraseñas y secretos. Nunca `console.log`.
- **Health:** `GET /health` es público y reporta cada BD y la caché. Si una BD está caída responde `503`; si Redis está caído o deshabilitado, sigue en `200`.

## 11. Tests (estándar NestJS)

- **Unit:** `*.spec.ts` junto a cada archivo, con `Test.createTestingModule`. El repository se mockea por su token; `.sql.ts` se prueba como función pura (`text` + `values`).
- **E2E:** `test/*.e2e-spec.ts` con Supertest: auth, envelope, errores y `X-Cache`.
- Todo cambio de comportamiento lleva su test. Nunca `.skip` ni `.only` para pasar el pipeline.

## 12. Documentación obligatoria por endpoint

Crear o cambiar un endpoint actualiza, **en el mismo cambio**:
1. **`postman/arness-back.postman_collection.json`** (v2.1): una request mínima en la carpeta `<cliente>/<modulo>`, con `{{baseUrl}}` y `Bearer {{accessToken}}`.
2. **`FRONT.md`**: guía breve para frontend con qué devuelve, parámetros, un ejemplo recortado y **cómo consumirlo de forma recomendada**. La plantilla está en el playbook `new-endpoint`.
3. **`README.md` del módulo**: propósito, endpoints, conexión y tablas o vistas.

Cambiar `.columns.ts`, los filtros o el envelope es un **cambio de contrato**: actualiza `FRONT.md` y sube la versión de la clave de caché.

## 13. Reglas prohibidas

Un agente **nunca**:
1. Escribe SQL fuera de `*.sql.ts`, ni concatena o interpola valores en SQL.
2. Ejecuta o agrega escrituras, DDL o migraciones.
3. Lee, edita o muestra `.env` ni secretos reales. Las variables nuevas van a `.env.example`, a `.env.local` y a la validación de `src/config/`.
4. Agrega, quita o actualiza dependencias sin aprobación humana.
5. Loguea o devuelve tokens, contraseñas, stack traces o errores crudos de PostgreSQL.
6. Hace que la API dependa de Redis.
7. Deja un endpoint sin `JwtAuthGuard` (salvo `login`, `refresh` y `health`).
8. Usa npm o yarn, o hace commit de `dist/`, `node_modules/`, `.env` o `.env.local`.

## 14. Convenciones

- **Idioma:** código, nombres de archivo y commits en **inglés**; documentación en **español**.
- **Nombres:** archivos en kebab-case con sufijo de rol (`portfolio-summary.service.ts`), clases en PascalCase y variables de entorno en UPPER_SNAKE_CASE.
- **TypeScript:** `strict`, sin `any` (usa `unknown` y acota), tipos de retorno explícitos en la API pública.
- **Commits:** Conventional Commits, ej. `feat(fiduprevisora/cartera): add summary endpoint`.
- **Configuración:** sin valores mágicos; todo lo configurable sale de `src/config/` y se valida al arrancar.

## 15. Cómo trabaja el agente

1. **Confirma el contrato con el humano antes de codificar:** cliente, módulo y segmento; conexión y tablas o vistas; columnas; filtros (tipos, obligatorios u opcionales); paginación (default y máximo); TTL de caché.
2. **Implementa** con el playbook correspondiente (§16).
3. **Definition of Done:**
   - [ ] Patrón §5 completo, con un spec por archivo
   - [ ] SQL solo en `.sql.ts` y parametrizado
   - [ ] Guard JWT activo y `X-Cache` presente
   - [ ] Postman, `FRONT.md` y README del módulo actualizados
   - [ ] Variables nuevas en `.env.example`, `.env.local` y `src/config/`
   - [ ] Decisión nueva registrada en `harness/decisiones/` (si aplica)
   - [ ] `./harness/init.sh` en verde
4. **Reporta** qué cambió, qué se probó y qué quedó pendiente. No afirmes que algo funciona sin verificarlo.

Ante ambigüedad de negocio o datos, **pregunta**. No inventes columnas, tablas ni reglas.

**Multiagente:** el `lider` orquesta y habla con el humano, el `implementador` escribe el código y el `revisor` audita el plan y cada entrega. Máximo 3 rondas de revisión por tarea; después se escala al humano. Definiciones y modelos recomendados en `harness/agents/`. **Estado compartido:** `harness/progress.md`. Solo lo escribe el líder, desde `harness/reference/progress-plantilla.md`; los subagentes leen solo las secciones que necesitan.

## 16. Playbooks y referencias

| Tarea | Archivo |
|---|---|
| Orquestar con agentes | `harness/agents/lider.md`, `implementador.md`, `revisor.md` |
| Crear la base NestJS | `harness/skills/nest-base/SKILL.md` (skill `nest-base`) |
| Crear un endpoint | `harness/playbooks/new-endpoint.md` |
| Crear un módulo o cliente | `harness/playbooks/new-module.md` |
| Agregar una conexión de BD | `harness/playbooks/add-database.md` |
| Revisar un cambio | `harness/playbooks/review.md` |
| Variables de entorno | `harness/reference/configuracion.md` |
| Envelope, errores, auth, health | `harness/reference/contrato-http.md` |
| Registrar una decisión | `harness/decisiones/README.md` |

## 17. Decisiones (base inmutable)

La base del harness (todo `harness/` salvo `harness/decisiones/` y `harness/progress.md`, más los puentes de la raíz) **no se edita para reflejar decisiones del proyecto.** Cada decisión (dependencia, excepción, convención, regla por cliente, cambio de contrato) es un archivo en `harness/decisiones/`:
- **Formato:** `harness/decisiones/NNNN-titulo-kebab.md`, desde `_plantilla.md`, y agregada al índice de `harness/decisiones/README.md`.
- **Estados:** `Propuesta` → `Aceptada` → `Reemplazada por NNNN` | `Obsoleta`. Solo `Aceptada` es vinculante.
- **Precedencia:** una decisión `Aceptada` prevalece sobre la base **solo dentro de su alcance**.
- **Inmutabilidad:** no se reescribe; se reemplaza con una nueva y en la anterior solo se actualiza el estado.

Un agente:
1. Lee las decisiones `Aceptada` relevantes antes de implementar.
2. Ante una decisión humana no cubierta por la base, o una aprobación de algo prohibido, redacta la decisión en `Propuesta` y pide que la acepten.
3. **Nunca** edita la base. `arness sync` detecta las ediciones y se detiene. Las mejoras al harness se proponen en el repo del paquete `@linktic/arness-back` y llegan con una nueva versión.
