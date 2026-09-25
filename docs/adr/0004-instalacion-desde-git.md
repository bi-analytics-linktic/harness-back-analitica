# 0004. Instalar el paquete desde git, sin registro npm

- **Estado:** Aceptada
- **Fecha:** 2026-09-25
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** Distribución de `@linktic/arness-back`
- **Relación con la base:** Modifica el canal de publicación de 0003 (el resto de 0003 sigue vigente)
- **Reemplaza a:** —

## Contexto

0003 contemplaba publicar en Azure Artifacts. Eso exige crear un feed y distribuir credenciales (`.npmrc`) en cada máquina y pipeline. El repo ya vive en GitHub (`bi-analytics-linktic/harness-back`) y el equipo tiene acceso a él.

## Decisión

- Sin registro npm. Cada versión es un **tag git `vX.Y.Z`** que coincide con `package.json`.
- **Instalación:**
  - en un proyecto con `package.json`: `pnpm add -D "git+https://github.com/bi-analytics-linktic/harness-back.git#vX.Y.Z"` y luego `pnpm arness init`;
  - en un repo nuevo sin `package.json`: clon temporal del tag y `node <clon>/bin/arness.mjs init`, para no crear un `package.json` antes que Nest.
- Actualizar es cambiar el tag en la devDependency y ejecutar `pnpm arness sync`.
- El CI solo corre los tests y valida que el tag coincida con la versión; no publica.

## Consecuencias

- Cero infraestructura: basta con tener acceso de lectura al repo.
- `pnpm up` no detecta versiones nuevas; el tag se cambia a mano, apoyándose en el CHANGELOG.
- La instalación es algo más lenta, porque pnpm clona el repo.
- Pasar a un registro más adelante no cambia el CLI ni el formato de `harness/`.

## Alternativas descartadas

- **Azure Artifacts o GitHub Packages:** versiones más cómodas, pero con un feed y credenciales que mantener. Se puede retomar si el número de backends crece.
