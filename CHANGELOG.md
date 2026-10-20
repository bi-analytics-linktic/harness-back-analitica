# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/):
- **major:** cambios de estructura o rutas del harness, con migración en `arness sync`;
- **minor:** reglas, playbooks, skills o checks nuevos compatibles;
- **patch:** correcciones.

## [Sin publicar]

### Cambiado
- `init.sh` ya no bloquea por defecto: los hallazgos son **advertencias** y termina en 0, con un resumen por categoría. Cada chequeo tiene un id (`categoria.nombre`).
- Única excepción crítica: `.env` o `.env.local` versionado en git sigue terminando en 1 y no se puede silenciar.
- AGENTS.md §0 y §15, agentes `lider`, `implementador` y `revisor`, y `review.md`: el agente reporta las advertencias y continúa, sin corregir lo que está fuera de alcance ni introducir advertencias nuevas.
- `arness sync` respalda la base anterior en `harness/.arness-backup/` antes de escribir y ya no modifica `.gitignore`. Sin cambios no crea respaldo.
- La skill `nest-base` verifica el proyecto nuevo con `./harness/init.sh --strict`. El CI del paquete también usa `--strict`.
- La detección de SQL fuera de `*.sql.ts` (ESLint e `init.sh`) reconoce consultas tras saltos de línea o `(` y las escrituras `INSERT INTO`, `UPDATE … SET`, `DELETE FROM` y `MERGE INTO`, sin marcar enums como `SELECT = 'x'` ni `'DELETE'` como método HTTP.
- AGENTS.md §5: la regla de agrupación cuenta archivos del mismo tipo **en una misma carpeta**, y los specs mínimos por endpoint son de controller, service, repository, sql y query DTO.
- El repo del paquete tiene `eslint` como devDependency para sus pruebas; el CI ejecuta `pnpm install --frozen-lockfile` antes de los tests. No afecta a los proyectos instalados.

### Agregado
- `init.sh --strict` (comportamiento anterior) y `--json` (salida para agentes y pipelines).
- `harness/arness.config.json` (opcional, del repo; `sync` no lo toca): `strict`, `ignore` con motivo y `required`.
- `arness rollback [--dry-run] [--force]`: restaura la base desde el último respaldo.
- `arness doctor [--full]`: qué le falta al proyecto para cumplir la versión instalada, sin modificar nada.
- `arness sync --diff`: diff línea a línea de cada archivo de la base.
- Tests de compatibilidad: sincronizar un proyecto instalado no cambia ningún archivo fuera de la base, `init.sh` sigue en 0 y `rollback` restaura la base exacta.
- ADR 0005.
- **CORS con allowlist por entorno** (ADR 0006): regla en AGENTS.md §9 y §13, detalle en `contrato-http.md`, variables `CORS_ORIGINS` (obligatoria en proyectos nuevos) y `CORS_MAX_AGE_SECONDS` en `configuracion.md`, plantilla `templates/cors/` (`cors.ts` + spec) y e2e `templates/e2e/cors.e2e-spec.ts` en `nest-base`. `init.sh`: `security.cors-env`, `security.cors` y `security.cors-open`. `review.md`: CORS abierto o con comodín es bloqueante.
- **Fronteras de arquitectura verificadas** (ADR 0007): plantilla `eslint.boundaries.mjs` (`@typescript-eslint/no-restricted-imports`, sin dependencias nuevas) que impide importar `modules/` desde `common/` y entre módulos o clientes. `init.sh`, sección Arquitectura: `architecture.eslint-boundaries`, `architecture.common-imports-modules`, `architecture.module-imports`, `architecture.grouping` y `architecture.endpoint-files`. Prueba `test/eslint-boundaries.test.mjs` con casos de imports prohibidos y permitidos.
- **Tablero monitor** (ADR 0008): `GET /monitor` renderizado en el servidor con React, sin JavaScript en el cliente, protegido por `ACCESS_TOKEN` con cookie de sesión y `MonitorSessionGuard`, cabeceras CSP, widgets `MonitorWidget` con el multi-provider `MONITOR_WIDGETS` y widget base `endpoints-total`. Plantillas `templates/monitor/` y `templates/e2e/monitor.e2e-spec.ts`, variables `MONITOR_ENABLED` y `MONITOR_SESSION_EXPIRES_IN`, playbook `new-monitor-widget.md`. `init.sh`: `security.monitor-env` y `security.monitor-guard`. `react` y `react-dom` pasan a dependencias aprobadas, solo para el monitor.

### Para proyectos existentes
- **No hay cambios obligatorios.** Después de `pnpm arness sync`, `./harness/init.sh` puede mostrar advertencias que antes eran fallos: el proyecto sigue funcionando igual.
- Ejecuta `pnpm arness doctor` para ver qué falta y adóptalo cuando convenga.
- Si tienes `.env` o `.env.local` en git, `init.sh` terminará en 1: sácalo del índice (`git rm --cached .env`) y rota los secretos.
- Si quieres el comportamiento anterior, crea `harness/arness.config.json` con `{ "strict": true }`.
- Si algo no te convence: `pnpm arness rollback`.
- **CORS:** `init.sh` advertirá `security.cors-env` / `security.cors` hasta que lo adoptes. Copia `harness/skills/nest-base/templates/cors/cors.ts` (y su spec) a `src/config/`, valida `CORS_ORIGINS` al arrancar, cambia `app.enableCors(...)` en `src/main.ts` por `app.enableCors(buildCorsOptions(...))` y agrega `CORS_ORIGINS` y `CORS_MAX_AGE_SECONDS` a `.env.example` y `.env.local`. Antes de desplegar, define en cada entorno los orígenes de los frontends que consumen la API: con la allowlist, un origen no listado deja de funcionar desde el navegador.
- **Fronteras:** copia `templates/eslint.boundaries.mjs` a la raíz e impórtala en `eslint.config.mjs` (`...architectureBoundaries`). Si aparecen imports entre módulos, mueve lo compartido a `src/common/`. Los hallazgos de `architecture.*` son advertencias: corrígelos cuando toques ese módulo.
- **Monitor (opcional):** requiere aprobar `react` y `react-dom` en el proyecto. Copia `templates/monitor/` a `src/common/monitor/`, registra `MonitorModule`, excluye `monitor` del prefijo global, haz que `JwtAuthGuard` omita `IS_MONITOR_ROUTE_KEY` y agrega `MONITOR_ENABLED=false` y `MONITOR_SESSION_EXPIRES_IN=15m`. Sin `src/common/monitor/`, `init.sh` no verifica nada del monitor.

## [0.1.0] - 2026-09-25

### Agregado
- CLI `arness`: `init`, `sync`, `status`, `verify` y `decision new`.
- Base del harness en `harness/`:
  - `AGENTS.md` e `init.sh`;
  - agentes `lider`, `implementador` y `revisor`;
  - skill `nest-base`;
  - playbooks, referencias y plantilla de `progress.md`.
- Esqueleto de `harness/decisiones/`, que pertenece al repo instalador.
- Puentes para Claude Code, Codex, Gemini CLI y Cursor, con copia automática donde no hay symlinks.
- Instalación desde git con tags `vX.Y.Z` (sin registro npm).
