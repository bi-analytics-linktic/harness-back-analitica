<!-- Plantilla del harness → docs/TECNICO.md (AGENTS.md §12). Quita este comentario al copiarla. -->
# Documentación técnica

Backend de analítica de **<cliente o producto>**: reportes de solo lectura sobre PostgreSQL. Las reglas de trabajo están en `AGENTS.md`; el contrato con frontend, en `FRONT.md`.

## Arquitectura

- NestJS por capas hexagonales por endpoint: controller → service (Cache-Aside) → repository (`pg`) → `*.sql.ts`.
- Organización `src/modules/<cliente>/<modulo>/<endpoint>/`; lo transversal vive en `src/common/`.
- Autenticación JWT (access + refresh) en todos los endpoints salvo `login`, `refresh` y `health`.
- Caché Redis opcional: la API responde igual si Redis está caído o deshabilitado.

## Módulos

| Cliente | Módulo | Propósito | Conexión | README |
|---|---|---|---|---|
| | | | | |

## Conexiones de base de datos

Solo nombres lógicos y origen; **nunca** hosts, usuarios ni contraseñas.

| Nombre (`DATABASES`) | Propósito | Esquemas o vistas principales |
|---|---|---|
| MAIN | | |

## Configuración

Variables por tema en `src/config/configuration.ts` y referencia completa en `harness/reference/configuracion.md`. Variables propias de este proyecto:

| Variable | Para qué | Obligatoria |
|---|---|---|
| | | |

## Despliegue

- Imagen Docker (`Dockerfile`) y pipeline `azure-pipelines.yml`.
- Entornos: <desarrollo, QA, producción> y sus URLs base.
- `GET /health` reporta cada BD y la caché; `GET /monitor` solo donde `MONITOR_ENABLED=true`.

## Decisiones

Las decisiones del proyecto están en `harness/decisiones/` (índice en su `README.md`).
