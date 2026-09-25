# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/):
- **major:** cambios de estructura o rutas del harness, con migración en `arness sync`;
- **minor:** reglas, playbooks, skills o checks nuevos compatibles;
- **patch:** correcciones.

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
