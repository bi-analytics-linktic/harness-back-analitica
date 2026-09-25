# 0003. Distribuir el harness como paquete npm con CLI

- **Estado:** Aceptada
- **Fecha:** 2026-09-25
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** Paquete `@linktic/arness-back` y los repos que lo instalan
- **Relación con la base:** Extiende 0001 y 0002
- **Reemplaza a:** —

## Contexto

El harness debe instalarse en varios backends y mejorarse con el tiempo sin que cada repo mantenga su propia copia divergente. Cada repo, a la vez, necesita registrar sus propias decisiones.

## Decisión

- Se publica como `@linktic/arness-back` (el nombre deja espacio para un futuro `arness-front`), con un CLI `arness`: `init`, `sync`, `status`, `verify` y `decision new`.
- **Copia gestionada, no enlaces a `node_modules`:** `init` copia la base a `harness/` del repo y registra la versión y el hash de cada archivo en `harness/.arness.json`. Todo queda versionado en git y funciona recién clonado, antes de `pnpm install`.
- **Propiedad:**
  - `harness/decisiones/` y `harness/progress.md` pertenecen al repo instalador; el paquete crea solo el esqueleto (README y plantilla) y `sync` nunca los modifica;
  - el resto de `harness/` y los puentes de la raíz son del paquete.
- **Protección de la base:** si un archivo gestionado fue editado a mano, `sync` se detiene. El cambio debe convertirse en una decisión del repo o proponerse al paquete (`--force` para sobrescribir).
- **Sin `postinstall`:** pnpm 10 bloquea por defecto los scripts de instalación, y escribir archivos al instalar sería un efecto oculto. Todo ocurre con comandos explícitos.
- **Puentes:** el CLI los crea en la instalación, porque los symlinks no se conservan de forma fiable dentro del tarball. Si el sistema no permite symlinks, los copia (`--copy`), lo que resuelve el caso de Windows planteado en 0002.
- **Decisiones del harness:** las de este paquete viven en `docs/adr/` y no se instalan. Cada repo empieza con `harness/decisiones/` vacía.
- **Versionado semántico:**
  - patch: correcciones;
  - minor: playbooks, skills o reglas nuevas compatibles;
  - major: cambios de estructura o rutas.

  Publicación desde Azure Pipelines al crear un tag `vX.Y.Z`.

## Consecuencias

- Actualizar un backend es `pnpm up @linktic/arness-back && pnpm arness sync`, y el diff queda en un PR revisable.
- La base aparece duplicada en cada repo (a propósito: es lo que leen los agentes).
- Mejorar el harness exige hacerlo en el repo del paquete y publicar una versión.

## Alternativas descartadas

- **Enlaces a `node_modules/`:** quedan rotos antes de instalar dependencias y ocultan los cambios de versión.
- **`postinstall` que copie archivos:** pnpm lo bloquea por defecto y es un efecto secundario no evidente.
- **git submodule o subtree:** más fricción y no permite proteger la base con hashes.
