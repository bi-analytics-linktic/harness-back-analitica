# 0016. Entradas del evolutivo con hora de Bogotá y responsable

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** plantilla `templates/docs/EVOLUTIVO.md`, AGENTS.md §12, playbook `new-endpoint`, `review.md`, agente `revisor` y skill `nest-base`
- **Relación con la base:** Extiende ADR 0011 (formato de las entradas de `EVOLUTIVO.md`)
- **Reemplaza a:** —

## Contexto

Las entradas de `docs/EVOLUTIVO.md` solo llevaban la fecha. Con varias entregas el mismo día y varias personas trabajando con agentes, no se sabía el orden exacto ni quién hizo cada entrega.

## Decisión

- **Encabezado:** `## AAAA-MM-DD HH:mm -0500 · <cliente>/<módulo>`, en hora de Bogotá (`TZ=America/Bogota date '+%Y-%m-%d %H:%M %z'`). Colombia no tiene horario de verano, así que el desfase es siempre `-0500`.
- **Responsable:** línea `- **Responsable:**` con `git config user.name` de quien trabaja en ese momento. Si está vacío, el agente lo pregunta; nunca pone su propio nombre. Sin correo: el evolutivo es para negocio.
- Las entradas anteriores no se reescriben (ADR 0011): el formato aplica desde la siguiente entrega.

## Consecuencias

- El evolutivo muestra el orden exacto y el responsable de cada entrega.
- El responsable depende de que cada persona tenga configurado `git config user.name`.

## Alternativas descartadas

- **Hora UTC:** el equipo y negocio trabajan en hora de Colombia.
- **Correo de git o usuario del sistema:** el correo expone datos personales en un documento para negocio; `whoami` es poco legible.
