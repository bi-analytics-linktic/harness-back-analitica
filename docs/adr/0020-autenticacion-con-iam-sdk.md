# 0020. Autenticación con el SDK del IAM de Linktic (`@bi/iam-sdk`)

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidido por:** Equipo backend de Analítica (solicitud humana)
- **Alcance:** AGENTS.md §2, §8, §11, §12, §13, §15 y §16; playbooks `add-auth-sdk.md`, `new-endpoint.md` y `review.md`; `contrato-http.md`
- **Relación con la base:** Redefine AGENTS.md §8 (que 0018 dejó como aviso) y agrega la prohibición §13.7
- **Reemplaza a:** —

## Contexto

Tras retirar la autenticación por contraseña compartida y JWT (ADR 0018), el equipo define que los backends de analítica autentiquen a sus usuarios contra el IAM de Linktic mediante su SDK oficial, `@bi/iam-sdk`, servido por el propio IAM (no se publica en npm). El SDK trae su documentación para agentes dentro del paquete.

## Decisión

- **Única forma de autenticación: `@bi/iam-sdk`.** La autenticación por access token (`ACCESS_TOKEN`, JWT propio, `Bearer`) queda deprecada y no se crea ninguna otra.
- **Dependencia aprobada** (§2), instalada desde la URL del IAM con la versión exacta. Instalarla o actualizarla requiere aprobación humana (§13.4); la lista de versiones está en `GET https://api-auth-monitoreo.igniva.co/api/external-apps/v1/sdk`.
- **Protección obligatoria:** todo controller de `src/modules/` lleva `@IamAuth()`; solo `/health` y `/api/v1/auth/*` quedan abiertos. Un endpoint sin autenticación es bloqueante (`review.md`) y se reporta de inmediato al equipo de backend.
- **Autorización por permisos del SDK** (`@RequirePermission`), con nombres definidos por el humano. Se elimina `IAM_ALLOWED_ROLES`.
- **El harness no copia la documentación del SDK:** el playbook remite a `node_modules/@bi/iam-sdk/AGENTS.md` y `docs/GUIDE.md` de la versión instalada, que es la fuente de verdad.

## Consecuencias

- Los backends dependen del IAM para autenticar: si no responde, las rutas protegidas devuelven `503 AUTH_UNAVAILABLE`.
- `init.sh` todavía no verifica automáticamente los controllers sin `@IamAuth()`; hoy lo controlan el playbook, AGENTS.md §13.7 y `review.md`.
- Los proyectos existentes migran con `add-auth-sdk.md`: inventario, retiro de la autenticación anterior con aprobación e implementación.

## Alternativas descartadas

- **Mantener `ACCESS_TOKEN` + JWT propio:** una contraseña compartida por todos los usuarios, sin identidad ni permisos.
- **Copiar la guía del SDK al harness:** quedaría desactualizada en cada versión del SDK.
