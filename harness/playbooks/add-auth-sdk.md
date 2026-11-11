# Playbook: autenticación con el SDK del IAM (`@bi/iam-sdk`)

Referencia: `AGENTS.md` §8, §9 y §13, y ADR 0019 del paquete. La documentación del SDK viaja **dentro del paquete instalado** y es la fuente de verdad de su uso: `node_modules/@bi/iam-sdk/AGENTS.md` (reglas para agentes), `docs/GUIDE.md` (guía completa) y `CHANGELOG.md`. Léela antes de escribir código; este playbook solo fija cómo encaja en el harness.

## Reglas

- **Única forma de autenticación: el SDK.** Toda autenticación por access token (`ACCESS_TOKEN`, JWT propio, `Bearer`) está **deprecada**: no se implementa ni se mantiene. Tampoco se crea ninguna otra forma de autenticación.
- **Roles y permisos vienen del SDK.** Se autoriza por **permiso** (`@RequirePermission('reports:read')`), no por rol. No existe `IAM_ALLOWED_ROLES` ni ninguna lista de roles en variables de entorno.
- **Ninguna ruta sin autenticación.** Todo controller de `src/modules/` lleva `@IamAuth()`. Solo quedan abiertas `GET /health` y las rutas del SDK en `/api/v1/auth/*`.
- **Los tokens nunca llegan al front:** viven en cookies `HttpOnly` que gestiona el SDK. Nada de `localStorage`, `Bearer` ni tokens en el JSON.
- **Credenciales solo en variables de entorno** (`IAM_URL`, `IAM_CLIENT_ID`, `IAM_CLIENT_SECRET`), nunca en el código, el repositorio, los logs ni el chat.

## 1. Instalar el SDK (requiere aprobación)

1. **Versión:** consulta las publicadas en `GET https://api-auth-monitoreo.igniva.co/api/external-apps/v1/sdk` y compárala con la instalada (si hay). Muéstrale al humano la versión actual, la última y su `CHANGELOG.md`. **Instala o actualiza solo con su aprobación explícita** (AGENTS.md §13.4).
2. **Instalación**, siempre con la versión exacta en la URL (el lockfile fija la URL y su hash; las versiones publicadas nunca se reemplazan):
   ```bash
   pnpm add https://api-auth-monitoreo.igniva.co/api/external-apps/v1/sdk/bi-iam-sdk-<X.Y.Z>.tgz
   ```
3. Lee `node_modules/@bi/iam-sdk/AGENTS.md` y `docs/GUIDE.md` de la versión instalada antes de seguir.

## 2. Retirar la autenticación anterior

Primero haz el **inventario** y muéstraselo al humano; borra solo después de su visto bueno.

- **Código:** `src/common/auth/` (`AuthController`, `AuthService`, `JwtAuthGuard` como `APP_GUARD`, `@Public()`), `src/common/security/login-attempts.ts`, `session-lifetime.ts` y `SecurityModule`, y `src/config/auth.ts` (`parseAuthConfig`) con sus specs. Se conserva `src/common/security/security-headers.ts`.
- **Monitor:** si existe `src/common/monitor/`, depende de `ACCESS_TOKEN`. Se retira junto con `MONITOR_*`, salvo que el humano decida otra cosa.
- **Variables:** `ACCESS_TOKEN`, `JWT_*`, `AUTH_*`, `MONITOR_*` e `IAM_ALLOWED_ROLES` en `.env.example`, `.env.local`, la validación de `src/config/` y `configuration.ts`. Avisa al humano para retirarlas de cada entorno (no toques `.env`).
- **Dependencias** (requieren aprobación para quitarlas): `@nestjs/jwt` y, si se retira el monitor, `react`, `react-dom` y sus `@types`.
- **Tests y documentación:** `test/auth.e2e-spec.ts`, la carpeta `Auth` de Postman con `accessToken` y `refreshToken`, y el flujo de `Bearer` y refresh en `FRONT.md`.

## 3. Implementar

1. **Configuración:** bloque `iam` en `AppConfig` (`src/config/configuration.ts`) con `IAM_URL` (`https://` salvo `localhost`), `IAM_CLIENT_ID` e `IAM_CLIENT_SECRET` (secreto: **sin valor por defecto**). Agrégalas a la validación, a `.env.example` (valores de ejemplo) y a `.env.local`.
2. **Módulo:** `IamModule.forRootAsync` en `app.module.ts` con `ConfigService<AppConfig, true>`:
   - `baseUrl`, `clientId` y `clientSecret` desde el bloque `iam`;
   - `routes.allowedOrigins` = `config.get('cors.origins', { infer: true })`: los mismos orígenes de CORS, sin otra variable;
   - `routes.onError`: registra un warning con el código del error, nunca el secreto ni el detalle crudo.
