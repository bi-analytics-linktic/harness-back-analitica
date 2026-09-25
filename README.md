# @linktic/arness-back

Harness de agentes IA para los **backends NestJS de analítica**. Funciona con Claude Code, Codex, Gemini CLI y Cursor, e incluye:
- reglas (`AGENTS.md`);
- verificación de estado (`init.sh`);
- agentes `lider`, `implementador` y `revisor`;
- la skill `nest-base`;
- playbooks y referencias.

Se instala **directamente desde este repositorio git**, sin registro npm, fijando un tag de versión (`vX.Y.Z`). Las **decisiones de cada proyecto** (`harness/decisiones/`) quedan en el repo que lo instala, y el paquete nunca las modifica.

## Requisitos

- Node.js ≥ 20, pnpm y git.
- Acceso de lectura a `github.com/bi-analytics-linktic/harness-back`: SSH, `gh auth login` o Git Credential Manager.

Para comprobar el acceso:

```bash
git ls-remote https://github.com/bi-analytics-linktic/harness-back.git
```

## Instalación

Elige el caso según el estado del repo donde vas a instalarlo. En los comandos, `v0.1.0` es la versión; usa la última de [CHANGELOG.md](CHANGELOG.md).

### A. Repo nuevo, antes de crear el proyecto NestJS (sin `package.json`)

`pnpm add` crearía un `package.json` antes que Nest. Por eso el harness se instala desde un clon temporal del tag:

```bash
cd mi-backend                       # carpeta del nuevo backend (con git init hecho)

git clone --depth 1 --branch v0.1.0 \
  https://github.com/bi-analytics-linktic/harness-back.git /tmp/arness-back
node /tmp/arness-back/bin/arness.mjs init
rm -rf /tmp/arness-back

./harness/init.sh                   # debe quedar en verde (modo solo harness)
```

Después, pide a tu agente **"crea la base del proyecto NestJS"** (skill `nest-base`). Por ejemplo en Claude Code: `claude --agent lider`, o `/nest-base`. La skill crea el proyecto en la raíz y agrega el harness como devDependency desde git con el mismo tag.

### B. Proyecto que ya tiene `package.json`

```bash
pnpm add -D "git+https://github.com/bi-analytics-linktic/harness-back.git#v0.1.0"
pnpm arness init
./harness/init.sh
```

Con SSH en lugar de HTTPS: `pnpm add -D "git+ssh://git@github.com/bi-analytics-linktic/harness-back.git#v0.1.0"`.

### Qué hace `arness init`

- Copia la base a `harness/` y crea `harness/decisiones/` con el README y la plantilla.
- Crea los puentes de la raíz: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/`, `.claude/` y `.agents/`.
- Escribe `harness/.arness.json` con la versión instalada y el hash de cada archivo de la base.
- Agrega `harness/progress.md` al `.gitignore`.

Luego haz commit de todo. El harness queda versionado y funciona recién clonado, antes de `pnpm install`.

```
harness/
├── .arness.json        manifiesto: versión + hash de cada archivo gestionado
├── AGENTS.md, init.sh, agents/, skills/, playbooks/, reference/    ← del paquete (no editar)
├── decisiones/         ← del repo: se crea una vez y sync nunca la toca
└── progress.md         ← del repo, no versionado
AGENTS.md → harness/AGENTS.md · CLAUDE.md · GEMINI.md · .cursor/rules/ · .claude/{agents,skills} · .agents/skills
```

## Uso diario

```bash
./harness/init.sh                                   # o: pnpm arness verify
pnpm arness decision new "Usar réplica de lectura"  # nueva decisión en harness/decisiones/
pnpm arness status                                  # versión instalada e integridad de la base
```

## Actualizar a una versión nueva

Al no haber registro, `pnpm up` no detecta versiones nuevas: se cambia el tag a mano.

```bash
pnpm add -D "git+https://github.com/bi-analytics-linktic/harness-back.git#v0.2.0"
pnpm arness sync --dry-run          # ver qué cambiaría
pnpm arness sync                    # aplicar
./harness/init.sh
git add -A && git commit -m "chore(harness): update to v0.2.0"
```

`arness sync`:
- solo escribe los archivos del manifiesto, y nunca toca `harness/decisiones/` ni `harness/progress.md`;
- si alguien editó un archivo de la base, **se detiene**. Ese cambio debe registrarse como decisión del repo o proponerse a este paquete (`--force` sobrescribe);
- con `--copy` crea copias en lugar de enlaces simbólicos, útil en Windows sin symlinks. `init` lo hace solo si no puede crear el enlace.

## Desarrollo del paquete

```bash
pnpm test               # tests del CLI (node --test)
./harness/init.sh       # en este repo verifica el harness y el CLI, no un proyecto NestJS
pnpm pack:check         # archivos que se instalan
```

- La base que se distribuye es todo `harness/`, salvo las decisiones numeradas y `progress.md`.
- Las decisiones de diseño **del harness** están en `docs/adr/` y no se instalan.

### Publicar una versión

1. Actualiza `CHANGELOG.md`.
2. Sube la versión con `pnpm version <patch|minor|major>`, que crea el commit y el tag `vX.Y.Z`:
   - **patch:** correcciones;
   - **minor:** reglas, playbooks o skills compatibles;
   - **major:** cambios de estructura o rutas.
3. Publica con `git push --follow-tags`. El tag es la versión instalable; no hay nada más que publicar.

El CI (`azure-pipelines.yml`) corre los tests y valida que el tag coincida con `package.json`.
