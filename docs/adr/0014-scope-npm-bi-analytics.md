# 0014. Publicar bajo el scope `@bi-analytics`

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Decidido por:** Equipo backend de Analítica
- **Alcance:** Nombre del paquete en npm
- **Relación con la base:** Modifica el scope definido en 0013
- **Reemplaza a:** —

## Contexto

0013 publicaba el paquete como `@linktic/arness-back`. El scope `@linktic` en npm pertenece a una organización de la que la cuenta del equipo (`bi.analytics`) no es miembro, y publicar devuelve `404 Not Found - PUT`. La versión 0.2.0 nunca llegó a publicarse.

## Decisión

- El paquete se llama **`@bi-analytics/arness-back`** y se publica en el registro público de npm bajo la organización `bi-analytics`, administrada por el equipo de Analítica.
- El resto de 0013 (registro público, tags `vX.Y.Z`, `pnpm publish` y formas de instalación) se mantiene con el nombre nuevo.

## Consecuencias

- Publicar requiere ser miembro con permiso de escritura de la organización `bi-analytics` en npmjs.com.
- Los proyectos instalados desde git como `@linktic/arness-back` pasan al nombre nuevo al actualizar: quitan la devDependency anterior, ejecutan `pnpm add -D @bi-analytics/arness-back@X.Y.Z` y `pnpm arness sync`.
- `init.sh` y el CLI buscan el paquete por el nombre nuevo.

## Alternativas descartadas

- **Esperar acceso a la organización `@linktic`:** depende de un tercero y bloquea la publicación.
- **Scope de usuario `@bi.analytics`:** está atado a una cuenta personal y no a un equipo.
