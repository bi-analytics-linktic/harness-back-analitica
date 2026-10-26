# AGENTS.md

Fuente única de instrucciones para cualquier agente IA (Claude Code, Codex, Gemini CLI, Cursor u otro). Vive en `harness/AGENTS.md`; el `AGENTS.md` de la raíz es un enlace simbólico a este archivo, y `CLAUDE.md`, `GEMINI.md` y `.cursor/rules/` solo apuntan aquí. **Todas las rutas son relativas a la raíz del proyecto.** Los detalles de consulta están en `harness/reference/` y se leen **solo cuando la tarea lo requiere**.

> **Base del harness: la instala y actualiza el paquete `@bi-analytics/arness-back` (desde npm; `pnpm arness sync`) y no se edita en este repo.** Toda decisión posterior va en `harness/decisiones/` (§17), que pertenece al repo. Lee `harness/decisiones/README.md` antes de trabajar.

## 0. Antes de empezar: `./harness/init.sh`

Ejecuta `./harness/init.sh` **antes de cualquier cambio**. Revisa el harness, la estructura y el toolchain, las reglas de SQL, lint, formato, build, tests y `/health` (cada base de datos y la caché).

Por defecto **los hallazgos son advertencias** (`⚠`, exit 0): el proyecto sigue funcionando tal cual. Muchos backends adoptaron el harness con el código ya en producción y no cumplen todas las reglas nuevas.

- **Advertencias (exit 0):** infórmalas al usuario en tu reporte y **continúa**. No las corrijas por tu cuenta si no son parte de la tarea, y **no introduzcas advertencias nuevas** con tu cambio.
- **Fallo (exit 1): no continúes.** Ocurre ante un fallo **crítico** (hoy solo `.env` o `.env.local` versionado en git), con `--strict` o con un chequeo marcado como `required` en `harness/arness.config.json`. Informa los fallos exactos y espera instrucciones. No entres en ciclos de reintentos.
- Si el usuario pide corregir algo: **máximo 3 intentos**; después vuelve a informar.
- Nunca modifiques `init.sh`, reglas de ESLint ni tests, ni silencies chequeos en `harness/arness.config.json`, para que pasen. Silenciar un chequeo es decisión humana y lleva motivo.
- Opciones: `--strict`, `--json` (salida para máquinas), `--quick` (sin lint, build, tests ni health), `--e2e`, `--no-health` e `--install`. `pnpm arness doctor` resume, sin modificar nada, las **novedades por adoptar** de cada versión (seguridad, recomendadas y opcionales, con sus pasos) y el resto de los hallazgos.
- **Después de `pnpm arness sync`:** ejecuta `pnpm arness doctor` e **informa** al humano las novedades por adoptar. No las implementes si no son parte de la tarea; adoptar o declinar una novedad es decisión humana (declinar va con motivo en `harness/arness.config.json` → `declined`).
- Al terminar una tarea, `./harness/init.sh` debe terminar en 0 y sin advertencias nuevas respecto al inicio.

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

**Dependencias aprobadas:** las de la tabla, `pino-http`, `@types/pg`, `@bi-analytics/arness-back` (dev) y las que genera `nest new`. Además `react` y `react-dom` (con `@types/react` y `@types/react-dom` en dev), **solo** para renderizar el monitor en el servidor (§10), y `pino-pretty` **solo como devDependency**, para el formato legible de logs en desarrollo (§10). Cualquier otra requiere aprobación humana registrada en `harness/decisiones/`. La base del proyecto se crea con la skill `nest-base`.

## 3. Comandos

```bash
./harness/init.sh                  # revisión: SIEMPRE antes y después de trabajar (--strict en CI)
pnpm start:dev | pnpm build
pnpm lint | pnpm lint:check        # --fix | sin corregir, 0 warnings
pnpm format | pnpm format:check
pnpm test | pnpm test:e2e | pnpm test:cov
pnpm arness status | sync           # integridad y versión del harness | actualizar la base
pnpm arness doctor | rollback       # novedades por adoptar y hallazgos (solo lectura) | volver a la base anterior
pnpm arness decision new "<título>" # nueva decisión en harness/decisiones/
```

## 4. Estructura

```
src/
├── main.ts · app.module.ts
├── config/          # carga y validación de variables de entorno
├── common/          # transversal, sin negocio: auth, database, cache, http, logging, health, monitor
└── modules/<cliente>/<modulo>/
    ├── README.md
    ├── <modulo>.module.ts
    └── <endpoint>/  # §5
```

Raíz (proyecto NestJS): `postman/`, `FRONT.md`, `docs/` (`TECNICO.md`, `EVOLUTIVO.md` y `PENDIENTES.md`, §12), `test/` (e2e), `.env.example`, `Dockerfile`, `azure-pipelines.yml`, `.nvmrc`, ESLint y Prettier.

