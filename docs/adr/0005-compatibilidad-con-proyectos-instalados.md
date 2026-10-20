# 0005. Compatibilidad con proyectos instalados: init.sh por advertencias y actualización reversible

- **Estado:** Aceptada
- **Fecha:** 2026-10-20
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** `init.sh`, el CLI `arness` y la política de versiones del paquete
- **Relación con la base:** Modifica AGENTS.md §0 (qué hace el agente ante un hallazgo de `init.sh`) y extiende 0003
- **Reemplaza a:** —

## Contexto

Varios backends en producción ya tienen instalada la v0.1.0. Con ella, `init.sh` terminaba en exit 1 ante cualquier hallazgo y AGENTS.md §0 obligaba al agente a detenerse. Cada regla nueva del harness (CORS, auth, LTS, monitor) volvería rojo un proyecto que funciona y bloquearía el trabajo diario, o llevaría a un agente a "corregir" código que está bien. Tampoco había forma documentada de volver atrás después de un `arness sync`.

## Decisión

- **`init.sh` es informativo por defecto.** Cada chequeo tiene un id (`categoria.nombre`). Por defecto los hallazgos son advertencias y el script termina en 0.
- **Única excepción crítica:** `.env` o `.env.local` versionado en git. Siempre termina en 1 y no se puede silenciar.
- **Modo estricto opcional:** `--strict` (o `"strict": true` en `harness/arness.config.json`) convierte los hallazgos en fallos. Lo usan el CI del paquete y la skill `nest-base` al crear un proyecto nuevo.
- **`harness/arness.config.json` pertenece al repo.** Permite `strict`, `ignore` (con motivo obligatorio) y `required` (un chequeo que falla aunque no haya `--strict`). `sync` y `rollback` nunca lo tocan.
- **`--json`** expone los hallazgos a agentes y pipelines.
- **Los agentes reportan y continúan:** no corrigen advertencias fuera del alcance de la tarea y no introducen advertencias nuevas (AGENTS.md §0 y §15).
- **`sync` solo escribe la base** (archivos del manifiesto y puentes): nunca `src/`, `test/`, `package.json`, `.env*`, `.gitignore`, `Dockerfile`, pipelines, `harness/decisiones/` ni `progress.md`. Antes de escribir guarda un respaldo en `harness/.arness-backup/` (los últimos 3, ignorados en git), y `arness rollback` lo restaura. `--diff` muestra los cambios línea a línea.
- **`arness doctor`** resume, sin modificar nada, qué le falta a un proyecto para cumplir la versión instalada.
- **Reglas nuevas solo hacia adelante:** lo que cambia el código de la app se aplica en proyectos nuevos vía `nest-base`. En los existentes aparece como advertencia con su guía en la sección "Para proyectos existentes" del CHANGELOG. Las variables nuevas son opcionales y su valor por defecto conserva el comportamiento actual.
- **Prueba de compatibilidad en el CI:** un proyecto instalado con una versión anterior se sincroniza a la actual; se comprueba que ningún archivo fuera de la base cambia, que `init.sh` termina en 0 y que `rollback` restaura la base exacta.

## Consecuencias

- Actualizar el harness deja de ser riesgoso para los proyectos en producción y se puede revertir.
- Los hallazgos dejan de bloquear. El riesgo es que se acumulen: se compensa con `doctor`, con la regla de no agregar advertencias nuevas y con `strict`/`required` para quien quiera exigirlos.
- Cada chequeo nuevo de `init.sh` debe usar `issue <id>` (advertencia) salvo que sea una fuga de secretos (`crit`).

## Alternativas descartadas

- **Mantener exit 1 por defecto:** bloquea proyectos que funcionan con cada versión nueva.
- **Todo como advertencia, sin excepciones:** un `.env` versionado expone credenciales; se decidió que siga bloqueando.
- **Pedir a cada proyecto que se ponga al día antes de actualizar:** frena la adopción de correcciones de seguridad del propio harness.
