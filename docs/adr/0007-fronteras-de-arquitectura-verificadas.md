# 0007. Fronteras de arquitectura verificadas por ESLint e init.sh

- **Estado:** Aceptada
- **Fecha:** 2026-10-20
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** plantillas de ESLint de `nest-base`, `init.sh`, AGENTS.md §4 y §5, y las pruebas del paquete
- **Relación con la base:** Hace verificables reglas que ya existían en AGENTS.md §4 y §5
- **Reemplaza a:** —

## Contexto

AGENTS.md ya decía que `common/` no importa de `modules/`, que los módulos no se importan entre sí y que cada endpoint sigue el patrón §5 con la regla de agrupación. Nada lo verificaba: un agente podía importar un repository de otro módulo y el cambio pasaba lint, build y tests. La detección de SQL fuera de `*.sql.ts` solo miraba `SELECT`/`WITH` al inicio de un literal.

## Decisión

- **ESLint sin dependencias nuevas:** `eslint.boundaries.mjs` (plantilla de `nest-base`) usa `@typescript-eslint/no-restricted-imports` con patrones `regex`:
  - `src/common/**` no importa nada que pase por `modules/`;
  - un archivo de `src/modules/<cliente>/<modulo>/` no sale de su módulo salvo hacia `src/common/` o `src/config/`, y no importa con rutas absolutas `src/modules/...`. Se genera un bloque por profundidad de carpeta (hasta 5 niveles), porque la regla compara el texto del import, no la ruta resuelta.
- Se usa la versión de typescript-eslint de la regla para que el override que habilita `pg` en repositories (regla base) no apague las fronteras.
- **`init.sh` (sección Arquitectura):** resuelve las rutas y advierte imports de `common/` a `modules/` y entre módulos o clientes (útil en proyectos cuyo ESLint aún no tiene las fronteras), la regla de agrupación por carpeta, los archivos del patrón §5 de cada `<e>.controller.ts` y los specs de controller, service, repository, sql y query DTO, y si `eslint.config.mjs` no aplica `eslint.boundaries.mjs`.
- **SQL fuera de `*.sql.ts`:** ESLint e `init.sh` detectan también consultas tras saltos de línea o `(`, y `INSERT INTO`, `UPDATE … SET`, `DELETE FROM` y `MERGE INTO`, evitando falsos positivos como `SELECT = 'x'` en un enum o `'DELETE'` como método HTTP.
- **Pruebas en el repo del paquete:** `test/eslint-boundaries.test.mjs` aplica la plantilla con ESLint y demuestra que los imports prohibidos fallan y los permitidos pasan. `eslint` es devDependency **solo del repo del paquete** (no se publica ni se instala en los proyectos).

## Consecuencias

- Las fronteras dejan de depender de la revisión manual.
- Los chequeos nuevos de `init.sh` son advertencias (ADR 0005): los proyectos existentes no se rompen y `--strict` los exige en proyectos nuevos.
- La regla de agrupación queda precisada: cuenta archivos del mismo tipo **en una misma carpeta**, porque con carpetas por endpoint un módulo con 3 endpoints siempre tiene 3 controllers.

## Alternativas descartadas

- **`eslint-plugin-import` (`no-restricted-paths`) o `eslint-plugin-boundaries`:** resuelven rutas, pero son dependencias nuevas en cada proyecto.
- **Solo `init.sh`:** el error aparecería tarde; ESLint lo marca en el editor.
