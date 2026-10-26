# Playbook: actualizar Node a la última LTS

Referencia: `AGENTS.md` §2 (Node.js en su última LTS) y §13.4. Se usa cuando `./harness/init.sh` reporta `toolchain.node-lts` o cuando el humano pide actualizar Node.

**Actualizar Node es decisión humana.** El agente analiza, presenta y espera aprobación explícita. No cambia ningún archivo antes de esa aprobación, no instala Node por su cuenta y no convierte la advertencia en tarea si el humano no lo pide.

## 1. Analizar (solo lectura)

1. **Versiones:** la de `.nvmrc`, la de `node -v` y la última LTS:
   ```bash
   curl -s https://nodejs.org/dist/index.json \
     | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).find(x=>x.lts);console.log(r.version, r.lts)})'
   ```
2. **Soporte:** fin de soporte de la versión actual y de la nueva en `https://raw.githubusercontent.com/nodejs/Release/main/schedule.json` (campos `maintenance` y `end`).
3. **Dónde está fijada la versión:** `.nvmrc`, `engines.node` de `package.json`, `FROM node:<major>-alpine` del `Dockerfile`, `azure-pipelines.yml` (`versionSpec` o lectura de `.nvmrc`) y `@types/node` en `devDependencies`. Lista cada archivo con su valor actual y el nuevo.
4. **Compatibilidad:** `engines` de las dependencias directas en la versión instalada (`pnpm view <paquete>@<versión> engines`), empezando por `@nestjs/core`, `pg`, `ioredis` y `@types/node`. Marca cualquiera que no admita la nueva versión.
5. **Cambios incompatibles de Node:** revisa las notas del release del nuevo major (`https://nodejs.org/en/blog`) y busca en `src/` y `test/` las APIs que se eliminan o cambian.
6. **Entorno:** si `node -v` no es del nuevo major, el humano debe instalarlo (por ejemplo `nvm install --lts` o `fnm install --lts`) antes de verificar.

## 2. Presentar al humano y pedir aprobación

```
Actualización de Node: v<actual> → v<nueva LTS> (<codename>)
Soporte:        v<actual> en mantenimiento hasta <fecha>, fin <fecha> · v<nueva> soportada hasta <fecha>
Archivos:       .nvmrc, package.json (engines), Dockerfile, azure-pipelines.yml
Dependencias:   @types/node <actual> → <nueva> (requiere aprobación, AGENTS.md §13.4)
Compatibilidad: <dependencias que admiten la nueva versión / las que no>
Riesgos:        <APIs de Node afectadas en el código, o "ninguno detectado">
Recomendación:  <actualizar ahora / esperar, y por qué>
¿Apruebas la actualización? (sí / no)
```

No continúes sin un **sí** explícito. La aprobación cubre solo lo listado: si aparece otra dependencia que cambiar, vuelve a preguntar.

## 3. Si el humano aprueba

1. Actualiza `.nvmrc` (versión completa, ej. `v26.11.0`), `engines.node` (`>=<major>`), la imagen del `Dockerfile` y `azure-pipelines.yml` si fija la versión.
2. Actualiza `@types/node` al nuevo major con `pnpm add -D @types/node@<major>` y conserva el lockfile en el mismo cambio.
3. Verifica con el nuevo Node: `pnpm install --frozen-lockfile`, `./harness/init.sh` (sin `toolchain.node` ni `toolchain.node-lts`), `pnpm test:e2e` y, si hay Docker, `docker build .`.
4. Actualiza la versión de Node en `docs/TECNICO.md`.
5. Commit: `chore(node): upgrade to Node <major> LTS`.

## 4. Si el humano no aprueba

1. Registra en `docs/PENDIENTES.md` una entrada de tipo recomendación con la fecha, la versión propuesta, el motivo que dio el humano y la fecha de fin de soporte de la versión actual.
2. No silencies `toolchain.node-lts` en `harness/arness.config.json`: la advertencia sigue visible para recordarlo. Silenciarla es decisión humana y lleva motivo.
