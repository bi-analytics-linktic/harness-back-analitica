#!/usr/bin/env bash
# init.sh — Verifica que el proyecto esté en buen estado antes de cualquier cambio (AGENTS.md §0).
#
# Uso: ./init.sh [opciones]
#   --quick       Solo harness, estructura y toolchain (sin lint, build, tests ni health)
#   --e2e         Además ejecuta pnpm test:e2e
#   --no-health   No consulta /health
#   --install     Si faltan node_modules, ejecuta pnpm install --frozen-lockfile
#   -h, --help    Muestra esta ayuda
#
# Variables opcionales:
#   HEALTH_URL          URL del health (default http://localhost:$PORT/health)
#   HEALTH_TIMEOUT_S    Segundos de espera al arrancar la app (default 30)
#
# Salida: 0 = en buen estado · 1 = hay fallos (NO continuar) · 2 = uso incorrecto

set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 2

QUICK=0; E2E=0; HEALTH=1; INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --e2e) E2E=1 ;;
    --no-health) HEALTH=0 ;;
    --install) INSTALL=1 ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg (usa --help)"; exit 2 ;;
  esac
done

if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; RESET=''
fi

FAILS=0; WARNS=0
FAIL_LIST=''
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/init-sh.XXXXXX")"
APP_PID=''

cleanup() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null
  fi
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT INT TERM

