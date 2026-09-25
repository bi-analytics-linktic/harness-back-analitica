---
name: nest-base
description: Crea la base del proyecto NestJS de este harness (Node.js en su última LTS, NestJS en su última versión estable, pnpm, ESLint y Prettier configurados, y la estructura common/ de AGENTS.md). Úsala solo cuando el repositorio aún no tiene package.json y el humano pide inicializar o crear la base del backend.
---

# Skill: nest-base

Crea el esqueleto NestJS que exige `AGENTS.md`. Esta skill **instala dependencias y consulta la red**, así que solo se ejecuta cuando el humano lo pide expresamente.

Referencias: `AGENTS.md` §2 (stack y dependencias aprobadas), §4 (estructura), §6 a §10 (BD, caché, auth, contrato HTTP, logging y health) y §13 (prohibiciones). Detalle de implementación: `docs/agents/reference/configuracion.md` (variables) y `docs/agents/reference/contrato-http.md` (envelope, errores, auth, caché, logging, health).

## 0. Precondiciones: si alguna falla, detente e informa

1. `./init.sh` pasa. Sin `package.json` corre en modo "solo harness".
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
TMP="$(mktemp -d)"
pnpm dlx @nestjs/cli@<version-cli> new <nombre-paquete> \
  --package-manager pnpm --strict --skip-git --directory "$TMP/app"
rsync -a --ignore-existing --exclude node_modules "$TMP/app/" ./
rm -rf "$TMP"
```

- `<nombre-paquete>`: el nombre del directorio del repo en kebab-case, salvo que el humano indique otro.
- `--ignore-existing` protege `AGENTS.md`, los puentes, `decisiones/`, `docs/`, `.agents/` e `init.sh`.
- Elimina el ejemplo de Nest (`app.controller.ts`, `app.service.ts`, su spec y `test/app.e2e-spec.ts`).
- Reemplaza el `README.md` generado por uno breve en español que apunte a `AGENTS.md` y a `./init.sh`.

## 3. Dependencias (solo las aprobadas en AGENTS.md §2)

```bash
pnpm install
pnpm add @nestjs/config @nestjs/jwt @nestjs/terminus pg ioredis \
  class-validator class-transformer nestjs-pino pino-http
pnpm add -D @types/pg
```

- Sin versiones fijadas a mano: pnpm resuelve la última estable y el lockfile las congela.
- Si pnpm avisa que ignoró scripts de build (`pnpm approve-builds`), muestra la lista al humano y espera su aprobación.
- Cualquier paquete adicional requiere aprobación explícita y una decisión en `decisiones/`.

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
     "verify": "./init.sh"
   }
   ```
3. **ESLint:** reemplaza `eslint.config.mjs` con `templates/eslint.config.mjs`. Si la versión generada por Nest usa una API distinta (por ejemplo `defineConfig`), conserva su base y porta el bloque de reglas del harness y los overrides por archivo sin cambiar su intención:
   - no `any`;
   - no `console`;
   - no promesas flotantes;
   - `pg` solo en `common/database` y `*.repository.ts`;
   - texto SQL solo en `*.sql.ts`;
   - nada de escrituras o DDL en `*.sql.ts`.
4. **Prettier:** copia `templates/prettierrc.json` → `.prettierrc` y `templates/prettierignore` → `.prettierignore`.
5. **Editor:** copia `templates/editorconfig` → `.editorconfig`.
6. **`.gitignore`:** asegúrate de que incluye `dist/`, `coverage/`, `node_modules/`, `logs/`, `.env`, `.env.local`, `.env.*.local` y `progress.md`.
7. **Convención SQL:** las palabras clave SQL se escriben en MAYÚSCULAS. Así las detectan la regla de ESLint y `init.sh`.

## 5. Estructura base (AGENTS.md §4)

Implementa cada pieza con su spec. Sin lógica de negocio y sin módulos de ejemplo: `src/modules/` queda vacío con un `.gitkeep`.

