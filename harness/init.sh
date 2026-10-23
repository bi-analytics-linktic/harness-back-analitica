#!/usr/bin/env bash
# init.sh — Revisa el estado del proyecto antes y después de cualquier cambio (AGENTS.md §0).
#
# Uso (desde cualquier carpeta): ./harness/init.sh [opciones]
#   --strict      Los hallazgos fallan (exit 1) en lugar de quedar como advertencias
#   --json        Imprime el resultado como JSON en stdout (el detalle legible va a stderr)
#   --quick       Solo harness, estructura y toolchain (sin lint, build, tests ni health)
#   --e2e         Además ejecuta pnpm test:e2e
#   --no-health   No consulta /health
#   --install     Si faltan node_modules, ejecuta pnpm install --frozen-lockfile
#   -h, --help    Muestra esta ayuda
#
# Por defecto los hallazgos son advertencias y el script termina en 0: el proyecto sigue
# funcionando. Única excepción: .env o .env.local versionado en git (fuga de secretos).
#
# Configuración del repo (opcional, sync nunca la toca): harness/arness.config.json
#   { "strict": false,
#     "ignore":   { "<id>": "<motivo>" },     silencia un chequeo
#     "required": ["<id>"] }                  ese chequeo falla aunque no haya --strict
#
# Variables opcionales:
#   HEALTH_URL          URL del health (default http://localhost:$PORT/health)
#   HEALTH_TIMEOUT_S    Segundos de espera al arrancar la app (default 30)
#
# Salida: 0 = operativo (puede haber advertencias) · 1 = fallo crítico o --strict con hallazgos · 2 = uso incorrecto

set -o pipefail

# El script vive en harness/, pero verifica desde la raíz del proyecto.
HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HARNESS_DIR")"
cd "$ROOT" || exit 2
H=harness
CONFIG="$H/arness.config.json"

STRICT=0; JSON=0; QUICK=0; E2E=0; HEALTH=1; INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    --json) JSON=1 ;;
    --quick) QUICK=1 ;;
    --e2e) E2E=1 ;;
    --no-health) HEALTH=0 ;;
    --install) INSTALL=1 ;;
    -h|--help) awk 'NR>1 && /^#/{sub(/^# ?/,""); print; next} NR>1{exit}' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $arg (usa --help)" >&2; exit 2 ;;
  esac
done

# Con --json, el detalle legible va a stderr y stdout queda solo para el JSON (fd 3).
if [ "$JSON" -eq 1 ]; then exec 3>&1 1>&2; fi

if [ -t 1 ] && [ "$JSON" -eq 0 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; RESET=''
fi

CRITS=0; FAILS=0; WARNS=0; IGNORED=0
SECTION=''
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/init-sh.XXXXXX")"
ISSUES="$LOG_DIR/issues.tsv"; : >"$ISSUES"
APP_PID=''

cleanup() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null
  fi
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT INT TERM

# ── Configuración del repo ──────────────────────────────────────────────────
CFG_IGNORE=' '; CFG_REQUIRED=' '; CFG_ERROR=''
if [ -f "$CONFIG" ]; then
  cfg="$(node -e '
    let c; try { c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
    catch (e) { console.log("error\t" + e.message); process.exit(0); }
    if (c.strict === true) console.log("strict");
    for (const [id, why] of Object.entries(c.ignore || {})) console.log(["ignore", id, String(why || "").trim()].join("\t"));
    for (const id of c.required || []) console.log("required\t" + id);
  ' "$CONFIG" 2>&1)"
  while IFS="$(printf '\t')" read -r kind id why; do
    case "$kind" in
      strict) STRICT=1 ;;
      ignore) CFG_IGNORE="$CFG_IGNORE$id "; [ -z "$why" ] && CFG_ERROR="${CFG_ERROR}ignore.$id sin motivo; " ;;
      required) CFG_REQUIRED="$CFG_REQUIRED$id " ;;
      error) CFG_ERROR="${CFG_ERROR}JSON inválido: $id; " ;;
      '') ;;
      *) CFG_ERROR="${CFG_ERROR}$kind; " ;;
    esac
  done <<EOF
$cfg
EOF
fi

# ── Salida ──────────────────────────────────────────────────────────────────
record()  { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$SECTION" "$3" >>"$ISSUES"; }
section() { SECTION="$1"; printf '\n%s%s▸ %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"; }
ok()      { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
info()    { printf '  %sℹ%s %s\n' "$BLUE" "$RESET" "$1"; }
# Aviso informativo: nunca falla, ni siquiera con --strict.
warn()    { printf '  %s⚠%s %s\n' "$YELLOW" "$RESET" "$1"; WARNS=$((WARNS + 1)); record warning "${2:--}" "$1"; }

# Hallazgo con id: advertencia por defecto; fallo con --strict o si el repo lo marca como required.
issue() { # id mensaje
  local id="$1" msg="$2"
  case "$CFG_REQUIRED" in *" $id "*) ;; *)
    case "$CFG_IGNORE" in *" $id "*)
      printf '  %s·%s %s %s(silenciado: %s)%s\n' "$BLUE" "$RESET" "$msg" "$BLUE" "$id" "$RESET"
      IGNORED=$((IGNORED + 1)); record ignored "$id" "$msg"; return ;;
    esac ;;
  esac
  if [ "$STRICT" -eq 1 ] || case "$CFG_REQUIRED" in *" $id "*) true ;; *) false ;; esac; then
    printf '  %s✖%s %s %s[%s]%s\n' "$RED" "$RESET" "$msg" "$BLUE" "$id" "$RESET"
    FAILS=$((FAILS + 1)); record failure "$id" "$msg"
  else
    printf '  %s⚠%s %s %s[%s]%s\n' "$YELLOW" "$RESET" "$msg" "$BLUE" "$id" "$RESET"
    WARNS=$((WARNS + 1)); record warning "$id" "$msg"
  fi
}

