---
name: nest-base
description: Crea la base del proyecto NestJS de este harness (Node.js en su última LTS, NestJS en su última versión estable, pnpm, ESLint y Prettier configurados, y la estructura common/ de AGENTS.md). Úsala solo cuando el repositorio aún no tiene package.json y el humano pide inicializar o crear la base del backend.
---

# Skill: nest-base

Crea el esqueleto NestJS que exige `AGENTS.md`. Esta skill **instala dependencias y consulta la red**, así que solo se ejecuta cuando el humano lo pide expresamente.

Referencias: `AGENTS.md` §2 (stack y dependencias aprobadas), §4 (estructura y fronteras), §6 a §10 (BD, caché, auth, contrato HTTP y CORS, logging, health y monitor) y §13 (prohibiciones). Detalle de implementación: `harness/reference/configuracion.md` (variables) y `harness/reference/contrato-http.md` (envelope, errores, auth, CORS, caché, logging, health, monitor).

**Plantillas** (`harness/skills/nest-base/templates/`): se copian tal cual al proyecto, sin cambiar su intención. Cada archivo indica su destino en la primera línea; quita ese comentario al copiarlo.

**Raíz del proyecto (`ROOT`):** la carpeta que **contiene** `harness/`, no `harness/` ni el directorio actual. Antes de empezar, haz `cd` a `ROOT`; todas las rutas de esta skill son relativas a él. El proyecto NestJS se crea en `ROOT`, nunca dentro de `harness/`.

## 0. Precondiciones: si alguna falla, detente e informa

1. `./harness/init.sh` termina en 0. Sin `package.json` corre en modo "solo harness".
2. **No existe `package.json`.** Si existe, la base ya fue creada: no la regeneres; informa y termina.
3. `pnpm` está disponible (`pnpm -v`). Nunca uses npm ni yarn.

## 1. Resolver versiones (siempre las actuales, nunca de memoria)

```bash
# Node.js: última LTS publicada
curl -fsSL https://nodejs.org/dist/index.json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>x.lts);console.log(r.version, r.lts)})'

# NestJS: última versión estable (dist-tag "latest", nunca next/beta/rc)
pnpm view @nestjs/cli version
pnpm view @nestjs/core version

# pnpm: última estable
pnpm view pnpm version
```

- NestJS no publica una línea "LTS". En este harness, "última LTS de NestJS" significa **la última versión estable del dist-tag `latest`**.
- Si el major de `node -v` no coincide con la LTS resuelta, **detente**. Pide al humano que la instale (por ejemplo `nvm install --lts` o `fnm install --lts`). No instales Node por tu cuenta.
- Informa al humano las versiones resueltas antes de continuar.

## 2. Generar el proyecto sin pisar el harness

```bash
# ROOT = primera carpeta hacia arriba que contiene harness/AGENTS.md
ROOT="$(pwd)"; while [ "$ROOT" != "/" ] && [ ! -f "$ROOT/harness/AGENTS.md" ]; do ROOT="$(dirname "$ROOT")"; done
[ -f "$ROOT/harness/AGENTS.md" ] || { echo "No se encontró harness/AGENTS.md"; exit 1; }
cd "$ROOT"
TMP="$(mktemp -d)"
pnpm dlx @nestjs/cli@<version-cli> new <nombre-paquete> \
  --package-manager pnpm --strict --skip-git --directory "$TMP/app"
rsync -a --ignore-existing --exclude node_modules "$TMP/app/" "$ROOT/"
rm -rf "$TMP"
```

