# 0019. CORS con credenciales, proxy de confianza por red y rutas de auth en /api/v1/auth

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidido por:** Equipo backend de Analítica (solicitud humana)
- **Alcance:** plantillas `templates/cors/` y `templates/config/configuration.ts` (con sus specs y el e2e de CORS), AGENTS.md §9 y §13, `contrato-http.md`, `configuracion.md`, skill `nest-base`, `review.md`, `init.sh`, catálogo de novedades y playbook `add-auth-sdk.md`
- **Relación con la base:** Modifica AGENTS.md §9 y §13.8 (CORS) y el proxy de confianza de `contrato-http.md`
- **Reemplaza a:** 0006 (solo `credentials: false`) y 0017 (solo `HTTP_TRUST_PROXY_HOPS`)

## Contexto

La autenticación pasa al SDK del IAM de Linktic (`@bi/iam-sdk`, playbook `add-auth-sdk.md`). El SDK:
- guarda la sesión en cookies `HttpOnly` y el front llama con `credentials: 'include'`, pero la base prohibía `credentials` en CORS;
- exige la IP real del usuario para los límites de intentos del IAM y pide **nunca** usar `trust proxy = true` ni un número de saltos, mientras que la base usaba `HTTP_TRUST_PROXY_HOPS`;
- monta sus rutas con `app.use('/auth', ...)`, fuera del prefijo `/api/v1` de la API.

## Decisión

- **CORS:** `credentials: true`, permitido **solo** con `origin` como función contra la allowlist exacta de `CORS_ORIGINS`. Siguen prohibidos `*`, `origin: true` y reflejar el `Origin`. `CORS_ORIGINS` también es el `allowedOrigins` del SDK: una sola lista.
- **Proxy de confianza:** `HTTP_TRUST_PROXY` reemplaza a `HTTP_TRUST_PROXY_HOPS`. Acepta `loopback`, `linklocal`, `uniquelocal` o IPs y subredes, y la app no arranca con `true`, un número u otro valor. Vacía, se usa la IP del socket. `init.sh` (`security.trust-proxy`) advierte `trust proxy` con `true` o un número en `main.ts`, y `HTTP_TRUST_PROXY_HOPS` en `.env.example`.
- **Rutas de autenticación:** se montan en `/api/v1/auth` (`app.use('/api/v1/auth', app.get(IAM_AUTH_ROUTES))`), después de CORS y de `securityHeaders()`, para que toda la API viva bajo el mismo prefijo.

## Consecuencias

- El navegador envía cookies a la API desde los orígenes permitidos. Un origen fuera de la allowlist no recibe `Access-Control-Allow-Origin` ni `Access-Control-Allow-Credentials`.
- Los proyectos con `HTTP_TRUST_PROXY_HOPS` reciben la advertencia y deben pasar a `HTTP_TRUST_PROXY` (balanceador en red privada: `loopback, uniquelocal`).
- Las rutas `/api/v1/auth/*` responden con el formato de error del SDK (`{ error: { code, message } }`), sin `requestId`, `path` ni `timestamp`. Es una excepción acotada a esas rutas.

## Alternativas descartadas

- **Mantener `credentials: false` y enviar el token como `Bearer`:** el SDK no entrega tokens al front, a propósito, y guardarlos en el navegador los expone a XSS.
- **Seguir con un número de saltos:** si la app también es accesible sin pasar por el balanceador, cualquiera falsifica su IP con `X-Forwarded-For` y evade los límites del IAM.
- **Montar las rutas en `/auth`, como el ejemplo del SDK:** dejaría dos prefijos en la API.