# Fallo crítico: siempre exit 1 y no se puede silenciar.
crit() { # id mensaje
  printf '  %s✖ CRÍTICO:%s %s %s[%s]%s\n' "$RED$BOLD" "$RESET" "$2" "$BLUE" "$1" "$RESET"
  CRITS=$((CRITS + 1)); record critical "$1" "$2"
}

need_file() { if [ -f "$2" ]; then ok "$2"; else issue "$1" "Falta el archivo $2"; fi; }
need_dir()  { if [ -d "$2" ]; then ok "$2/"; else issue "$1" "Falta el directorio $2/"; fi; }

# Ejecuta un comando, guarda su salida y muestra el final solo si falla.
run_step() { # id etiqueta comando...
  local id="$1" label="$2"; shift 2
  local log="$LOG_DIR/$(echo "$label" | tr -c 'a-zA-Z0-9' '_').log"
  if "$@" >"$log" 2>&1; then
    ok "$label"
  else
    issue "$id" "$label ($*)"
    tail -n 25 "$log" | sed 's/^/      │ /'
  fi
}

if [ -f "$CONFIG" ]; then
  section "Configuración"
  info "$CONFIG: modo $([ "$STRICT" -eq 1 ] && echo estricto || echo advertencias)"
  [ -n "$CFG_ERROR" ] && warn "$CONFIG: $CFG_ERROR" config.invalid
fi

# ─────────────────────────────────────────────────────────────────────────────
section "Harness"

for f in $H/AGENTS.md $H/init.sh $H/decisiones/README.md $H/decisiones/_plantilla.md \
         $H/skills/nest-base/SKILL.md $H/reference/configuracion.md $H/reference/contrato-http.md \
         $H/reference/progress-plantilla.md CLAUDE.md GEMINI.md .cursor/rules/agents.mdc; do
  need_file harness.files "$f"
done

if [ -f $H/AGENTS.md ]; then
  missing_sections=''
  for n in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17; do
    grep -q "^## $n\. " $H/AGENTS.md || missing_sections="$missing_sections §$n"
  done
  if [ -z "$missing_sections" ]; then ok "$H/AGENTS.md tiene las secciones §0–§17"
  else issue harness.agents-md "$H/AGENTS.md incompleto; faltan:$missing_sections"; fi

  # Todo archivo del harness referenciado en AGENTS.md debe existir.
  for ref in $(grep -oE "$H/(playbooks|reference|skills|agents|decisiones)/[A-Za-z0-9_./-]+\.md" $H/AGENTS.md | grep -v NNNN | sort -u); do
    [ -f "$ref" ] || issue harness.refs "AGENTS.md referencia $ref, pero no existe"
  done
fi

# Puentes de la raíz: solo enlaces e imports hacia harness/.
# Se acepta un enlace simbólico o, donde no hay symlinks (arness --copy), una copia idéntica.
check_link() { # enlace destino-relativo
  local target_abs; target_abs="$(dirname "$1")/$2"
  if [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ] && [ -e "$1" ]; then ok "$1 → $2"
  elif [ -e "$1" ] && [ ! -L "$1" ] && diff -rq "$1" "$target_abs" >/dev/null 2>&1; then ok "$1 = copia de $2"
  else issue harness.bridges "$1 debe ser un enlace simbólico (o copia idéntica) a $2"; fi
}
check_link AGENTS.md "$H/AGENTS.md"
check_link .claude/agents "../$H/agents"
check_link .claude/skills "../$H/skills"
check_link .agents/skills "../$H/skills"

grep -q "^@$H/AGENTS.md" CLAUDE.md 2>/dev/null && ok "CLAUDE.md importa $H/AGENTS.md" || issue harness.bridges "CLAUDE.md no importa @$H/AGENTS.md"
grep -q "^@\./$H/AGENTS.md" GEMINI.md 2>/dev/null && ok "GEMINI.md importa $H/AGENTS.md" || issue harness.bridges "GEMINI.md no importa @./$H/AGENTS.md"
grep -q "$H/AGENTS.md" .cursor/rules/agents.mdc 2>/dev/null && ok "Regla de Cursor apunta a $H/AGENTS.md" || issue harness.bridges "La regla de Cursor no apunta a $H/AGENTS.md"

