# Playbook: revisar un cambio

Revisa el diff contra `AGENTS.md` y reporta cada hallazgo con archivo y línea, del más grave al menos grave.

## Bloqueantes

- [ ] SQL fuera de `*.sql.ts`, o valores concatenados o interpolados en SQL
- [ ] `ORDER BY` o nombres de columna que no salen de una allowlist
- [ ] Cualquier escritura, DDL o migración
- [ ] Un endpoint nuevo sin guard JWT, o un `@Public()` fuera de `login`, `refresh` o `health`
- [ ] Tokens, contraseñas o secretos en logs, respuestas, código o commits
- [ ] Cambios en `.env`, o `.env.local` incluido en el commit
- [ ] Una dependencia nueva sin aprobación
- [ ] La API falla si Redis está caído o deshabilitado
- [ ] Se editó la base del harness (`AGENTS.md`, puentes o playbooks) en lugar de registrar la decisión en `harness/decisiones/`
- [ ] El cambio contradice una decisión `Aceptada` de `harness/decisiones/`, o toma una decisión nueva sin registrarla
- [ ] `./harness/init.sh` termina en 1 (crítico, `--strict` o `required`), o el cambio agrega advertencias nuevas respecto a la línea base
- [ ] Se silenció un chequeo en `harness/arness.config.json` sin aprobación humana o sin motivo

## Contrato y arquitectura

- [ ] Estructura del endpoint según §5, y regla de agrupación (más de 2 archivos del mismo tipo)
- [ ] El service depende de la interfaz del repository, no de `pg`
- [ ] Envelope `{ data, meta? }` y errores `{ error: {...} }` con el status correcto
- [ ] Si cambió `.columns.ts` o los filtros, `FRONT.md` está actualizado y la versión de la clave de caché subió

## Completitud

- [ ] Un spec por archivo, incluidos los casos HIT/MISS/BYPASS
- [ ] Postman, `FRONT.md` y el README del módulo actualizados
- [ ] Variables nuevas en `.env.example`, `.env.local` y `src/config/`
- [ ] `./harness/init.sh` termina en 0 sin advertencias nuevas; las preexistentes se reportan, no se corrigen fuera de alcance
- [ ] Código en inglés, docs en español, commit con formato Conventional Commits
