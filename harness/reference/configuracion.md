# Referencia: variables de entorno

Parte de la base del harness (AGENTS.md §6 a §10). Todas las variables:
- se declaran en `.env.example` con valores de ejemplo y en `.env.local` con valores locales;
- se validan en `src/config/` al arrancar.

`.env` nunca lo toca un agente. Si falta una variable requerida, la app falla al arrancar con un mensaje claro.

## Dónde se leen las variables

`process.env` se lee **solo** en `src/config/configuration.ts` (plantilla `harness/skills/nest-base/templates/config/`). Ese archivo agrupa las variables por tema y convierte sus tipos; el resto del código recibe la configuración ya tipada.

```typescript
// src/config/configuration.ts (extracto)
export function buildConfiguration(env: Env): AppConfig {
  return {
    app: { nodeEnv: text(env, 'NODE_ENV', 'development'), port: int(env, 'PORT', 3000) },
    databases: parseDatabases(env), // DATABASES=MAIN,REPORTS → { MAIN: { host, port, ... }, REPORTS: {...} }
    // cache, cors...
  };
}
export default (): AppConfig => buildConfiguration(process.env);
```

- **Registro:** `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'], validate, load: [configuration] })`. La validación (class-validator) revisa las variables crudas; `configuration.ts` solo agrupa y convierte.
- **Consumo:** `ConfigService<AppConfig, true>` con rutas tipadas, por ejemplo `config.get('cache.enabled', { infer: true })`. También en `main.ts` (`app.get(ConfigService)`): ni siquiera el puerto se lee de `process.env`.
- **Secretos sin valor por defecto** (`DB_*_PASSWORD`): si faltan, la app no arranca. El error nombra la variable, nunca su valor. Los defaults son solo para valores no sensibles.
- **Tests:** los specs y `test/` pueden preparar `process.env`; `buildConfiguration(env)` es una función pura que se prueba con un objeto propio.
- **Verificación:** ESLint (`configBoundaries` de `eslint.boundaries.mjs`, regla `no-restricted-properties`) e `init.sh` (`env.process-env`, `env.configuration-file`, `env.eslint`).

**Agregar una variable** es, en el mismo cambio: `.env.example` + `.env.local` + validación + `configuration.ts` (y su tipo `AppConfig`) + esta referencia.

## App

```dotenv
NODE_ENV=development             # development | test | production (default development)
PORT=3000
HTTP_TRUST_PROXY=                # proxies de confianza: loopback, linklocal, uniquelocal o IP/subred; vacía = IP del socket
LOG_LEVEL=info                   # en desarrollo se recomienda debug
LOG_FORMAT=json                  # json (default, producción) | pretty (solo desarrollo local)
```

- `HTTP_TRUST_PROXY`: lista separada por comas. Balanceador en red privada: `loopback, uniquelocal`. La app no arranca con `true`, un número de saltos u otro valor (`contrato-http.md`, Cabeceras de seguridad).
- `LOG_FORMAT=pretty` requiere `pino-pretty` en devDependencies y no se acepta con `NODE_ENV=production`. `.env.local` usa `pretty`; `.env.example` documenta `json`.

## Bases de datos (conexiones nombradas)

```dotenv
DATABASES=MAIN,REPORTS          # una sola BD: DATABASES=MAIN

DB_MAIN_HOST=localhost
DB_MAIN_PORT=5432
DB_MAIN_NAME=analytics
DB_MAIN_USER=readonly_user
DB_MAIN_PASSWORD=change-me
DB_MAIN_SSL=false
DB_MAIN_POOL_MAX=10
DB_MAIN_STATEMENT_TIMEOUT_MS=30000

DB_REPORTS_HOST=...             # mismo bloque por cada nombre en DATABASES
```

- `common/database` crea un `Pool` por nombre y lo expone con `getPoolToken('<NOMBRE>')`.
- Requeridas por conexión: `HOST`, `PORT`, `NAME`, `USER` y `PASSWORD`. `init.sh` las verifica en `.env.example`.

## Caché

```dotenv
CACHE_ENABLED=true
REDIS_URL=redis://localhost:6379
CACHE_DEFAULT_TTL_SECONDS=300
CACHE_KEY_PREFIX=arness
CACHE_OP_TIMEOUT_MS=200
```

## CORS

```dotenv
CORS_ORIGINS=http://localhost:4200,https://reportes.example.com   # obligatoria; orígenes exactos separados por comas
CORS_MAX_AGE_SECONDS=600                                           # opcional; caché del preflight (0–86400)
```

- `CORS_ORIGINS` es **obligatoria**: sin ella la app no arranca. No admite `*` ni comodines, solo orígenes (`esquema://host[:puerto]`, sin ruta), y exige `https://` salvo `localhost`, `127.0.0.1` y `[::1]`.
- Cada entorno define su lista (desarrollo, QA, producción). `init.sh` verifica que `.env.example` la define y que no lleva `*`.
