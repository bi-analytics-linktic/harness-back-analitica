# ADR del harness

Decisiones de diseño **del paquete `@linktic/arness-back`**. No se instalan en los repos que lo usan: cada uno registra las suyas en su propio `harness/decisiones/`.

| # | Decisión | Estado | Fecha |
|---|---|---|---|
| [0001](0001-registro-de-decisiones.md) | Registrar las decisiones fuera de la base del harness | Aceptada | 2026-09-25 |
| [0002](0002-harness-en-carpeta-propia.md) | El harness vive en su propia carpeta `harness/` | Aceptada | 2026-09-25 |
| [0003](0003-distribucion-como-paquete.md) | Distribuir el harness como paquete npm con CLI | Aceptada (canal de publicación modificado por 0004) | 2026-09-25 |
| [0004](0004-instalacion-desde-git.md) | Instalar el paquete desde git, sin registro npm | Aceptada | 2026-09-25 |
| [0005](0005-compatibilidad-con-proyectos-instalados.md) | Compatibilidad con proyectos instalados: init.sh por advertencias y actualización reversible | Aceptada | 2026-10-20 |
| [0006](0006-cors-con-allowlist-por-entorno.md) | CORS con allowlist por entorno | Aceptada | 2026-10-20 |
| [0007](0007-fronteras-de-arquitectura-verificadas.md) | Fronteras de arquitectura verificadas por ESLint e init.sh | Aceptada | 2026-10-20 |
| [0008](0008-monitor-ssr-con-react.md) | Tablero monitor con React SSR protegido por ACCESS_TOKEN | Aceptada | 2026-10-20 |
| [0009](0009-configuracion-centralizada.md) | Configuración centralizada: process.env solo en src/config/configuration.ts | Aceptada | 2026-10-23 |
