# 0015. Detectar la última LTS de Node y actualizar solo con aprobación humana

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** `init.sh` (sección Toolchain), playbook `update-node-lts.md`, AGENTS.md §0 y §16, agente `lider` y pistas de `arness doctor`
- **Relación con la base:** Extiende AGENTS.md §2 (Node.js en su última LTS)
- **Reemplaza a:** —

## Contexto

AGENTS.md §2 exige la última LTS de Node, pero solo se resolvía al crear la base (skill `nest-base`). Después, `init.sh` solo comparaba el Node instalado con `.nvmrc`: un proyecto podía quedarse en una LTS vieja, incluso fuera de soporte, sin que nadie lo notara.

## Decisión

- **`init.sh` compara `.nvmrc` con la última LTS** publicada en `https://nodejs.org/dist/index.json` (`curl` con 5 s de límite):
  - major anterior → `toolchain.node-lts` (advertencia, ADR 0005), que remite al playbook;
  - misma LTS con una versión más nueva → solo informativo;
  - sin red o respuesta inválida → se omite, nunca bloquea por conectividad.
  - `NODE_LTS_VERSION` fija la LTS con la que comparar (pruebas, redes sin salida) y `off` desactiva la comparación.
- **Actualizar es decisión humana.** El playbook `update-node-lts.md` guía un análisis de solo lectura (soporte, archivos que fijan la versión, `engines` de las dependencias, cambios incompatibles) que se presenta al humano. Solo con un **sí** explícito se cambian `.nvmrc`, `engines`, `Dockerfile`, pipeline y `@types/node`. Si no aprueba, queda en `docs/PENDIENTES.md` y la advertencia sigue visible.

## Consecuencias

- Cuando sale una nueva LTS, todos los proyectos lo ven en el siguiente `init.sh`, sin cambiar de versión del harness.
- `init.sh` hace una petición de red; sin red el resultado es el mismo que antes.
- El agente nunca cambia el runtime sin aprobación, en línea con AGENTS.md §13.4.

## Alternativas descartadas

- **Actualizar automáticamente:** un cambio de major puede romper dependencias o la imagen Docker; necesita análisis y aprobación.
- **Fijar la LTS en el paquete y actualizarla en cada versión:** depende de publicar el harness y de que cada proyecto ejecute `sync`.
- **Fallo en lugar de advertencia:** rompería proyectos en producción por un cambio externo (ADR 0005).