| Ruta | Contenido mínimo |
|---|---|
| `src/main.ts` | Logger pino (`bufferLogs`), prefijo `api/v1` excluyendo `health`, `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`, `enableShutdownHooks`, puerto desde config |
| `src/app.module.ts` | Importa config, logging, database, cache, auth, health; registra el guard JWT global y el filtro de errores |
| `src/config/` | `ConfigModule` global con `envFilePath: ['.env.local', '.env']`; validación con class-validator que falla al arrancar, incluida la validación dinámica de `DB_<NOMBRE>_*` por cada nombre en `DATABASES` |
| `src/common/database/` | `DatabaseModule` dinámico: un `Pool` por nombre, `getPoolToken(name)`, sesión con `default_transaction_read_only=on` y `statement_timeout`, cierre en shutdown |
| `src/common/cache/` | `CacheService` sobre ioredis (`lazyConnect`, `enableOfflineQueue: false`, `commandTimeout`, reintentos con backoff). No lanza nunca y devuelve `HIT` / `MISS` / `BYPASS`. Hash estable de filtros (claves ordenadas → sha256). Con `CACHE_ENABLED=false` no conecta |
| `src/common/auth/` | `POST auth/login` y `POST auth/refresh` (`@Public()`), `timingSafeEqual` sobre sha256 de ambos valores, secretos distintos y claim `type`, `JwtAuthGuard` como `APP_GUARD` |
| `src/common/http/` | Tipos `{ data, meta? }`, filtro global de errores `{ error: { code, message, details?, requestId, path, timestamp } }`. Errores de pg: `57014` → 504 `QUERY_TIMEOUT`; errores de conexión o `08*` / `57P01` → 503 `DATABASE_UNAVAILABLE` |
| `src/common/logging/` | `nestjs-pino` en JSON, `genReqId` desde `X-Request-Id` o UUID y devuelto en la respuesta, `redact` de authorization, password, tokens y `*_SECRET` / `*_PASSWORD` |
| `src/common/health/` | `GET /health` público con terminus. Indicadores `db_<nombre en minúsculas>` por conexión y `cache` con estado `up` / `down` / `disabled`; la caché nunca vuelve el health a 503 |
| `test/` | `auth.e2e-spec.ts` (login OK, login inválido, refresh, 401 sin token) y `health.e2e-spec.ts` (pools y Redis mockeados con `overrideProvider`) |

### Archivos de soporte

- **`.env.example` y `.env.local`:** las mismas claves. Incluyen `PORT=3000`, `DATABASES=MAIN`, `DB_MAIN_*`, `ACCESS_TOKEN=example123`, `JWT_*`, `CACHE_*`, `REDIS_URL` y `LOG_LEVEL`. En `.env.example` todos los secretos llevan valores de ejemplo. **No crees ni toques `.env`.**
- **`postman/arness-back.postman_collection.json`** (formato v2.1): variables `baseUrl`, `accessToken` y `refreshToken`, y auth Bearer heredada. Carpeta `Auth` con Login (su script de test guarda los tokens) y Refresh, más la request `Health`. Agrega también `postman/local.postman_environment.json` con `baseUrl=http://localhost:3000`.
- **`FRONT.md`:**
  - flujo de auth (login, uso del Bearer, refresh ante `401 TOKEN_EXPIRED`);
  - envelope `{ data, meta? }` y formato de error;
  - significado de `X-Cache`;
  - endpoints de Auth con su consumo recomendado.
- **`Dockerfile`:** multi-stage con `node:<major-lts>-alpine`, `corepack enable`, `pnpm install --frozen-lockfile`, build y una imagen final solo con `dist/` y las dependencias de producción; usuario no root y `HEALTHCHECK` sobre `/health`.
- **`azure-pipelines.yml`:** Node desde `.nvmrc`, `corepack enable`, `pnpm install --frozen-lockfile`, `lint:check`, `format:check`, `build`, `test` y `docker build`.

## 6. Verificar (con protección contra bucles)

```bash
pnpm lint && pnpm format
./init.sh
```

- `./init.sh` debe terminar en verde, incluido `/health`. Si no hay PostgreSQL local disponible, el health informará las BDs caídas: repórtalo al humano y no lo "arregles" desactivando checks.
- Corrige solo fallos causados por archivos que esta skill creó. **Máximo 3 intentos de corrección.** Si sigue fallando, detente y reporta la salida de `init.sh`.
- Nunca relajes reglas de ESLint, umbrales ni checks de `init.sh` para pasar.

## 7. Reporte final

Informa:
- las versiones resueltas (Node LTS, NestJS, pnpm);
- los archivos creados;
- las dependencias instaladas;
- el resultado de `./init.sh`;
- los pendientes (por ejemplo, credenciales reales de BD en `.env.local`).

No hagas commit salvo que el humano lo pida.
