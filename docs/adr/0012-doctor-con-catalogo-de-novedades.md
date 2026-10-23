# 0012. doctor con catálogo de novedades por versión

- **Estado:** Aceptada
- **Fecha:** 2026-10-23
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** CLI `arness` (`doctor`, `sync`), `harness/reference/novedades.json`, `harness/arness.config.json` (`declined`), AGENTS.md §0 y §3, agente `lider`
- **Relación con la base:** Extiende `arness doctor` (ADR 0005)
- **Reemplaza a:** —

## Contexto

Hay proyectos en producción con versiones anteriores del harness. Instalar una versión nueva no debe dañar nada (ADR 0005), pero el equipo tampoco sabía qué traía esa versión ni qué le convenía adoptar. `doctor` solo listaba los hallazgos de `init.sh` por categoría y la guía de adopción vivía como texto libre en el CHANGELOG, que había que cruzar a mano con las advertencias (HRN-17).

## Decisión

- **Catálogo de datos en la base:** `harness/reference/novedades.json` declara cada novedad adoptable con `id`, `since`, `type` (`seguridad` | `recomendada` | `opcional`), `title`, `why`, `checks` (ids de `init.sh`), `paths`, `approval`, `steps`, `adr` y `reference`. El CHANGELOG sigue siendo para humanos; el catálogo es la fuente de `doctor`.
- **Adopción detectable:** una novedad está adoptada cuando existen sus `paths` e `init.sh` no reporta ninguno de sus `checks`. Las pruebas del paquete verifican que cada check exista en `init.sh` y cada ADR en `docs/adr/`.
- **Reporte de `doctor`:** versión instalada frente a la del paquete (sin red: el paquete de `node_modules`) y aviso si hay una más nueva; novedades por adoptar agrupadas de seguridad a opcionales, con lo que falta, pasos y aprobación requerida; adoptadas y declinadas; el resto de los hallazgos. `--json` para agentes y pipelines, `--since <versión>` para filtrar.
- **Sigue siendo solo lectura** y nunca termina en 1 por novedades sin adoptar; solo por críticos.
- **Declinar con motivo:** `harness/arness.config.json` → `"declined": { "<id>": "<motivo>" }` (del repo; `sync` no lo toca). Sin motivo no cuenta y se advierte.
- **`sync` (y `sync --dry-run`)** anuncia las novedades posteriores a la versión instalada y remite a `doctor`.
- **Agentes:** tras un `sync`, el agente ejecuta `doctor` e informa las novedades; no las implementa si no son parte de la tarea (AGENTS.md §0, agente `lider`).
- **Bases anteriores sin catálogo:** `doctor` funciona igual y solo muestra los hallazgos.

## Consecuencias

- Cada versión que traiga algo adoptable debe agregarlo al catálogo, con sus checks en `init.sh`; las pruebas lo exigen.
- El catálogo inicial cubre las novedades de 0.2.0: CORS, fronteras, monitor, configuración centralizada, formato de logs y `docs/`.
- `doctor --fix` (aplicar novedades automáticamente) queda fuera: tocaría código del proyecto.

## Alternativas descartadas

- **Parsear el CHANGELOG:** texto libre, frágil y sin forma de detectar la adopción.
- **Consultar versiones remotas por red:** el paquete se instala desde git sin registro y `doctor` debe funcionar sin conexión.
- **Silenciar novedades con `ignore`:** `ignore` es por chequeo de `init.sh`; una novedad agrupa varios y declinarla es una decisión distinta.
