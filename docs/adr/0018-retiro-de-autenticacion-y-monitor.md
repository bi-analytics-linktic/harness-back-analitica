# 0018. Retirar de la base la autenticación, el límite de intentos y el monitor

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidido por:** Equipo backend de Analítica (solicitud humana)
- **Alcance:** AGENTS.md §1, §2, §4, §8, §10 a §13, §15 y §16; `contrato-http.md`, `configuracion.md`, skill `nest-base` y sus plantillas, `new-endpoint.md`, `review.md`, `init.sh`, catálogo de novedades y tests del paquete
- **Relación con la base:** Retira AGENTS.md §8 (queda como aviso) y el monitor de §10
- **Reemplaza a:** 0008 (completa) y 0017 (en lo relativo a login, intentos y sesión)

## Contexto

El equipo va a redefinir cómo se implementa la autenticación en los backends de analítica, con documentación nueva escrita a mano. Mantener en la base el modelo actual (contraseña compartida `ACCESS_TOKEN` + JWT access/refresh, límite de intentos y vida máxima de la sesión) haría que los agentes lo siguieran implementando mientras se define el nuevo.

El monitor (ADR 0008) depende de ese modelo: pide `ACCESS_TOKEN`, firma su cookie con `JWT_ACCESS_SECRET` y usa `LoginAttemptLimiter`. Sin la autenticación no tiene cómo protegerse.

## Decisión

- Se eliminan de la base: `src/common/auth/` (descrito en `nest-base`), `templates/config/auth.ts`, `templates/security/login-attempts.ts`, `session-lifetime.ts` y `security.module.ts`, `templates/monitor/`, `templates/e2e/monitor.e2e-spec.ts` y el playbook `new-monitor-widget.md`, con sus specs.
- Se retiran las variables `ACCESS_TOKEN`, `JWT_*`, `AUTH_*` y `MONITOR_*`, y las dependencias aprobadas `@nestjs/jwt`, `react` y `react-dom`.
- `init.sh` deja de verificar `src/common/auth`, `security.login-rate-limit`, `security.session-max-age`, `security.monitor-env` y `security.monitor-guard`. El catálogo pierde las novedades `monitor`, `login-rate-limit` y `session-max-age`.
- AGENTS.md §8 queda como aviso: la base no define autenticación y el agente no la implementa por su cuenta; si una tarea la requiere, pregunta al humano.
- **Se conservan** (no son autenticación): `securityHeaders()`, `HTTP_TRUST_PROXY_HOPS` y el chequeo `security.trust-proxy` (ahora parte de la novedad `security-headers`); el header `Authorization` permitido en CORS; y la redacción en logs de `authorization`, cookies y `password`.

## Consecuencias

- Mientras no exista la nueva autenticación, la base no exige proteger los endpoints. Un proyecto nuevo creado con `nest-base` nace sin autenticación.
- Los proyectos que ya tienen `src/common/auth/` o `src/common/monitor/` los conservan: `init.sh` ya no los verifica ni los elimina. Retirarlos es decisión de cada repo.
- La nueva autenticación entrará como un cambio de la base (referencia en `harness/reference/`, AGENTS.md §8 y §16) con su propio ADR.

## Alternativas descartadas

- **Dejar el monitor sin login:** quedaría público y expondría el inventario de endpoints.
- **Conservar la autenticación hasta tener la nueva:** los agentes seguirían generando el modelo que se va a reemplazar.
