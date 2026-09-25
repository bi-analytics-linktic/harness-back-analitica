# 0001. Registrar las decisiones fuera de la base del harness

- **Estado:** Aceptada
- **Fecha:** 2026-09-25
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** Todo el repositorio
- **Relación con la base:** Nueva (AGENTS.md §17)
- **Reemplaza a:** —

## Contexto

`AGENTS.md` es la base común de los backends de analítica y lo leen varios agentes (Claude Code, Codex, Gemini CLI, Cursor). Si cada decisión del proyecto se escribiera directamente en él, la base crecería sin control y se perdería el historial de por qué se decidió cada cosa.

## Decisión

- La base del harness (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/` y `docs/agents/playbooks/`) no se modifica para reflejar decisiones del proyecto.
- Toda decisión futura se registra como un archivo en `decisiones/`, con el formato de `_plantilla.md`, y se agrega al índice de `decisiones/README.md`.
- Las decisiones `Aceptada` prevalecen sobre la base dentro de su alcance.

## Consecuencias

- La base se mantiene estable y se puede reutilizar tal cual en nuevos servicios.
- Los agentes deben leer `decisiones/` antes de implementar, lo que suma algo de contexto.
- Queda un historial auditable de decisiones y de sus reemplazos.

## Alternativas descartadas

- **Editar `AGENTS.md` directamente:** mezcla la base con particularidades del proyecto y no deja historial.
- **Una sección de "excepciones" dentro de `AGENTS.md`:** tiene el mismo problema de contaminar la base.