section() { printf '\n%s%s▸ %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"; }
ok()      { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()    { printf '  %s⚠%s %s\n' "$YELLOW" "$RESET" "$1"; WARNS=$((WARNS + 1)); }
info()    { printf '  %sℹ%s %s\n' "$BLUE" "$RESET" "$1"; }
fail()    {
  printf '  %s✖%s %s\n' "$RED" "$RESET" "$1"
  FAILS=$((FAILS + 1))
  FAIL_LIST="${FAIL_LIST}  - $1"$'\n'
}

need_file() { if [ -f "$1" ]; then ok "$1"; else fail "Falta el archivo $1"; fi; }
need_dir()  { if [ -d "$1" ]; then ok "$1/"; else fail "Falta el directorio $1/"; fi; }

# Ejecuta un comando, guarda su salida y muestra el final solo si falla.
run_step() {
  local label="$1"; shift
  local log="$LOG_DIR/$(echo "$label" | tr -c 'a-zA-Z0-9' '_').log"
  if "$@" >"$log" 2>&1; then
    ok "$label"
  else
    fail "$label ($*)"
    tail -n 25 "$log" | sed 's/^/      │ /'
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
section "Harness"

for f in AGENTS.md CLAUDE.md GEMINI.md .cursor/rules/agents.mdc \
         decisiones/README.md decisiones/_plantilla.md \
         .agents/skills/nest-base/SKILL.md \
         docs/agents/reference/configuracion.md docs/agents/reference/contrato-http.md \
         docs/agents/reference/progress-plantilla.md; do
  need_file "$f"
done

if [ -f AGENTS.md ]; then
  missing_sections=''
  for n in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17; do
    grep -q "^## $n\. " AGENTS.md || missing_sections="$missing_sections §$n"
  done
  if [ -z "$missing_sections" ]; then ok "AGENTS.md tiene las secciones §0–§17"
  else fail "AGENTS.md incompleto; faltan:$missing_sections"; fi

  # Todo archivo del harness referenciado en AGENTS.md debe existir.
  for ref in $(grep -oE '(docs/agents/(playbooks|reference)|\.agents/skills)/[A-Za-z0-9_./-]+\.md|decisiones/README\.md' AGENTS.md | sort -u); do
    [ -f "$ref" ] || fail "AGENTS.md referencia $ref, pero no existe"
  done
fi

grep -q '^@AGENTS.md' CLAUDE.md 2>/dev/null && ok "CLAUDE.md importa AGENTS.md" || fail "CLAUDE.md no importa @AGENTS.md"
grep -q '^@\./AGENTS.md' GEMINI.md 2>/dev/null && ok "GEMINI.md importa AGENTS.md" || fail "GEMINI.md no importa @./AGENTS.md"
grep -q 'AGENTS.md' .cursor/rules/agents.mdc 2>/dev/null && ok "Regla de Cursor apunta a AGENTS.md" || fail "La regla de Cursor no apunta a AGENTS.md"
if [ -L .claude/skills ] && [ -f .claude/skills/nest-base/SKILL.md ]; then ok ".claude/skills enlaza a .agents/skills"
else fail ".claude/skills no es un enlace válido a ../.agents/skills"; fi
if [ -L .claude/agents ] && [ -f .claude/agents/lider.md ]; then ok ".claude/agents enlaza a .agents/agents"
else fail ".claude/agents no es un enlace válido a ../.agents/agents"; fi

agents_before=$FAILS
for ag in lider implementador revisor; do
  f=".agents/agents/$ag.md"
  if [ ! -f "$f" ]; then fail "Falta el agente $f"; continue; fi
  for key in name description tools model; do
    awk 'NR==1 && $0!="---"{exit 1} NR>1 && $0=="---"{exit} NR>1{print}' "$f" | grep -q "^$key:" \
      || fail "$f: falta '$key' en el frontmatter"
  done
done
[ "$FAILS" -eq "$agents_before" ] && ok "Agentes lider, implementador y revisor definidos"

# ─────────────────────────────────────────────────────────────────────────────
section "Decisiones"

decision_count=0
for d in decisiones/[0-9][0-9][0-9][0-9]-*.md; do
  [ -f "$d" ] || continue
  decision_count=$((decision_count + 1))
  name="$(basename "$d")"
  estado="$(grep -m1 '^- \*\*Estado:\*\*' "$d" | sed 's/^- \*\*Estado:\*\* *//')"
  if ! echo "$estado" | grep -Eq '^(Propuesta|Aceptada|Reemplazada por [0-9]{4}|Obsoleta)$'; then
    fail "$name: estado inválido o ausente ('$estado')"
  elif [ "$estado" = "Propuesta" ]; then
    warn "$name está en Propuesta: pendiente de aceptación humana"
  fi
  grep -q "($name)" decisiones/README.md 2>/dev/null || fail "$name no está en el índice de decisiones/README.md"
done
dupes="$(ls decisiones 2>/dev/null | grep -E '^[0-9]{4}-' | cut -c1-4 | sort | uniq -d | tr '\n' ' ')"
[ -n "$dupes" ] && fail "Números de decisión duplicados: $dupes"
ok "$decision_count decisión(es) revisada(s)"

# ─────────────────────────────────────────────────────────────────────────────
section "Progress"

if [ -f progress.md ]; then
  p_estado="$(grep -m1 '^- \*\*Estado:\*\*' progress.md | sed 's/^- \*\*Estado:\*\* *//')"
  case "$p_estado" in
    TERMINADO) ok "progress.md: TERMINADO (el líder lo reinicia en la próxima tarea)" ;;
    "EN CURSO") warn "progress.md: hay trabajo EN CURSO; confirma con el humano si se retoma" ;;
    BLOQUEADO) warn "progress.md: BLOQUEADO; revisa 'Bloqueos y preguntas abiertas' antes de continuar" ;;
    *) fail "progress.md: estado inválido o ausente ('$p_estado'); usa EN CURSO | BLOQUEADO | TERMINADO" ;;
  esac
  p_lines="$(wc -l < progress.md | tr -d ' ')"
  [ "$p_lines" -gt 200 ] && warn "progress.md tiene $p_lines líneas; el líder debe resumir las tareas cerradas"