Harness (todo en `harness/`, separado del proyecto): `AGENTS.md`, `init.sh`, `agents/`, `skills/`, `playbooks/`, `reference/`, `decisiones/`, `arness.config.json` (opcional, del repo) y `progress.md` (estado de trabajo, no versionado). En la raíz solo quedan puentes: el enlace `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/`, y los enlaces `.claude/agents`, `.claude/skills` y `.agents/skills`. El código del proyecto nunca vive en `harness/`, y `harness/` nunca entra al build, a los tests ni a la imagen Docker.

- El primer nivel de `src/modules/` es **siempre el cliente** (ej. `src/modules/fiduprevisora/`).
- `common/` no importa de `modules/`. Los módulos no se importan entre sí (ni entre clientes); lo compartido va a `common/`. Un módulo solo sale de su carpeta hacia `src/common/` o `src/config/`.
- Lo verifican ESLint (`eslint.boundaries.mjs`, regla `@typescript-eslint/no-restricted-imports`) e `init.sh`.

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
| `*.spec.ts` | Un spec por archivo con lógica: controller, service, repository, sql y query DTO como mínimo |

**Regla de agrupación:** si una carpeta del módulo tiene **más de 2 archivos del mismo tipo**, se agrupan en una carpeta por tipo (`controllers/`, `services/`, `repositories/`, `sql/`, `columns/`, `dto/`, `entities/`). Con 1 o 2, estructura plana.

`init.sh` verifica la regla de agrupación y que cada `<e>.controller.ts` tenga en su módulo los archivos de la tabla y sus specs.

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
- **Monitor:** no es `@Public()`. `JwtAuthGuard` omite las rutas marcadas con `@MonitorRoute()` y las protege `MonitorSessionGuard` con su cookie de sesión (§10). El resto de la API solo acepta `Bearer`.
- **Detalle:** `harness/reference/contrato-http.md`.

## 9. Contrato HTTP

- Prefijo `/api/v1`, recursos en kebab-case y query params en camelCase.
- `ValidationPipe` con `whitelist`, `forbidNonWhitelisted` y `transform`.
- **Éxito:** `{ data, meta? }`. `meta` (`pagination` y `filters`) solo cuando el endpoint pagina o filtra.
- **Error:** `{ error: { code, message, details?, requestId, path, timestamp } }` con el status HTTP correcto.
- Los errores de PostgreSQL nunca se exponen tal cual.
- **CORS:** allowlist por entorno en `CORS_ORIGINS` (orígenes exactos, `https://` salvo `localhost`). Nunca `*`, `origin: true` ni reflejar el origen de la petición; sin `credentials`. Métodos `GET`, `POST` y `OPTIONS`.
- **Ejemplos, tabla de códigos y CORS:** `harness/reference/contrato-http.md`.

## 10. Logging, health y monitor

