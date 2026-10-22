# Referencia: variables de entorno

Parte de la base del harness (AGENTS.md §6 a §10). Todas las variables:
- se declaran en `.env.example` con valores de ejemplo y en `.env.local` con valores locales;
- se validan en `src/config/` al arrancar.

`.env` nunca lo toca un agente. Si falta una variable requerida, la app falla al arrancar con un mensaje claro.

## App

```dotenv
PORT=3000
LOG_LEVEL=info
```

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

## Autenticación

```dotenv
ACCESS_TOKEN=example123          # contraseña compartida para /auth/login
JWT_ACCESS_SECRET=change-me
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change-me-too # distinto de JWT_ACCESS_SECRET
JWT_REFRESH_EXPIRES_IN=7d
```

## CORS

```dotenv
CORS_ORIGINS=http://localhost:4200,https://reportes.example.com   # obligatoria; orígenes exactos separados por comas
CORS_MAX_AGE_SECONDS=600                                           # opcional; caché del preflight (0–86400)
```

- `CORS_ORIGINS` es **obligatoria**: sin ella la app no arranca. No admite `*` ni comodines, solo orígenes (`esquema://host[:puerto]`, sin ruta), y exige `https://` salvo `localhost`, `127.0.0.1` y `[::1]`.
- Cada entorno define su lista (desarrollo, QA, producción). `init.sh` verifica que `.env.example` la define y que no lleva `*`.

## Monitor

```dotenv
MONITOR_ENABLED=false             # true para habilitar GET /monitor; con false responde 404
MONITOR_SESSION_EXPIRES_IN=15m    # duración de la cookie de sesión del monitor
```

- Por defecto `false`. Habilítalo solo donde el equipo lo necesite; en producción requiere aprobación.
- El login usa `ACCESS_TOKEN` y la sesión se firma con `JWT_ACCESS_SECRET`: no hay secretos nuevos.
- Si existe `src/common/monitor/`, `init.sh` verifica que `.env.example` define ambas variables.