else
  info "Sin progress.md: el líder lo crea desde la plantilla al iniciar una tarea"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "Git y secretos"

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  top="$(cd "$(git rev-parse --show-toplevel)" && pwd -P)"
  if [ "$top" != "$(pwd -P)" ]; then
    warn "El repo git raíz es $top, no este proyecto (ejecuta git init aquí)"
  else
    ok "Repositorio git propio"
    for secret in .env .env.local; do
      if git ls-files --error-unmatch "$secret" >/dev/null 2>&1; then
        fail "$secret está versionado en git"
      fi
    done
    git ls-files --error-unmatch progress.md >/dev/null 2>&1 \
      && warn "progress.md está versionado; es estado de trabajo y debería estar en .gitignore"
  fi
else
  warn "No es un repositorio git"
fi

# ─────────────────────────────────────────────────────────────────────────────
if [ ! -f package.json ]; then
  section "Proyecto"
  info "Sin package.json: modo solo harness. Para crear la base ejecuta la skill nest-base."
else
  section "Toolchain"

  if command -v node >/dev/null 2>&1; then
    node_v="$(node -v)"
    if [ -f .nvmrc ]; then
      want="$(tr -d '[:space:]v' < .nvmrc)"; have="${node_v#v}"
      if [ "${want%%.*}" = "${have%%.*}" ]; then ok "Node $node_v (esperado v$want por .nvmrc)"
      else fail "Node $node_v no coincide con .nvmrc (v$want)"; fi
    else
      fail "Falta .nvmrc con la versión LTS de Node"
    fi
  else
    fail "Node no está instalado"
  fi

  if command -v pnpm >/dev/null 2>&1; then ok "pnpm $(pnpm -v)"
  else fail "pnpm no está instalado"; fi

  pm="$(node -p "require('./package.json').packageManager || ''" 2>/dev/null)"
  case "$pm" in pnpm@*) ok "packageManager: $pm" ;; *) fail "package.json debe declarar packageManager pnpm@<versión>" ;; esac

  [ -f pnpm-lock.yaml ] && ok "pnpm-lock.yaml" || fail "Falta pnpm-lock.yaml"
  for lock in package-lock.json yarn.lock; do
    [ -f "$lock" ] && fail "$lock no está permitido: solo pnpm"
  done

  for s in lint:check format:check build test test:e2e; do
    node -e "process.exit(require('./package.json').scripts?.['$s'] ? 0 : 1)" 2>/dev/null \
      || fail "package.json no define el script '$s'"
  done

  # ───────────────────────────────────────────────────────────────────────────
  section "Estructura"

  for f in src/main.ts src/app.module.ts eslint.config.mjs .prettierrc .env.example \
           FRONT.md Dockerfile azure-pipelines.yml postman/arness-back.postman_collection.json; do
    need_file "$f"
  done
  for d in src/config src/common/auth src/common/database src/common/cache src/common/http \
           src/common/logging src/common/health src/modules test; do
    need_dir "$d"
  done

  if [ -d src/modules ]; then
    for mod in $(find src/modules -mindepth 2 -maxdepth 2 -type d | sort); do
      m="$(basename "$mod")"
      [ -f "$mod/README.md" ] || fail "$mod: falta README.md"
      [ -f "$mod/$m.module.ts" ] || fail "$mod: falta $m.module.ts"
    done
  fi

  if [ -f .gitignore ]; then
    for p in .env .env.local progress.md; do
      grep -qxF "$p" .gitignore || fail ".gitignore no excluye $p"
    done
  else
    fail "Falta .gitignore"
  fi

  if [ -f .env.example ]; then
    for k in PORT DATABASES ACCESS_TOKEN JWT_ACCESS_SECRET JWT_ACCESS_EXPIRES_IN \
             JWT_REFRESH_SECRET JWT_REFRESH_EXPIRES_IN CACHE_ENABLED REDIS_URL; do
      grep -q "^$k=" .env.example || fail ".env.example no define $k"
    done
    dbs="$(grep -m1 '^DATABASES=' .env.example | cut -d= -f2 | tr ',' ' ')"
    for db in $dbs; do
      for part in HOST PORT NAME USER PASSWORD; do
        grep -q "^DB_${db}_${part}=" .env.example || fail ".env.example no define DB_${db}_${part}"
      done
    done
  fi

  # ───────────────────────────────────────────────────────────────────────────
  section "Reglas de SQL"

  if [ -d src ]; then
    sql_out="$(grep -rlE --include='*.ts' "(^|[\`'\"])[[:space:]]*(SELECT|WITH)[[:space:]]" src 2>/dev/null \
      | grep -vE '\.sql(\.spec)?\.ts$')"
    if [ -n "$sql_out" ]; then fail "Texto SQL fuera de *.sql.ts: $(echo $sql_out)"
    else ok "SQL solo en *.sql.ts"; fi

    sql_write="$(grep -rliE --include='*.sql.ts' '(INSERT[[:space:]]+INTO|DELETE[[:space:]]+FROM|UPDATE[[:space:]]+[^[:space:]]+[[:space:]]+SET|TRUNCATE|(DROP|ALTER|CREATE)[[:space:]]+(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|MATERIALIZED))' src 2>/dev/null)"
    if [ -n "$sql_write" ]; then fail "Escritura o DDL en SQL (la BD es de solo lectura): $(echo $sql_write)"
    else ok "Sin escrituras ni DDL"; fi
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
      run_step "pnpm install --frozen-lockfile" pnpm install --frozen-lockfile
    else
      fail "Faltan dependencias: ejecuta ./init.sh --install (pnpm install --frozen-lockfile)"
    fi

    if [ -d node_modules ]; then
      section "Calidad"
      run_step "Lint" pnpm run -s lint:check
      run_step "Formato" pnpm run -s format:check
      run_step "Build" pnpm run -s build
      run_step "Tests unitarios" pnpm run -s test -- --ci
      [ "$E2E" -eq 1 ] && run_step "Tests e2e" pnpm run -s test:e2e -- --ci

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
          fail "No se pudo consultar $url (la app no responde o no arrancó)"
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
            fail "/health respondió $code con un cuerpo que no es JSON"
          else
            db_down=0
            while IFS="$(printf '\t')" read -r key status msg; do
              [ -z "$key" ] && continue
              case "$key" in
                db_*)
                  name="$(echo "${key#db_}" | tr '[:lower:]' '[:upper:]')"
                  if [ "$status" = "up" ]; then ok "Base de datos $name: arriba"
                  else fail "Base de datos $name CAÍDA${msg:+: $msg}"; db_down=1; fi ;;
                cache)
                  case "$status" in
                    up) ok "Caché (Redis): arriba" ;;
                    disabled) info "Caché deshabilitada (CACHE_ENABLED=false)" ;;
                    *) warn "Caché (Redis) caída${msg:+: $msg}; la API sigue funcionando en BYPASS" ;;
                  esac ;;
                *)
                  [ "$status" = "up" ] && ok "$key: arriba" || warn "$key: $status" ;;
              esac
            done <<EOF
$report
EOF
            if [ "$code" != "200" ] && [ "$db_down" -eq 0 ]; then
              fail "/health respondió HTTP $code"
            fi
          fi
        fi
      fi
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
printf '\n%s──────────────────────────────────────────────%s\n' "$BOLD" "$RESET"
if [ "$FAILS" -gt 0 ]; then
  printf '%s%s✖ Proyecto NO está en buen estado: %d fallo(s), %d advertencia(s).%s\n' "$BOLD" "$RED" "$FAILS" "$WARNS" "$RESET"
  printf '%s' "$FAIL_LIST"
  printf '\n%sAgente: no continúes. Informa estos fallos al usuario y espera instrucciones (AGENTS.md §0).%s\n' "$YELLOW" "$RESET"
  exit 1
fi
printf '%s%s✔ Proyecto en buen estado%s (%d advertencia(s)).\n' "$BOLD" "$GREEN" "$RESET" "$WARNS"
exit 0