- `<nombre-paquete>`: el nombre del directorio del repo en kebab-case, salvo que el humano indique otro.
- `--ignore-existing` protege `harness/` y los puentes de la raíz (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/`, `.claude/` y `.agents/`).
- Elimina el ejemplo de Nest (`app.controller.ts`, `app.service.ts`, su spec y `test/app.e2e-spec.ts`).
- Reemplaza el `README.md` generado por uno breve en español que apunte a `AGENTS.md` y a `./harness/init.sh`.

## 3. Dependencias (solo las aprobadas en AGENTS.md §2)

```bash
pnpm install
pnpm add @nestjs/config @nestjs/jwt @nestjs/terminus pg ioredis \
  class-validator class-transformer nestjs-pino pino-http react react-dom
pnpm add -D @types/pg @types/react @types/react-dom
```

- Sin versiones fijadas a mano: pnpm resuelve la última estable y el lockfile las congela.
- `react` y `react-dom` son solo para el monitor (`src/common/monitor/`); no se usan en ningún otro lugar.
- Si pnpm avisa que ignoró scripts de build (`pnpm approve-builds`), muestra la lista al humano y espera su aprobación.
- Agrega el harness como devDependency desde git, con el tag de la versión del manifiesto (no hay registro npm):
  ```bash
  pnpm add -D "git+https://github.com/bi-analytics-linktic/harness-back.git#v$(node -p "require('./harness/.arness.json').version")"
  ```
  Requiere acceso de lectura al repo en GitHub. Si falla por autenticación, detente e informa; no lo quites de la lista.
- Cualquier paquete adicional requiere aprobación explícita y una decisión en `harness/decisiones/`.

## 4. Toolchain, ESLint y Prettier

1. **Node fijado:** crea `.nvmrc` con la versión LTS resuelta (ej. `v24.11.0`). En `package.json` define:
   - `"engines": { "node": ">=<major>" }`
   - `"packageManager": "pnpm@<version>"`
2. **Scripts de `package.json`:** agrega o ajusta estos. `init.sh` depende de `lint:check`, `format:check`, `build`, `test` y `test:e2e`.
   ```json
   {
     "lint": "eslint \"{src,test}/**/*.ts\" --fix",
     "lint:check": "eslint \"{src,test}/**/*.ts\" --max-warnings 0",
     "format": "prettier --write \"{src,test}/**/*.ts\"",
     "format:check": "prettier --check \"{src,test}/**/*.ts\"",
     "verify": "./harness/init.sh",
     "harness:status": "arness status",
     "harness:sync": "arness sync"
   }
   ```
3. **ESLint:** reemplaza `eslint.config.mjs` con `harness/skills/nest-base/templates/eslint.config.mjs` y copia `.../templates/eslint.boundaries.mjs` a la raíz (la importa `eslint.config.mjs`). Si la versión generada por Nest usa una API distinta (por ejemplo `defineConfig`), conserva su base y porta el bloque de reglas del harness y los overrides por archivo sin cambiar su intención:
   - no `any`;
   - no `console`;
   - no promesas flotantes;
   - `pg` solo en `common/database` y `*.repository.ts`;
   - texto SQL solo en `*.sql.ts` (también tras saltos de línea o `(`, e incluidas escrituras);
   - nada de escrituras o DDL en `*.sql.ts`;
   - fronteras (`eslint.boundaries.mjs`): `src/common` no importa de `src/modules`, y un módulo no importa de otro módulo ni de otro cliente; solo sale hacia `src/common` y `src/config`. Usa `@typescript-eslint/no-restricted-imports`, separada de la regla de `pg`, sin dependencias nuevas.
4. **Prettier:** copia `harness/skills/nest-base/templates/prettierrc.json` → `.prettierrc` y `.../templates/prettierignore` → `.prettierignore`.
5. **Editor:** copia `harness/skills/nest-base/templates/editorconfig` → `.editorconfig`.
6. **Aislar el harness del proyecto:**
   - `tsconfig.json` y `tsconfig.build.json`: agrega `"harness"` a `exclude`.
   - `.dockerignore`: incluye `harness`, `.agents`, `.claude`, `.cursor`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.env`, `.env.local`, `node_modules`, `dist` y `coverage`.
   - `.prettierignore`: agrega `harness`.
7. **`.gitignore`:** asegúrate de que incluye `dist/`, `coverage/`, `node_modules/`, `logs/`, `.env`, `.env.local`, `.env.*.local` y `harness/progress.md`.
8. **Convención SQL:** las palabras clave SQL se escriben en MAYÚSCULAS. Así las detectan la regla de ESLint y `init.sh`.

## 5. Estructura base (AGENTS.md §4)

Implementa cada pieza con su spec. Sin lógica de negocio y sin módulos de ejemplo: `src/modules/` queda vacío con un `.gitkeep`.

| Ruta | Contenido mínimo |
|---|---|
| `src/main.ts` | Logger pino (`bufferLogs`), prefijo `api/v1` excluyendo `health` y `monitor` (`{ exclude: ['health', 'monitor', 'monitor/{*path}'] }`, o la sintaxis de rutas de la versión de Nest), `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`, `app.enableCors(buildCorsOptions(...))` con los valores validados de config, `enableShutdownHooks`, puerto desde config |
| `src/app.module.ts` | Importa config, logging, database, cache, auth, health; registra el guard JWT global y el filtro de errores |
| `src/config/` | `ConfigModule` global con `envFilePath: ['.env.local', '.env']`; validación con class-validator que falla al arrancar, incluida la validación dinámica de `DB_<NOMBRE>_*` por cada nombre en `DATABASES`. `cors.ts` y `cors.spec.ts` desde `templates/cors/`: la validación llama a `parseCorsOrigins` y `parseCorsMaxAge`, así que la app no arranca sin `CORS_ORIGINS` o con `*` |
| `src/common/database/` | `DatabaseModule` dinámico: un `Pool` por nombre, `getPoolToken(name)`, sesión con `default_transaction_read_only=on` y `statement_timeout`, cierre en shutdown |
| `src/common/cache/` | `CacheService` sobre ioredis (`lazyConnect`, `enableOfflineQueue: false`, `commandTimeout`, reintentos con backoff). No lanza nunca y devuelve `HIT` / `MISS` / `BYPASS`. Hash estable de filtros (claves ordenadas → sha256). Con `CACHE_ENABLED=false` no conecta |
| `src/common/auth/` | `POST auth/login` y `POST auth/refresh` (`@Public()`), `timingSafeEqual` sobre sha256 de ambos valores, secretos distintos y claim `type`, `JwtAuthGuard` como `APP_GUARD`. El guard omite las rutas con `@Public()` y con `IS_MONITOR_ROUTE_KEY` (`@MonitorRoute()`, de `src/common/monitor/monitor.decorators.ts`) |
| `src/common/http/` | Tipos `{ data, meta? }`, filtro global de errores `{ error: { code, message, details?, requestId, path, timestamp } }`. Errores de pg: `57014` → 504 `QUERY_TIMEOUT`; errores de conexión o `08*` / `57P01` → 503 `DATABASE_UNAVAILABLE` |
| `src/common/logging/` | `nestjs-pino` en JSON, `genReqId` desde `X-Request-Id` o UUID y devuelto en la respuesta, `redact` de authorization, password, tokens y `*_SECRET` / `*_PASSWORD` |
| `src/common/health/` | `GET /health` público con terminus. Indicadores `db_<nombre en minúsculas>` por conexión y `cache` con estado `up` / `down` / `disabled`; la caché nunca vuelve el health a 503 |
| `src/common/monitor/` | Copia `templates/monitor/` completo (con sus specs) y registra `MonitorModule` en `app.module.ts`. `GET /monitor` fuera de `/api/v1`, `404` si `MONITOR_ENABLED` no es `true`, login con `ACCESS_TOKEN` y cookie de sesión, cabeceras CSP sin scripts, widget base `endpoints-total` (contrato-http.md, Monitor) |
| `test/` | `auth.e2e-spec.ts` (login OK, login inválido, refresh, 401 sin token), `health.e2e-spec.ts` (pools y Redis mockeados con `overrideProvider`), y `cors.e2e-spec.ts` y `monitor.e2e-spec.ts` desde `templates/e2e/` |

### Archivos de soporte

- **`.env.example` y `.env.local`:** las mismas claves. Incluyen `PORT=3000`, `DATABASES=MAIN`, `DB_MAIN_*`, `ACCESS_TOKEN=example123`, `JWT_*`, `CACHE_*`, `REDIS_URL`, `LOG_LEVEL`, `CORS_ORIGINS=http://localhost:4200`, `CORS_MAX_AGE_SECONDS=600`, `MONITOR_ENABLED=false` y `MONITOR_SESSION_EXPIRES_IN=15m`. En `.env.example` todos los secretos llevan valores de ejemplo. **No crees ni toques `.env`.**
- **`postman/arness-back.postman_collection.json`** (formato v2.1): variables `baseUrl`, `accessToken` y `refreshToken`, y auth Bearer heredada. Carpeta `Auth` con Login (su script de test guarda los tokens) y Refresh, más la request `Health`. Agrega también `postman/local.postman_environment.json` con `baseUrl=http://localhost:3000`.
- **`FRONT.md`:**
  - flujo de auth (login, uso del Bearer, refresh ante `401 TOKEN_EXPIRED`);
  - envelope `{ data, meta? }` y formato de error;
  - significado de `X-Cache`;
  - CORS: el origen del frontend debe estar en `CORS_ORIGINS` de cada entorno (pedirlo al backend);
  - endpoints de Auth con su consumo recomendado.
- **`Dockerfile`:** multi-stage con `node:<major-lts>-alpine`, `corepack enable`, `pnpm install --frozen-lockfile`, build y una imagen final solo con `dist/` y las dependencias de producción; usuario no root y `HEALTHCHECK` sobre `/health`.
- **`azure-pipelines.yml`:** Node desde `.nvmrc`, `corepack enable`, `pnpm install --frozen-lockfile`, `lint:check`, `format:check`, `build`, `test` y `docker build`.

## 6. Verificar (con protección contra bucles)

```bash
pnpm lint && pnpm format
./harness/init.sh --strict
```

- Un proyecto nuevo nace cumpliendo todo: `./harness/init.sh --strict` debe terminar en 0, incluido `/health`. Los proyectos existentes usan el modo por defecto (advertencias). Si no hay PostgreSQL local disponible, el health informará las BDs caídas: repórtalo al humano y no lo "arregles" desactivando checks.
- Corrige solo fallos causados por archivos que esta skill creó. **Máximo 3 intentos de corrección.** Si sigue fallando, detente y reporta la salida de `init.sh`.
- Nunca relajes reglas de ESLint, umbrales ni checks de `init.sh` para pasar.

## 7. Reporte final

Informa:
- las versiones resueltas (Node LTS, NestJS, pnpm);
- los archivos creados;
- las dependencias instaladas;
- el resultado de `./harness/init.sh`;
- los pendientes (por ejemplo, credenciales reales de BD en `.env.local`).

No hagas commit salvo que el humano lo pida.