agents_before=$((FAILS + WARNS))
for ag in lider implementador revisor; do
  f="$H/agents/$ag.md"
  if [ ! -f "$f" ]; then issue harness.agents "Falta el agente $f"; continue; fi
  for key in name description tools model; do
    awk 'NR==1 && $0!="---"{exit 1} NR>1 && $0=="---"{exit} NR>1{print}' "$f" | grep -q "^$key:" \
      || issue harness.agents "$f: falta '$key' en el frontmatter"
  done
done
[ "$((FAILS + WARNS))" -eq "$agents_before" ] && ok "Agentes lider, implementador y revisor definidos"

# ─────────────────────────────────────────────────────────────────────────────
section "Decisiones"

decision_count=0
for d in $H/decisiones/[0-9][0-9][0-9][0-9]-*.md; do
  [ -f "$d" ] || continue
  decision_count=$((decision_count + 1))
  name="$(basename "$d")"
  estado="$(grep -m1 '^- \*\*Estado:\*\*' "$d" | sed 's/^- \*\*Estado:\*\* *//')"
  if ! echo "$estado" | grep -Eq '^(Propuesta|Aceptada|Reemplazada por [0-9]{4}|Obsoleta)$'; then
    issue decisions.state "$name: estado inválido o ausente ('$estado')"
  elif [ "$estado" = "Propuesta" ]; then
    warn "$name está en Propuesta: pendiente de aceptación humana" decisions.proposed
  fi
  grep -q "($name)" $H/decisiones/README.md 2>/dev/null || issue decisions.index "$name no está en el índice de $H/decisiones/README.md"
done
dupes="$(ls $H/decisiones 2>/dev/null | grep -E '^[0-9]{4}-' | cut -c1-4 | sort | uniq -d | tr '\n' ' ')"
[ -n "$dupes" ] && issue decisions.dupes "Números de decisión duplicados: $dupes"
ok "$decision_count decisión(es) revisada(s)"

# ─────────────────────────────────────────────────────────────────────────────
section "Progress"

PROGRESS="$H/progress.md"
if [ -f "$PROGRESS" ]; then
  p_estado="$(grep -m1 '^- \*\*Estado:\*\*' "$PROGRESS" | sed 's/^- \*\*Estado:\*\* *//')"
  case "$p_estado" in
    TERMINADO) ok "$PROGRESS: TERMINADO (el líder lo reinicia en la próxima tarea)" ;;
    "EN CURSO") warn "$PROGRESS: hay trabajo EN CURSO; confirma con el humano si se retoma" progress.open ;;
    BLOQUEADO) warn "$PROGRESS: BLOQUEADO; revisa 'Bloqueos y preguntas abiertas' antes de continuar" progress.open ;;
    *) issue progress.state "$PROGRESS: estado inválido o ausente ('$p_estado'); usa EN CURSO | BLOQUEADO | TERMINADO" ;;
  esac
  p_lines="$(wc -l < "$PROGRESS" | tr -d ' ')"
  [ "$p_lines" -gt 200 ] && warn "$PROGRESS tiene $p_lines líneas; el líder debe resumir las tareas cerradas" progress.size
else
  info "Sin $PROGRESS: el líder lo crea desde la plantilla al iniciar una tarea"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "Git y secretos"

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  top="$(cd "$(git rev-parse --show-toplevel)" && pwd -P)"
  if [ "$top" != "$(pwd -P)" ]; then
    warn "El repo git raíz es $top, no este proyecto (ejecuta git init aquí)" git.root
  else
    ok "Repositorio git propio"
    env_tracked=0
    for secret in .env .env.local; do
      if git ls-files --error-unmatch "$secret" >/dev/null 2>&1; then
        crit git.env-tracked "$secret está versionado en git: sácalo del índice (git rm --cached $secret) y rota los secretos"
        env_tracked=1
      fi
    done
    [ "$env_tracked" -eq 0 ] && ok ".env y .env.local fuera de git"
    git ls-files --error-unmatch "$H/progress.md" >/dev/null 2>&1 \
      && warn "$H/progress.md está versionado; es estado de trabajo y debería estar en .gitignore" git.progress
  fi
else
  warn "No es un repositorio git" git.none
fi

# ─────────────────────────────────────────────────────────────────────────────
PKG_NAME=''
[ -f package.json ] && PKG_NAME="$(node -p "require('./package.json').name || ''" 2>/dev/null)"
HARNESS_PKG='@linktic/arness-back'

if [ "$PKG_NAME" = "$HARNESS_PKG" ]; then
  # Repo fuente del paquete: se verifica el CLI, no un proyecto NestJS.
  section "Paquete $HARNESS_PKG"
  info "Repo fuente del harness: se omiten las verificaciones de proyecto NestJS"
  need_file package.files bin/arness.mjs
  need_file package.files CHANGELOG.md
  need_file package.files docs/adr/README.md
  for d in $H/decisiones/[0-9][0-9][0-9][0-9]-*.md; do
    [ -f "$d" ] && issue package.decisions "$d: el paquete no publica decisiones de proyecto; las del harness van en docs/adr/"
  done
  if [ "$QUICK" -eq 1 ]; then info "--quick: se omiten los tests del CLI"
  else run_step package.tests "Tests del CLI" node --test; fi
