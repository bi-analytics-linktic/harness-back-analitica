# 0008. Tablero monitor con React SSR protegido por ACCESS_TOKEN

- **Estado:** Aceptada
- **Fecha:** 2026-10-20
- **Decidido por:** Equipo backend de Analítica (aprobación humana de las dependencias `react` y `react-dom`)
- **Alcance:** `src/common/monitor/` de los proyectos, skill `nest-base`, AGENTS.md §2, §8, §10 y §13, `init.sh` y `review.md`
- **Relación con la base:** Agrega dependencias aprobadas a AGENTS.md §2 y una excepción acotada al guard JWT global (§8)
- **Reemplaza a:** —

## Contexto

El equipo necesita ver de un vistazo el estado técnico de cada backend (cuántos endpoints expone, y en adelante BDs, caché, versión) sin abrir Postman ni los logs. Debe ser seguro por defecto y no abrir una segunda superficie de ataque.

## Decisión

- **`GET /monitor` fuera de `/api/v1`**, apagado por defecto (`MONITOR_ENABLED=false` → `404`).
- **React solo como motor de plantillas en el servidor:** `react-dom/server` (`renderToStaticMarkup`) con `createElement`, sin JSX (no cambia `tsconfig`, Jest ni ESLint), sin hidratación, sin bundler y sin JavaScript en el cliente. Estilos inline.
- **Dependencias aprobadas:** `react` y `react-dom`, con `@types/react` y `@types/react-dom` en dev, **solo** para `src/common/monitor/`.
- **Sesión propia:** `GET/POST /monitor/login` compara la contraseña con `ACCESS_TOKEN` en tiempo constante y emite un JWT `type: "monitor"` en la cookie `arness_monitor` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/monitor`, `MONITOR_SESSION_EXPIRES_IN`, default 15 min). `POST /monitor/logout` la borra. Sin secretos nuevos.
- **No es `@Public()`:** el controller se marca con `@MonitorRoute()`, que `JwtAuthGuard` omite, y lo protege `MonitorSessionGuard`. La cookie solo sirve en `/monitor`; el resto de la API sigue aceptando únicamente `Bearer`.
- **Cabeceras:** CSP `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'` (más `frame-ancestors 'none'` y `base-uri 'none'`), `Cache-Control: no-store`, `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy: no-referrer`. El monitor trae las suyas sin esperar una política general de cabeceras.
- **Widgets extensibles:** `MonitorWidget` y el multi-provider `MONITOR_WIDGETS`; widget base `endpoints-total` con `DiscoveryService` y `MetadataScanner`. Un widget que falla o tarda más de 2 s se muestra como "No disponible" y no rompe la página. Nunca secretos, SQL, errores de PostgreSQL ni datos de negocio. Playbook: `harness/playbooks/new-monitor-widget.md`.
- **Implementación de referencia y tests** en `harness/skills/nest-base/templates/monitor/` y `templates/e2e/monitor.e2e-spec.ts`.
- **Pendiente:** el login del monitor compartirá el rate limiting de `/auth/login` cuando el harness lo incorpore.

## Consecuencias

- Dos dependencias de runtime nuevas (React) en cada proyecto, a cambio de HTML escapado por defecto y componentes legibles.
- `ACCESS_TOKEN` desbloquea también el monitor: quien tiene acceso a la API tiene acceso al tablero. Si un proyecto necesita separarlos, lo registra como decisión propia.
- `init.sh` advierte si existe `src/common/monitor/` sin `MONITOR_ENABLED`/`MONITOR_SESSION_EXPIRES_IN` en `.env.example` (`security.monitor-env`) o sin `MonitorSessionGuard`, o con `@Public()` (`security.monitor-guard`).

## Alternativas descartadas

- **Plantillas con strings:** sin escape automático; un widget podría inyectar HTML.
- **SPA con hidratación o bundler:** agrega build de frontend, JavaScript en el cliente y una CSP más débil.
- **Proteger el monitor con `Bearer`:** el navegador no lo envía al abrir una URL; exigiría JavaScript en el cliente.
- **`@Public()` con login propio:** rompe la regla de que `@Public()` solo existe en `login`, `refresh` y `health`.
