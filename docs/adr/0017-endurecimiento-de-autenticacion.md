# 0017. Endurecimiento de la autenticación: intentos, sesión y cabeceras

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** plantillas `templates/security/` y `templates/config/auth.ts`, `templates/monitor/monitor.controller.ts`, `contrato-http.md`, `configuracion.md`, AGENTS.md §8 y §9, skill `nest-base`, `review.md`, `init.sh` y catálogo de novedades
- **Relación con la base:** Extiende AGENTS.md §8 (autenticación) y §9 (contrato HTTP)
- **Reemplaza a:** —

## Contexto

Una revisión de seguridad del harness encontró que la API, protegida por una sola contraseña compartida (`ACCESS_TOKEN`):
- no limitaba los intentos de `/auth/login` (el propio contrato lo dejaba pendiente);
- permitía refrescar sin límite, así que un refresh token robado servía indefinidamente;
- arrancaba con secretos como `change-me`, porque solo se exigía que existieran (pospuesto, ver abajo);
- no enviaba cabeceras de seguridad fuera del monitor.

Cambiar el modelo de acceso (claves con nombre por consumidor) se dejó para una decisión posterior.

## Decisión

- **Sin dependencias nuevas:** código propio en `src/common/security/` en lugar de `@nestjs/throttler` y `helmet`.
- **Límite de intentos:** `LoginAttemptLimiter` en memoria, por IP y por instancia, compartido por `/auth/login` y `/monitor/login` (`SecurityModule` global). `AUTH_LOGIN_MAX_ATTEMPTS` fallos (5) en `AUTH_LOGIN_WINDOW_SECONDS` (900) → `429 TOO_MANY_ATTEMPTS` con `Retry-After`, sin comparar la contraseña. Tope de 10 000 IPs. `HTTP_TRUST_PROXY_HOPS` da la IP real detrás de un proxy; `trust proxy = true` queda prohibido.
- **Vida máxima de la sesión:** claim `auth_time` fijado en el login y copiado en cada refresh. Pasado `AUTH_SESSION_MAX_AGE_SECONDS` (12 h) → `401 SESSION_EXPIRED`. Sigue siendo stateless.
- **Configuración:** `src/config/auth.ts` (`parseAuthConfig`) agrupa el bloque `auth` con las variables nuevas. Los secretos siguen siendo solo obligatorios.
- **Validar la fuerza de los secretos queda pospuesto:** haría que los backends existentes no arrancaran hasta rotar sus secretos en cada entorno. Se retomará con un plan de rotación.
- **Cabeceras:** `securityHeaders()` en `main.ts` (CSP restrictiva, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS, `no-store`) y sin `X-Powered-By`. El monitor conserva su CSP.
- **Tipos de token:** se documenta y se exige en `auth.e2e-spec.ts` que la cookie del monitor y el refresh token no sirven como `Bearer`.
- **Adopción:** `init.sh` advierte `security.headers`, `security.trust-proxy`, `security.login-rate-limit`, y `security.session-max-age` (ADR 0005). `doctor` las presenta como novedades de seguridad.

## Consecuencias

- Adivinar la contraseña por fuerza bruta pasa de ilimitado a 5 intentos cada 15 min por IP y por instancia.
- Un refresh token robado sirve como mucho hasta que la sesión cumple 12 h.
- Ninguna novedad impide que un backend existente arranque: todas se adoptan a mano y sus valores tienen default.
- Los refresh tokens emitidos antes de adoptar la vida máxima no traen `auth_time` y exigen un login nuevo.
- Con varias réplicas, cada una cuenta los intentos aparte; con un proxy mal configurado, todos los usuarios comparten IP y se bloquean juntos. Por eso `HTTP_TRUST_PROXY_HOPS` se documenta con el valor de Azure App Service.

## Alternativas descartadas

- **`@nestjs/throttler` y `helmet`:** requieren aprobar dependencias, y throttler también cuenta por instancia sin un storage compartido.
- **Contador en Redis:** la API no puede depender de Redis (AGENTS.md §7).
- **Bloqueo global (no por IP):** cualquiera podría bloquear el login de todos.
- **Lista de refresh tokens revocados:** requiere estado compartido; la vida máxima acota el riesgo sin él.
