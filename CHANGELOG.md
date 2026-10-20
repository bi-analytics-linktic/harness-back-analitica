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

### Agregado
- `init.sh --strict` (comportamiento anterior) y `--json` (salida para agentes y pipelines).
- `harness/arness.config.json` (opcional, del repo; `sync` no lo toca): `strict`, `ignore` con motivo y `required`.
- `arness rollback [--dry-run] [--force]`: restaura la base desde el último respaldo.
- `arness doctor [--full]`: qué le falta al proyecto para cumplir la versión instalada, sin modificar nada.
- `arness sync --diff`: diff línea a línea de cada archivo de la base.
- Tests de compatibilidad: sincronizar un proyecto instalado no cambia ningún archivo fuera de la base, `init.sh` sigue en 0 y `rollback` restaura la base exacta.
- ADR 0005.

### Para proyectos existentes
- **No hay cambios obligatorios.** Después de `pnpm arness sync`, `./harness/init.sh` puede mostrar advertencias que antes eran fallos: el proyecto sigue funcionando igual.
- Ejecuta `pnpm arness doctor` para ver qué falta y adóptalo cuando convenga.
- Si tienes `.env` o `.env.local` en git, `init.sh` terminará en 1: sácalo del índice (`git rm --cached .env`) y rota los secretos.
- Si quieres el comportamiento anterior, crea `harness/arness.config.json` con `{ "strict": true }`.
- Si algo no te convence: `pnpm arness rollback`.

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
