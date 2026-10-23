# 0011. Documentación del proyecto en docs/: técnico, evolutivo y pendientes

- **Estado:** Aceptada
- **Fecha:** 2026-10-23
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** plantilla `templates/docs/` de `nest-base`, AGENTS.md §4, §12 y §15, playbooks, agentes, `review.md` e `init.sh`
- **Relación con la base:** Extiende AGENTS.md §12 (documentación obligatoria)
- **Reemplaza a:** —

## Contexto

El harness solo exigía `FRONT.md`, Postman y el README de cada módulo. No había un lugar estándar para la documentación técnica ni para la historia del proyecto: el avance quedaba disperso en commits y conversaciones, mezclado con pendientes y bloqueos, y era difícil mostrarle a negocio qué se había entregado (HRN-14).

## Decisión

- **`docs/` en la raíz del proyecto** (no en `harness/`: es del proyecto), con tres archivos desde `templates/docs/`:
  - **`EVOLUTIVO.md`:** trazabilidad cronológica del avance. Cada entrega (endpoint, módulo, conexión, widget, cambio de contrato) agrega al final una entrada con fecha, cliente/módulo, qué se entregó en lenguaje de negocio, detalle técnico y referencia. **Solo avance:** nunca pendientes, bloqueos, stoppers ni riesgos. Las entradas no se reescriben.
  - **`PENDIENTES.md`:** pendientes, bloqueos, recomendaciones, deuda técnica y advertencias de `init.sh` sin corregir, con fecha, contexto y tipo; al resolverse pasan a *Resueltos*.
  - **`TECNICO.md`:** arquitectura, módulos, conexiones (sin credenciales), variables propias, despliegue y enlace a las decisiones.
- **`FRONT.md` no cambia** ni de contenido ni de ubicación.
- **El agente las escribe** como parte de cada tarea (playbooks, Definition of Done §15, `implementador`); el `revisor` verifica la entrada y que `EVOLUTIVO.md` no tenga pendientes.
- **`init.sh`:** `docs.files` advierte cada archivo que falta (ADR 0005). `arness sync` **no** crea `docs/`: nunca toca archivos del proyecto; `doctor` lo propone como novedad recomendada (ADR 0012).

## Consecuencias

- Negocio puede leer qué se entregó sin mirar el repositorio; lo abierto queda visible en un solo lugar.
- Cada entrega toca un archivo más; el costo es bajo y lo verifica la revisión.
- Los proyectos existentes reciben advertencias hasta copiar la plantilla.

## Alternativas descartadas

- **Generar el evolutivo desde commits:** los mensajes de commit son técnicos y en inglés; el evolutivo es para negocio y en español.
- **Un solo archivo con avance y pendientes:** es justo la mezcla que se quiere evitar.
- **Que `sync` cree `docs/`:** rompería la garantía de que `sync` solo escribe la base del harness.
