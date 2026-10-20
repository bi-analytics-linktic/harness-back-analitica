# 0006. CORS con allowlist por entorno

- **Estado:** Aceptada
- **Fecha:** 2026-10-20
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** `src/main.ts` y `src/config/` de los proyectos, skill `nest-base`, `init.sh` y `review.md`
- **Relación con la base:** Extiende AGENTS.md §9 y §13; detalle en `harness/reference/contrato-http.md` (CORS) y `configuracion.md`
- **Reemplaza a:** —

## Contexto

La base no decía nada de CORS. Cada backend lo resolvía a su manera y lo más fácil es `app.enableCors()` sin opciones, que acepta cualquier origen. Los reportes exponen datos de analítica: cualquier página podría consumirlos desde el navegador de alguien que tenga un token.

## Decisión

- **Allowlist explícita por entorno** en `CORS_ORIGINS` (orígenes exactos separados por comas), **obligatoria** en proyectos nuevos: la validación de `src/config/` hace fallar el arranque si falta, si tiene `*` o comodines, si un valor no es un origen o si usa `http://` fuera de `localhost`.
- **Opciones fijas:** `origin` como función contra la allowlist; métodos `GET, POST, OPTIONS`; `allowedHeaders` `Authorization, Content-Type, X-Request-Id`; `exposedHeaders` `X-Cache, X-Request-Id`; `credentials: false`; `maxAge` desde `CORS_MAX_AGE_SECONDS` (default 600); preflight `204`.
- **Implementación de referencia** en `harness/skills/nest-base/templates/cors/` (funciones puras con su spec) y e2e en `templates/e2e/cors.e2e-spec.ts`: preflight permitido con cabeceras, preflight no permitido sin `Access-Control-Allow-Origin`.
- **`init.sh`:** advierte (`security.cors-env`, `security.cors`, `security.cors-open`) si `.env.example` no define `CORS_ORIGINS` o lo define con `*`, y si `src/main.ts` no configura CORS o lo abre. Con `--strict` (proyecto nuevo, CI del paquete) son fallos.
- **`review.md`:** CORS abierto o con comodín es bloqueante.

## Consecuencias

- Agregar un frontend nuevo exige agregar su origen en cada entorno: es intencional.
- Proyectos existentes: `init.sh` muestra advertencias y nada deja de funcionar. Adoptarlo es copiar `cors.ts`, llamar a `enableCors(buildCorsOptions(...))` y definir `CORS_ORIGINS` (ver CHANGELOG, "Para proyectos existentes").
- Las herramientas sin `Origin` (curl, Postman, servidor a servidor) no se ven afectadas: CORS es una restricción del navegador.

## Alternativas descartadas

- **`origin: true` o `*`:** cualquier sitio puede leer las respuestas.
- **Comodines de subdominio (`*.empresa.com`):** amplían la superficie y complican la validación; se listan los orígenes exactos.
- **`credentials: true`:** la API autentica con `Bearer`, no con cookies; habilitarlo solo agrega riesgo.
