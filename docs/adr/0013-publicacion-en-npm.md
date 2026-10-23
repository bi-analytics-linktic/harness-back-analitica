# 0013. Publicar el paquete en el registro público de npm

- **Estado:** Aceptada
- **Fecha:** 2026-10-23
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** Distribución de `@linktic/arness-back`
- **Relación con la base:** Modifica el canal de publicación de 0003
- **Reemplaza a:** 0004

## Contexto

0004 instalaba el paquete desde git con tags `vX.Y.Z`. Eso exige acceso de lectura al repo en GitHub en cada máquina y pipeline, hace más lenta la instalación (pnpm clona el repo) y `pnpm up` / `pnpm outdated` no detectan versiones nuevas.

## Decisión

- El paquete se publica en el **registro público de npm** (`registry.npmjs.org`) bajo el scope `@linktic`, con `publishConfig.access = public`.
- Cada versión sigue teniendo su **tag git `vX.Y.Z`**, que coincide con `package.json`; se publica con `pnpm publish` desde ese commit.
- **Instalación:**
  - en un proyecto con `package.json`: `pnpm add -D @linktic/arness-back@X.Y.Z` y luego `pnpm arness init`;
  - en un repo nuevo sin `package.json`: `pnpm dlx @linktic/arness-back@X.Y.Z init`, para no crear un `package.json` antes que Nest.
- Actualizar es `pnpm add -D @linktic/arness-back@X.Y.Z` (o `pnpm up`) y `pnpm arness sync`.

## Consecuencias

- El contenido del paquete (todo `harness/` salvo decisiones numeradas y `progress.md`) es **público**: no puede incluir secretos, datos de clientes ni información interna sensible. `pnpm pack:check` se revisa antes de cada publicación.
- Instalar no requiere credenciales; publicar requiere una cuenta npm con permiso de escritura en el scope `@linktic`.
- Una versión publicada no se puede reemplazar; solo se retira dentro de las primeras 72 h y su número queda bloqueado. Los errores se corrigen con una versión nueva.
- `pnpm outdated` y `pnpm up` detectan versiones nuevas.
- El CLI y el formato de `harness/` no cambian; los proyectos instalados desde git siguen funcionando y pasan a npm al actualizar.

## Alternativas descartadas

- **Seguir desde git (0004):** sin infraestructura, pero con las limitaciones de acceso y versiones descritas.
- **Registro privado (npm restricted, Azure Artifacts o GitHub Packages):** requiere plan de pago o feed propio y distribuir tokens en cada máquina y pipeline.
