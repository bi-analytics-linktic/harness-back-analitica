# 0009. Configuración centralizada: process.env solo en src/config/configuration.ts

- **Estado:** Aceptada
- **Fecha:** 2026-10-23
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** plantillas de `nest-base` (`templates/config/`, `eslint.boundaries.mjs`, `eslint.config.mjs`), `init.sh`, AGENTS.md §13 y §14, `configuracion.md`
- **Relación con la base:** Precisa AGENTS.md §14 (dónde se lee la configuración) y agrega la prohibición §13.12
- **Reemplaza a:** —

## Contexto

AGENTS.md exigía declarar las variables en `.env.example` y `.env.local` y validarlas al arrancar, pero no decía dónde se leen. Nada impedía usar `process.env.X` en un service, un repository o `main.ts`: lecturas dispersas, sin tipo, con defaults distintos en cada lugar y variables que escapaban a la validación (HRN-19).

## Decisión

- **Un solo punto de lectura:** `src/config/configuration.ts` (plantilla `templates/config/`). Agrupa las variables por tema (`app`, `logging`, `databases`, `cache`, `auth`, `cors`, `monitor`), convierte tipos y exporta `AppConfig`. `buildConfiguration(env)` es pura; el default export la llama con `process.env` para `ConfigModule.forRoot({ load: [configuration] })`.
- **Nombres actuales del harness** (`DB_<NOMBRE>_*`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`); no se renombra ninguna variable.
- **Secretos sin valor por defecto:** `required()` falla nombrando la variable, nunca su valor. `REDIS_URL` es obligatoria solo con `CACHE_ENABLED=true`.
- **Consumo:** `ConfigService<AppConfig, true>` con rutas tipadas, también en `main.ts`. La validación con class-validator se mantiene sobre las variables crudas.
- **Un solo archivo** mientras sea legible; si supera ~150 líneas se divide por tema con `registerAs`, conservando `AppConfig`.
- **Tests:** los specs y `test/` pueden preparar `process.env`.
- **Verificación sin dependencias nuevas:** `configBoundaries` en `eslint.boundaries.mjs` (regla base `no-restricted-properties`, que ningún override del harness apaga) e `init.sh` (`env.configuration-file`, `env.process-env`, `env.eslint`), como advertencias (ADR 0005).
- **`NODE_ENV`** entra a la lista de variables (default `development`); lo usa el formato de logs (ADR 0010).

## Consecuencias

- Toda la configuración de la app se ve en un archivo y tiene tipo.
- Agregar una variable toca cinco lugares (`.env.example`, `.env.local`, validación, `configuration.ts`, `configuracion.md`); `review.md` lo verifica.
- Los proyectos existentes reciben advertencias y migran módulo por módulo (CHANGELOG, "Para proyectos existentes").
- La plantilla del monitor sigue leyendo claves crudas con `ConfigService.get('MONITOR_ENABLED')`; es válido (no usa `process.env`) y se puede migrar a rutas tipadas después.

## Alternativas descartadas

- **Regla `no-process-env` de ESLint:** obsoleta desde ESLint 7 y se elimina en la 11.
- **Agregarla a `no-restricted-syntax`:** los overrides de `*.sql.ts` y `*.sql.spec.ts` reemplazan esa regla y la apagarían.
- **Zod u otra librería de esquemas:** dependencia nueva; class-validator ya está aprobado.