else
  # ── Instalación del harness (manifiesto e integridad) ─────────────────────
  section "Instalación del harness"
  if [ -f $H/.arness.json ]; then
    inst_v="$(node -p "require('./$H/.arness.json').version" 2>/dev/null)"
    ok "Instalado $HARNESS_PKG@$inst_v"
    cli="node_modules/$HARNESS_PKG/bin/arness.mjs"
    if [ -f "$cli" ]; then
      dep_v="$(node -p "require('./node_modules/$HARNESS_PKG/package.json').version" 2>/dev/null)"
      [ "$dep_v" != "$inst_v" ] && warn "El paquete en node_modules es $dep_v y harness/ está en $inst_v: ejecuta pnpm arness sync" install.version
      if node "$cli" status --check >"$LOG_DIR/status.log" 2>&1; then ok "La base coincide con el manifiesto"
      else issue install.integrity "La base del harness fue modificada o está incompleta (pnpm arness status)"; sed 's/^/      │ /' "$LOG_DIR/status.log"; fi
    elif [ -f package.json ]; then
      warn "$HARNESS_PKG no está en node_modules: no se pudo verificar la integridad de la base" install.integrity
    fi
  else
    issue install.manifest "Falta $H/.arness.json: instala el harness (ver README de $HARNESS_PKG) y ejecuta arness init"
  fi
fi

if [ "$PKG_NAME" = "$HARNESS_PKG" ]; then
  :
elif [ ! -f package.json ]; then
  section "Proyecto"
  info "Sin package.json: modo solo harness. Para crear la base ejecuta la skill nest-base ($H/skills/nest-base)."