3. **`src/main.ts`, en este orden:** `app.use(securityHeaders())` → `app.enableCors(buildCorsOptions(...))` (con `credentials: true`) → `app.set('trust proxy', trustProxy)` solo si `HTTP_TRUST_PROXY` está definida → `app.use('/api/v1/auth', app.get(IAM_AUTH_ROUTES))`. `app.use` no recibe el prefijo global de Nest: por eso la ruta va completa.
4. **Controllers:** `@IamAuth()` a nivel de clase en **todo** controller de `src/modules/`, y `@RequirePermission('<permiso>')` por endpoint. **Los nombres de permiso los da el humano**; no los inventes. Si el endpoint necesita al usuario, usa `@IamSession() session: VerifiedSession`.
5. **Errores:** las respuestas `401`, `403` y `503 AUTH_UNAVAILABLE` del SDK usan `{ error: { code, message } }`, sin `requestId`, `path` ni `timestamp`. Es una excepción aceptada (ADR 0019): no las envuelvas ni las reescribas.
6. **Logs:** nunca registres la sesión, las cookies, contraseñas ni códigos 2FA (la redacción de `cookie`, `set-cookie` y `password` ya está en `logger-options.ts`).

## 4. Tests

- **Unit:** cada controller de `src/modules/` tiene la metadata de `@IamAuth()`; el `IamClient` se mockea por su clase con `overrideProvider`.
- **E2E (`test/`):** un endpoint de módulo sin sesión → `401`; con sesión y sin el permiso → `403`; con sesión y permiso → `200`; `/health` responde sin sesión; preflight de CORS con `Access-Control-Allow-Credentials: true` solo para orígenes de `CORS_ORIGINS`.

## 5. Documentación

- **`FRONT.md`**, sección de autenticación:
  - login con `POST /api/v1/auth/login` y `{ email, password }`; la respuesta puede ser `authenticated`, `mfa_required` o `first_login_required` (pasos en `/api/v1/auth/mfa/verify` y `/api/v1/auth/first-login/*`);
  - todas las llamadas con `fetch(url, { credentials: 'include' })`; el front **nunca** ve ni guarda un token;
  - `401` → volver al login; `403` → sin permiso; `423` / `429` → esperar `Retry-After`, sin reintentar en bucle; `503 AUTH_UNAVAILABLE` → mensaje genérico;
  - **advertencia, visible al inicio de la sección:**
    > ⚠️ Nunca subas al repositorio ni compartas credenciales, contraseñas, secretos (`IAM_CLIENT_SECRET`), tokens, cookies de sesión ni archivos `.env`. No implementes otras formas de autenticación: la única es la del IAM. Si encuentras un endpoint que responde sin iniciar sesión, **repórtalo de inmediato al equipo de backend**.
- **Postman:** carpeta `Auth` con `Login` (`POST {{baseUrl}}/api/v1/auth/login`); Postman conserva las cookies de sesión. Quita `Bearer {{accessToken}}` de la colección.
- **`docs/TECNICO.md`:** autenticación con el SDK, su versión y las variables `IAM_*` (sin valores). **`docs/EVOLUTIVO.md`:** la entrada de la entrega. **`docs/PENDIENTES.md`:** lo que quede abierto (por ejemplo, variables por retirar en cada entorno).

## 6. Alerta: endpoint sin autenticación

Si encuentras un endpoint de `src/modules/` sin `@IamAuth()`, o que responde sin sesión:
1. **No continúes ni lo des por terminado:** es un bloqueante.
2. Repórtalo de inmediato al humano, con el archivo, la ruta y desde cuándo está así, para que avise al equipo de backend.
3. Regístralo en `docs/PENDIENTES.md` como **bloqueo** hasta que se corrija.

## 7. Criterios de aceptación

- [ ] `@bi/iam-sdk` instalado en la versión aprobada, con la URL exacta en `package.json` y el lockfile actualizado.
- [ ] No queda código, variable ni dependencia de la autenticación por access token (`ACCESS_TOKEN`, `JWT_*`, `@nestjs/jwt`, `JwtAuthGuard`, `@Public()`).
- [ ] `IAM_ALLOWED_ROLES` eliminada de `.env.example`, `.env.local`, la validación y la configuración, y su retiro de cada entorno avisado al humano.
- [ ] Roles y permisos solo desde el SDK (`@RequirePermission`), con nombres confirmados por el humano.
- [ ] Todo controller de `src/modules/` con `@IamAuth()`; solo `/health` y `/api/v1/auth/*` abiertos.
- [ ] Rutas del SDK en `/api/v1/auth`, CORS con `credentials: true` solo para `CORS_ORIGINS` y `HTTP_TRUST_PROXY` configurada.
- [ ] Tests unit y e2e del §4 en verde.
- [ ] `FRONT.md` con el flujo y la advertencia; Postman, `docs/TECNICO.md` y `docs/EVOLUTIVO.md` actualizados.
- [ ] `./harness/init.sh` termina en 0 y sin advertencias nuevas.