- **Logs:** JSON estructurado con `requestId` (`X-Request-Id`), con redacción de tokens, contraseñas y secretos. Nunca `console.log`. En desarrollo local, `LOG_FORMAT=pretty` muestra una línea legible por evento con los mismos campos y la misma redacción; por defecto y en producción siempre es `json` (la app no arranca con `pretty` y `NODE_ENV=production`).
- **Health:** `GET /health` es público y reporta cada BD y la caché. Si una BD está caída responde `503`; si Redis está caído o deshabilitado, sigue en `200`.
- **Monitor:** `GET /monitor`, fuera de `/api/v1`, es un tablero HTML renderizado en el servidor con React, sin JavaScript en el cliente. Se activa con `MONITOR_ENABLED=true` (si no, `404`). Pide la misma contraseña que `/auth/login` y abre una sesión en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/monitor`. Cada dato es un widget (`MonitorWidget`) y un widget que falla se muestra como "no disponible". **Nunca** muestra secretos, SQL, errores de PostgreSQL ni datos de negocio. Detalle: `harness/reference/contrato-http.md`; widgets nuevos: `harness/playbooks/new-monitor-widget.md`.

## 11. Tests (estándar NestJS)

- **Unit:** `*.spec.ts` junto a cada archivo, con `Test.createTestingModule`. El repository se mockea por su token; `.sql.ts` se prueba como función pura (`text` + `values`).
- **E2E:** `test/*.e2e-spec.ts` con Supertest: auth, envelope, errores y `X-Cache`.
- Todo cambio de comportamiento lleva su test. Nunca `.skip` ni `.only` para pasar el pipeline.

## 12. Documentación obligatoria

Crear o cambiar un endpoint actualiza, **en el mismo cambio**:
1. **`postman/arness-back.postman_collection.json`** (v2.1): una request mínima en la carpeta `<cliente>/<modulo>`, con `{{baseUrl}}` y `Bearer {{accessToken}}`.
2. **`FRONT.md`**: guía breve para frontend con qué devuelve, parámetros, un ejemplo recortado y **cómo consumirlo de forma recomendada**. La plantilla está en el playbook `new-endpoint`.
3. **`README.md` del módulo**: propósito, endpoints, conexión y tablas o vistas.

Cambiar `.columns.ts`, los filtros o el envelope es un **cambio de contrato**: actualiza `FRONT.md` y sube la versión de la clave de caché.

**Documentación del proyecto (`docs/`)**, plantillas en `harness/skills/nest-base/templates/docs/`:
- **`docs/EVOLUTIVO.md`**: toda entrega (endpoint, módulo, conexión, widget del monitor, cambio de contrato) agrega **en el mismo cambio** una entrada al final: fecha, cliente/módulo, qué se entregó en lenguaje de negocio y referencia. **Solo avance:** nunca pendientes, bloqueos, stoppers ni riesgos. Las entradas anteriores no se reescriben.
- **`docs/PENDIENTES.md`**: lo que quedó abierto (pendientes, bloqueos, recomendaciones, deuda técnica, advertencias de `init.sh` sin corregir), con fecha, contexto y tipo. Al resolverse pasa a *Resueltos*.
- **`docs/TECNICO.md`**: arquitectura, módulos, conexiones (sin credenciales), variables propias, despliegue y enlace a las decisiones. Se actualiza cuando cambian.
- `FRONT.md` sigue en la raíz.

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
9. Abre CORS (`*`, `origin: true` o reflejar el origen) o habilita `credentials`.
10. Deja el monitor sin `MonitorSessionGuard`, lo marca `@Public()` o muestra en él secretos, SQL, errores crudos o datos de negocio.
11. Importa `modules/` desde `common/`, o un módulo o cliente desde otro.
12. Lee `process.env` fuera de `src/config/` (salvo en tests).

## 14. Convenciones

- **Idioma:** código, nombres de archivo y commits en **inglés**; documentación en **español**.
- **Nombres:** archivos en kebab-case con sufijo de rol (`portfolio-summary.service.ts`), clases en PascalCase y variables de entorno en UPPER_SNAKE_CASE.
- **TypeScript:** `strict`, sin `any` (usa `unknown` y acota), tipos de retorno explícitos en la API pública.
- **Commits:** Conventional Commits, ej. `feat(fiduprevisora/cartera): add summary endpoint`.
- **Configuración:** sin valores mágicos; todo lo configurable sale de `src/config/` y se valida al arrancar. `process.env` se lee **solo** en `src/config/configuration.ts`, que agrupa y tipa las variables (`AppConfig`); el resto del código usa `ConfigService<AppConfig, true>`. Los secretos no tienen valor por defecto. Lo verifican ESLint (`configBoundaries`) e `init.sh`. Detalle: `harness/reference/configuracion.md`.

## 15. Cómo trabaja el agente

1. **Confirma el contrato con el humano antes de codificar:** cliente, módulo y segmento; conexión y tablas o vistas; columnas; filtros (tipos, obligatorios u opcionales); paginación (default y máximo); TTL de caché.
2. **Implementa** con el playbook correspondiente (§16).
3. **Definition of Done:**
   - [ ] Patrón §5 completo, con un spec por archivo
   - [ ] SQL solo en `.sql.ts` y parametrizado
   - [ ] Guard JWT activo y `X-Cache` presente
   - [ ] Postman, `FRONT.md` y README del módulo actualizados
   - [ ] Entrada en `docs/EVOLUTIVO.md` (solo avance) y lo abierto en `docs/PENDIENTES.md`
   - [ ] Variables nuevas en `.env.example`, `.env.local` y `src/config/`
   - [ ] Decisión nueva registrada en `harness/decisiones/` (si aplica)
   - [ ] `./harness/init.sh` termina en 0 y sin advertencias nuevas
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
| Agregar un widget al monitor | `harness/playbooks/new-monitor-widget.md` |
| Revisar un cambio | `harness/playbooks/review.md` |
| Variables de entorno | `harness/reference/configuracion.md` |
| Envelope, errores, auth, CORS, health, monitor | `harness/reference/contrato-http.md` |
| Registrar una decisión | `harness/decisiones/README.md` |

## 17. Decisiones (base inmutable)

La base del harness (todo `harness/` salvo `harness/decisiones/`, `harness/arness.config.json` y `harness/progress.md`, más los puentes de la raíz) **no se edita para reflejar decisiones del proyecto.** Cada decisión (dependencia, excepción, convención, regla por cliente, cambio de contrato) es un archivo en `harness/decisiones/`:
- **Formato:** `harness/decisiones/NNNN-titulo-kebab.md`, desde `_plantilla.md`, y agregada al índice de `harness/decisiones/README.md`.
- **Estados:** `Propuesta` → `Aceptada` → `Reemplazada por NNNN` | `Obsoleta`. Solo `Aceptada` es vinculante.
- **Precedencia:** una decisión `Aceptada` prevalece sobre la base **solo dentro de su alcance**.
- **Inmutabilidad:** no se reescribe; se reemplaza con una nueva y en la anterior solo se actualiza el estado.

Un agente:
1. Lee las decisiones `Aceptada` relevantes antes de implementar.
2. Ante una decisión humana no cubierta por la base, o una aprobación de algo prohibido, redacta la decisión en `Propuesta` y pide que la acepten.
3. **Nunca** edita la base. `arness sync` detecta las ediciones y se detiene. Las mejoras al harness se proponen en el repo del paquete `@bi-analytics/arness-back` y llegan con una nueva versión.
