# 0002. El harness vive en su propia carpeta `harness/`

- **Estado:** Aceptada
- **Fecha:** 2026-09-25
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** Todo el repositorio
- **Relación con la base:** Extiende AGENTS.md §4 y §17; actualiza las rutas mencionadas en 0001
- **Reemplaza a:** —

## Contexto

El proyecto NestJS se genera en la raíz del repositorio. Tener los archivos del harness mezclados en la raíz (`docs/agents/`, `.agents/`, `decisiones/`, `init.sh`) dificulta separar qué es proyecto y qué es harness, y arriesga que se cuelen en el build, los tests o la imagen Docker.

## Decisión

- Todo el harness vive en `harness/`: `AGENTS.md`, `init.sh`, `agents/`, `skills/`, `playbooks/`, `reference/`, `decisiones/` y `progress.md`.
- En la raíz solo quedan **puentes** sin contenido propio, porque cada herramienta busca en rutas fijas:
  - `AGENTS.md`: enlace simbólico a `harness/AGENTS.md` (Codex, Cursor y otros);
  - `CLAUDE.md` → `@harness/AGENTS.md`, y `GEMINI.md` → `@./harness/AGENTS.md`;
  - `.cursor/rules/agents.mdc` → `harness/AGENTS.md`;
  - `.claude/agents` y `.claude/skills` → enlaces a `harness/agents` y `harness/skills`;
  - `.agents/skills` → enlace a `harness/skills` (Codex).
- La verificación se ejecuta con `./harness/init.sh`, que trabaja siempre desde la raíz del proyecto.
- `harness/` se excluye de `tsconfig*.json`, `.dockerignore` y `.prettierignore`. `init.sh` lo verifica.
- Las rutas que menciona la decisión 0001 (`docs/agents/playbooks/`, `.cursor/rules/`…) se leen con esta nueva ubicación.

## Consecuencias

- El proyecto NestJS y el harness quedan separados, y el harness se puede copiar a otro repositorio moviendo `harness/` y recreando los puentes.
- Se depende de enlaces simbólicos. En Windows requieren `git config core.symlinks true` (y modo desarrollador); si no, el `AGENTS.md` de la raíz aparece como un archivo de texto con la ruta.

## Alternativas descartadas

- **Mover también los puentes:** las herramientas dejarían de detectar el harness.
- **Copias en lugar de enlaces:** duplican contenido y se desincronizan.