else
  section "Toolchain"

  if command -v node >/dev/null 2>&1; then
    node_v="$(node -v)"
    if [ -f .nvmrc ]; then
      want="$(tr -d '[:space:]v' < .nvmrc)"; have="${node_v#v}"
      if [ "${want%%.*}" = "${have%%.*}" ]; then ok "Node $node_v (esperado v$want por .nvmrc)"
      else issue toolchain.node "Node $node_v no coincide con .nvmrc (v$want)"; fi
    else
      issue toolchain.nvmrc "Falta .nvmrc con la versión LTS de Node"
    fi
  else
    issue toolchain.node "Node no está instalado"
  fi

  if command -v pnpm >/dev/null 2>&1; then ok "pnpm $(pnpm -v)"
  else issue toolchain.pnpm "pnpm no está instalado"; fi

  pm="$(node -p "require('./package.json').packageManager || ''" 2>/dev/null)"
  case "$pm" in pnpm@*) ok "packageManager: $pm" ;; *) issue toolchain.package-manager "package.json debe declarar packageManager pnpm@<versión>" ;; esac

  [ -f pnpm-lock.yaml ] && ok "pnpm-lock.yaml" || issue toolchain.lockfile "Falta pnpm-lock.yaml"
  for lock in package-lock.json yarn.lock; do
    [ -f "$lock" ] && issue toolchain.lockfile "$lock no está permitido: solo pnpm"
  done

  for s in lint:check format:check build test test:e2e; do
    node -e "process.exit(require('./package.json').scripts?.['$s'] ? 0 : 1)" 2>/dev/null \
      || issue toolchain.scripts "package.json no define el script '$s'"
  done

  # ───────────────────────────────────────────────────────────────────────────
  section "Estructura"

  for f in src/main.ts src/app.module.ts eslint.config.mjs .prettierrc .env.example \
           FRONT.md Dockerfile azure-pipelines.yml postman/arness-back.postman_collection.json; do
    need_file structure.files "$f"
  done
  # Documentación del proyecto (AGENTS.md §12): FRONT.md en la raíz y docs/ con avance y pendientes.
  for f in docs/TECNICO.md docs/EVOLUTIVO.md docs/PENDIENTES.md; do
    need_file docs.files "$f"
  done
  for d in src/config src/common/auth src/common/database src/common/cache src/common/http \
           src/common/logging src/common/health src/modules test; do
    need_dir structure.dirs "$d"
  done

  if [ -d src/modules ]; then
    for mod in $(find src/modules -mindepth 2 -maxdepth 2 -type d | sort); do
      m="$(basename "$mod")"
      [ -f "$mod/README.md" ] || issue structure.modules "$mod: falta README.md"
      [ -f "$mod/$m.module.ts" ] || issue structure.modules "$mod: falta $m.module.ts"
    done
  fi

  # El harness no debe entrar al build ni a la imagen.
  for tsc in tsconfig.json tsconfig.build.json; do
    if [ -f "$tsc" ]; then
      node -e "const c=JSON.parse(require('fs').readFileSync('$tsc','utf8'));process.exit((c.exclude||[]).some(e=>/^\\.?\\/?harness/.test(e))?0:1)" 2>/dev/null \
        || issue structure.harness-isolation "$tsc no excluye harness/"
    fi
  done
  if [ -f .dockerignore ]; then grep -qxE '/?harness/?' .dockerignore || issue structure.harness-isolation ".dockerignore no excluye harness/"
  else issue structure.harness-isolation "Falta .dockerignore"; fi

  if [ -f .gitignore ]; then
    for p in .env .env.local "$H/progress.md"; do
      grep -qxF "$p" .gitignore || issue structure.gitignore ".gitignore no excluye $p"
    done
  else
    issue structure.gitignore "Falta .gitignore"
  fi

  if [ -f .env.example ]; then
    for k in PORT DATABASES ACCESS_TOKEN JWT_ACCESS_SECRET JWT_ACCESS_EXPIRES_IN \
             JWT_REFRESH_SECRET JWT_REFRESH_EXPIRES_IN CACHE_ENABLED REDIS_URL; do
      grep -q "^$k=" .env.example || issue structure.env-example ".env.example no define $k"
    done
    grep -q '^CORS_ORIGINS=' .env.example || issue security.cors-env ".env.example no define CORS_ORIGINS (allowlist de orígenes, AGENTS.md §9)"
    if [ -d src/common/monitor ]; then
      for k in MONITOR_ENABLED MONITOR_SESSION_EXPIRES_IN; do
        grep -q "^$k=" .env.example || issue security.monitor-env ".env.example no define $k (src/common/monitor existe)"
      done
    fi
    dbs="$(grep -m1 '^DATABASES=' .env.example | cut -d= -f2 | tr ',' ' ')"
    for db in $dbs; do
      for part in HOST PORT NAME USER PASSWORD; do
        grep -q "^DB_${db}_${part}=" .env.example || issue structure.env-example ".env.example no define DB_${db}_${part}"
      done
    done
  fi

  # ───────────────────────────────────────────────────────────────────────────
  section "Reglas de SQL"

  if [ -d src ]; then
    # SQL al inicio de un literal o de una línea (consultas multilínea), también tras "(" y con escrituras.
    # Se evitan falsos positivos de identificadores: SELECT = ..., WITH = ..., 'DELETE' (método HTTP).
    sql_kw='SELECT([[:space:]]+[^=[:space:]]|[[:space:]]*$)|WITH[[:space:]]+(RECURSIVE[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*(\(|AS([[:space:]]|$))'
    sql_kw="$sql_kw|INSERT[[:space:]]+INTO[[:space:]]|UPDATE[[:space:]]+[^[:space:]]+[[:space:]]+SET[[:space:]]|DELETE[[:space:]]+FROM[[:space:]]|MERGE[[:space:]]+INTO[[:space:]]"
    sql_out="$(grep -rlE --include='*.ts' "(^|[\`'\"(])[[:space:]]*\(?[[:space:]]*($sql_kw)" src 2>/dev/null \
      | grep -vE '\.sql(\.spec)?\.ts$')"
    if [ -n "$sql_out" ]; then issue sql.outside "Texto SQL fuera de *.sql.ts: $(echo $sql_out)"
    else ok "SQL solo en *.sql.ts"; fi

    sql_write="$(grep -rliE --include='*.sql.ts' '(INSERT[[:space:]]+INTO|DELETE[[:space:]]+FROM|UPDATE[[:space:]]+[^[:space:]]+[[:space:]]+SET|TRUNCATE|(DROP|ALTER|CREATE)[[:space:]]+(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|MATERIALIZED))' src 2>/dev/null)"
    if [ -n "$sql_write" ]; then issue sql.write "Escritura o DDL en SQL (la BD es de solo lectura): $(echo $sql_write)"
    else ok "Sin escrituras ni DDL"; fi
  fi

  # ───────────────────────────────────────────────────────────────────────────
  section "Arquitectura"

  if [ -f eslint.config.mjs ]; then
    if [ -f eslint.boundaries.mjs ] && grep -q 'architectureBoundaries' eslint.config.mjs; then
      ok "ESLint verifica las fronteras de arquitectura (eslint.boundaries.mjs)"
    else
      issue architecture.eslint-boundaries "eslint.config.mjs no aplica las fronteras: copia harness/skills/nest-base/templates/eslint.boundaries.mjs e impórtala (skill nest-base §4)"
    fi
  fi

  if [ -d src ]; then
    # Fronteras (AGENTS.md §4), por si el ESLint del proyecto aún no las tiene, y patrón por endpoint (§5).
    arch="$(node -e '
      const fs = require("fs"), path = require("path");
      const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? [p + "/", ...walk(p)] : [p];
      }) : [];
      const out = (id, msg) => console.log(id + "\t" + msg);
      const importsOf = (f) => [...fs.readFileSync(f, "utf8").matchAll(/(?:from|import|require\()\s*["\x27]([^"\x27]+)["\x27]/g)].map((m) => m[1]);

      const common = walk("src/common").filter((f) => f.endsWith(".ts"));
      const bad = common.filter((f) => importsOf(f).some((s) => /(^|\/)modules(\/|$)/.test(s)));
      if (bad.length) out("architecture.common-imports-modules", "src/common importa de src/modules: " + bad.join(" "));

      const TYPES = [
        ["controller", /\.controller\.ts$/, "controllers"], ["service", /\.service\.ts$/, "services"],
        ["repository", /\.repository\.ts$/, "repositories"], ["sql", /\.sql\.ts$/, "sql"],
        ["columns", /\.columns\.ts$/, "columns"], ["dto", /\.dto\.ts$/, "dto"], ["entity", /\.entity\.ts$/, "entities"],
      ];
      const files = walk("src/modules").filter((f) => f.endsWith(".ts") && !f.endsWith(".spec.ts"));
      const crossed = [];
      for (const f of files) {
        const [, client, mod] = f.split("/").slice(1);
        for (const s of importsOf(f)) {
          const target = s.startsWith(".") ? path.normalize(path.join(path.dirname(f), s)) : s;
          const m = /^src\/modules\/([^/]+)(?:\/([^/]+))?/.exec(target);
          if (m && (m[1] !== client || (m[2] && m[2] !== mod))) crossed.push(f + " → " + s);
        }
      }
      if (crossed.length) out("architecture.module-imports", "Imports entre módulos o clientes: " + crossed.join(", "));

      const byDir = new Map();
      for (const f of files) { const d = path.dirname(f); byDir.set(d, [...(byDir.get(d) || []), path.basename(f)]); }
      for (const [dir, names] of byDir) {
        if (dir.split("/").length < 4) continue;
        for (const [type, re, folder] of TYPES) {
          const n = names.filter((x) => re.test(x)).length;
          if (n > 2 && path.basename(dir) !== folder)
            out("architecture.grouping", dir + "/: " + n + " archivos " + type + "; agrúpalos en " + folder + "/ (AGENTS.md §5)");
        }
      }

      const SPEC = ["controller", "service", "repository", "sql", "query.dto"];
      for (const ctrl of files.filter((f) => f.endsWith(".controller.ts"))) {
        const parts = ctrl.split("/");
        if (parts.length < 5) continue;
        const root = parts.slice(0, 4).join("/");
        const all = walk(root).filter((f) => f.endsWith(".ts"));
        const e = path.basename(ctrl, ".controller.ts");
        const want = [e + ".controller.ts", e + ".service.ts", e + ".repository.ts", e + ".sql.ts", e + ".columns.ts",
          e + "-query.dto.ts", e + "-filters.dto.ts", e + ".entity.ts"];
        const missing = [];
        for (const name of want) {
          const found = all.find((f) => path.basename(f) === name);
          if (!found) { missing.push(name); continue; }
          if (SPEC.some((t) => name.endsWith("." + t + ".ts") || name.endsWith("-" + t + ".ts")) &&
              !fs.existsSync(found.replace(/\.ts$/, ".spec.ts"))) missing.push(name.replace(/\.ts$/, ".spec.ts"));
        }
        if (missing.length) out("architecture.endpoint-files", "Endpoint " + e + " (" + root + "): falta " + missing.join(", "));
      }
    ' 2>&1)"
    arch_before=$((FAILS + WARNS))
    while IFS="$(printf '\t')" read -r id msg; do
      [ -n "$id" ] && issue "$id" "$msg"
    done <<EOF
$arch
EOF
    [ "$((FAILS + WARNS))" -eq "$arch_before" ] && ok "Fronteras, agrupación y patrón por endpoint (AGENTS.md §4 y §5)"
  fi

  # ───────────────────────────────────────────────────────────────────────────
  section "Variables de entorno"

  if [ -d src ]; then
    # Configuración centralizada (AGENTS.md §14): process.env solo en src/config/; los tests pueden usarlo.
    if [ -f src/config/configuration.ts ]; then ok "src/config/configuration.ts"
    else issue env.configuration-file "Falta src/config/configuration.ts: copia harness/skills/nest-base/templates/config/ (configuracion.md, Dónde se leen)"; fi

    env_out="$(grep -rnE --include='*.ts' 'process\.env|\{[^}]*\benv\b[^}]*\}[[:space:]]*=[[:space:]]*process\b' src 2>/dev/null \
      | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/?\*)' | cut -d: -f1 \
      | grep -vE '^src/config/|\.spec\.ts$' | sort -u)"
    if [ -n "$env_out" ]; then issue env.process-env "process.env fuera de src/config/ (usa ConfigService): $(echo $env_out)"
    else ok "process.env solo en src/config/"; fi
  fi
  if [ -f eslint.config.mjs ]; then
    if grep -q 'configBoundaries' eslint.config.mjs; then ok "ESLint restringe process.env a src/config/ (configBoundaries)"
    else issue env.eslint "eslint.config.mjs no aplica configBoundaries de eslint.boundaries.mjs (process.env solo en src/config/)"; fi
  fi

  # ───────────────────────────────────────────────────────────────────────────
  section "Seguridad"

  if [ -f src/main.ts ]; then
    if grep -qE 'enableCors[[:space:]]*\([[:space:]]*\)|cors:[[:space:]]*true|origin:[[:space:]]*(true|["'"'"']\*["'"'"'])' src/main.ts; then
      issue security.cors-open "src/main.ts abre CORS a cualquier origen: usa la allowlist de CORS_ORIGINS (contrato-http.md, CORS)"
    elif grep -q 'enableCors' src/main.ts; then ok "CORS configurado en src/main.ts"
    else issue security.cors "src/main.ts no configura CORS con la allowlist de CORS_ORIGINS (contrato-http.md, CORS)"; fi
  fi
  if [ -f .env.example ] && grep -E '^CORS_ORIGINS=' .env.example | grep -q '\*'; then
    issue security.cors-open ".env.example: CORS_ORIGINS no admite comodines"
  fi

  if [ -d src/common/monitor ]; then
    mon_ctrl="$(grep -rl --include='*.controller.ts' '@Controller' src/common/monitor 2>/dev/null)"
    if [ -z "$mon_ctrl" ] || grep -L 'MonitorSessionGuard' $mon_ctrl | grep -q .; then
      issue security.monitor-guard "El controller de src/common/monitor debe usar MonitorSessionGuard (AGENTS.md §10)"
    elif grep -rqE '^[[:space:]]*@Public\(' src/common/monitor; then
      issue security.monitor-guard "src/common/monitor no usa @Public(): lo protege MonitorSessionGuard (AGENTS.md §10)"
    else
      ok "Monitor protegido por MonitorSessionGuard"
    fi
  fi

  # ───────────────────────────────────────────────────────────────────────────
  section "Logging"

  # JSON en producción; formato legible solo en desarrollo (LOG_FORMAT=pretty, contrato-http.md "Logging").
  if node -e "process.exit(require('./package.json').dependencies?.['pino-pretty'] ? 0 : 1)" 2>/dev/null; then
    issue logging.pretty-production "pino-pretty está en dependencies: va solo en devDependencies (producción registra JSON)"
  fi
  if [ -f .env.example ]; then
    if grep -q '^LOG_FORMAT=' .env.example; then
      if grep -qE '^NODE_ENV=production' .env.example && grep -qE '^LOG_FORMAT=pretty' .env.example; then
        issue logging.pretty-production ".env.example combina NODE_ENV=production con LOG_FORMAT=pretty (la app no arranca así)"
      else
        ok "LOG_FORMAT definido en .env.example"
      fi
    else
      issue logging.format-env ".env.example no define LOG_FORMAT (json|pretty; configuracion.md, App)"
    fi
  fi

  # ───────────────────────────────────────────────────────────────────────────
  if [ "$QUICK" -eq 1 ]; then
    section "Calidad"
    info "--quick: se omiten dependencias, lint, formato, build, tests y health"
  else
    section "Dependencias"
    if [ -d node_modules ]; then
      ok "node_modules presente"
    elif [ "$INSTALL" -eq 1 ]; then
      run_step quality.deps "pnpm install --frozen-lockfile" pnpm install --frozen-lockfile
    else
      issue quality.deps "Faltan dependencias: ejecuta ./harness/init.sh --install (pnpm install --frozen-lockfile)"
    fi

    if [ -d node_modules ]; then
      section "Calidad"
      run_step quality.lint "Lint" pnpm run -s lint:check
      run_step quality.format "Formato" pnpm run -s format:check
      run_step quality.build "Build" pnpm run -s build
      run_step quality.test "Tests unitarios" pnpm run -s test -- --ci
      [ "$E2E" -eq 1 ] && run_step quality.e2e "Tests e2e" pnpm run -s test:e2e -- --ci

      # ─────────────────────────────────────────────────────────────────────
      if [ "$HEALTH" -eq 1 ]; then
        section "Health"
        port="${PORT:-}"
        if [ -z "$port" ]; then
          for envf in .env.local .env; do
            [ -f "$envf" ] && port="$(grep -m1 '^PORT=' "$envf" | cut -d= -f2 | tr -d '[:space:]"'"'")"
            [ -n "$port" ] && break
          done
        fi
        url="${HEALTH_URL:-http://localhost:${port:-3000}/health}"
        body="$LOG_DIR/health.json"

        probe() { curl -s -m 5 -o "$body" -w '%{http_code}' "$url" 2>/dev/null; }
        code="$(probe)"

        if [ "$code" = "000" ]; then
          if [ -f dist/main.js ]; then
            info "La app no está corriendo; se arranca temporalmente desde dist/main.js"
            node dist/main.js >"$LOG_DIR/app.log" 2>&1 &
            APP_PID=$!
            waited=0; limit="${HEALTH_TIMEOUT_S:-30}"
            while [ "$waited" -lt "$limit" ]; do
              kill -0 "$APP_PID" 2>/dev/null || break
              code="$(probe)"; [ "$code" != "000" ] && break
              sleep 1; waited=$((waited + 1))
            done
          fi
        fi

        if [ "$code" = "000" ]; then
          issue health.unreachable "No se pudo consultar $url (la app no responde o no arrancó)"
          [ -f "$LOG_DIR/app.log" ] && tail -n 25 "$LOG_DIR/app.log" | sed 's/^/      │ /'
        else
          report="$(node -e '
            let b; try { b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); }
            catch { console.log("INVALID"); process.exit(0); }
            const d = b.details || { ...(b.info || {}), ...(b.error || {}) };
            for (const [k, v] of Object.entries(d)) {
              console.log([k, (v && v.status) || "unknown", (v && v.message) || ""].join("\t"));
            }' "$body")"
          if [ "$report" = "INVALID" ]; then
            issue health.invalid "/health respondió $code con un cuerpo que no es JSON"
          else
            db_down=0
            while IFS="$(printf '\t')" read -r key status msg; do
              [ -z "$key" ] && continue
              case "$key" in
                db_*)
                  name="$(echo "${key#db_}" | tr '[:lower:]' '[:upper:]')"
                  if [ "$status" = "up" ]; then ok "Base de datos $name: arriba"
                  else issue health.db "Base de datos $name CAÍDA${msg:+: $msg}"; db_down=1; fi ;;
                cache)
                  case "$status" in
                    up) ok "Caché (Redis): arriba" ;;
                    disabled) info "Caché deshabilitada (CACHE_ENABLED=false)" ;;
                    *) warn "Caché (Redis) caída${msg:+: $msg}; la API sigue funcionando en BYPASS" health.cache ;;
                  esac ;;
                *)
                  [ "$status" = "up" ] && ok "$key: arriba" || warn "$key: $status" health.other ;;
              esac
            done <<EOF
$report
EOF
            if [ "$code" != "200" ] && [ "$db_down" -eq 0 ]; then
              issue health.status "/health respondió HTTP $code"
            fi
          fi
        fi
      fi
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
EXIT=0
{ [ "$CRITS" -gt 0 ] || [ "$FAILS" -gt 0 ]; } && EXIT=1
MODE=$([ "$STRICT" -eq 1 ] && echo strict || echo default)

printf '\n%s──────────────────────────────────────────────%s\n' "$BOLD" "$RESET"
if [ -s "$ISSUES" ]; then
  # Resumen agrupado por categoría (sección de la revisión).
  printf '%sResumen por categoría:%s\n' "$BOLD" "$RESET"
  awk -F'\t' '$1!="ignored"{ if (!($3 in seen)) { seen[$3]=1; order[++n]=$3 } items[$3]=items[$3] "    - [" $1 "] " $4 ($2!="-" ? " (" $2 ")" : "") "\n" }
    END { for (i=1;i<=n;i++) printf "  %s\n%s", order[i], items[order[i]] }' "$ISSUES"
  [ "$IGNORED" -gt 0 ] && printf '  (%d chequeo(s) silenciado(s) en %s)\n' "$IGNORED" "$CONFIG"
  printf '\n'
fi
if [ "$CRITS" -gt 0 ]; then
  printf '%s%s✖ Fallo crítico (%d). Corrígelo antes de continuar.%s\n' "$BOLD" "$RED" "$CRITS" "$RESET"
  printf '%sAgente: detente, informa al usuario y espera instrucciones (AGENTS.md §0).%s\n' "$YELLOW" "$RESET"
elif [ "$FAILS" -gt 0 ]; then
  printf '%s%s✖ %d hallazgo(s) obligatorio(s) (modo %s), %d advertencia(s).%s\n' "$BOLD" "$RED" "$FAILS" "$MODE" "$WARNS" "$RESET"
  printf '%sAgente: no continúes. Informa estos fallos al usuario y espera instrucciones (AGENTS.md §0).%s\n' "$YELLOW" "$RESET"
elif [ "$WARNS" -gt 0 ]; then
  printf '%s%s✔ Proyecto operativo con %d advertencia(s).%s\n' "$BOLD" "$GREEN" "$WARNS" "$RESET"
  printf '%sAgente: informa las advertencias al usuario y continúa; no las corrijas si no son parte de tu tarea (AGENTS.md §0).%s\n' "$YELLOW" "$RESET"
else
  printf '%s%s✔ Proyecto en buen estado%s (0 advertencias).\n' "$BOLD" "$GREEN" "$RESET"
fi

if [ "$JSON" -eq 1 ]; then
  node -e '
    const [file, mode, exitCode, crit, fail, warn, ign] = process.argv.slice(1);
    const issues = require("fs").readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => {
      const [level, id, section, message] = l.split("\t");
      return { level, id: id === "-" ? null : id, section, message };
    });
    const summary = { critical: +crit, failures: +fail, warnings: +warn, ignored: +ign };
    process.stdout.write(JSON.stringify({ version: 1, mode, exitCode: +exitCode, summary, issues }, null, 2) + "\n");
  ' "$ISSUES" "$MODE" "$EXIT" "$CRITS" "$FAILS" "$WARNS" "$IGNORED" >&3
fi
exit "$EXIT"
