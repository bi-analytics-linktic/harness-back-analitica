# 0010. Logs: JSON en producción y formato legible en desarrollo

- **Estado:** Aceptada
- **Fecha:** 2026-10-23
- **Decidido por:** Equipo backend de Analítica (opción A de HRN-20, aprobada)
- **Alcance:** plantilla `templates/logging/` de `nest-base`, `configuration.ts`, `init.sh`, AGENTS.md §2 y §10, `contrato-http.md`, `configuracion.md`
- **Relación con la base:** Extiende AGENTS.md §10 y agrega `pino-pretty` (dev) a las dependencias aprobadas de §2
- **Reemplaza a:** —

## Contexto

El harness definía un solo formato: JSON con `nestjs-pino`. Es lo correcto en producción (agregadores, búsqueda por `requestId`), pero en la terminal de desarrollo una línea JSON por evento es difícil de seguir. No había una variable para elegir el formato, así que cada proyecto lo resolvería a su manera (HRN-20).

## Decisión

- **Variable `LOG_FORMAT=json|pretty`**, default `json`: sin definirla, el comportamiento es el actual.
- **`pretty` con `pino-pretty` como transporte**, solo cuando se pide. `pino-pretty` es **devDependency**: la imagen de producción no lo incluye y, si falta, el logger vuelve a JSON en lugar de fallar.
- **Validación:** `parseLogFormat` rechaza valores distintos de `json`/`pretty` y `pretty` con `NODE_ENV=production`. `NODE_ENV` entra a la configuración (ADR 0009).
- **Mismos campos y misma redacción en ambos formatos.** La plantilla `logger-options.ts` centraliza `REDACT_PATHS` (authorization, cookies, password, tokens y secretos), el mensaje por request (`GET /ruta 200 42ms`) y `requestId` como campo de primer nivel. Un `X-Request-Id` entrante solo se reutiliza si es seguro (`[A-Za-z0-9._-]`, máximo 128); si no, se genera un UUID.
- **Sin SQL en los logs** en ningún formato.
- **`init.sh`, sección Logging:** `logging.format-env` (falta `LOG_FORMAT` en `.env.example`) y `logging.pretty-production` (`pino-pretty` en `dependencies`, o `NODE_ENV=production` con `LOG_FORMAT=pretty` en `.env.example`), como advertencias (ADR 0005).

## Consecuencias

- Desarrollo local más legible sin tocar lo que ven los agregadores en producción.
- Una dependencia más en desarrollo; `review.md` bloquea que pase a `dependencies`.
- El mensaje del log por request cambia de "request completed" a `MÉTODO ruta status duración` también en JSON; los campos estructurados no cambian.

## Alternativas descartadas

- **Formateador propio sin dependencias (opción B):** más código a mantener y menos funciones (colores, errores multilínea) que el estándar de pino.
- **Elegir el formato según `NODE_ENV`, sin variable:** QA y CI suelen correr con `NODE_ENV=development` y necesitan JSON.
- **Loguear SQL y parámetros a nivel `debug` en desarrollo:** riesgo de filtrar datos de negocio; queda fuera.
