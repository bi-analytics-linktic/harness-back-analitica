<!-- Plantilla del harness → docs/EVOLUTIVO.md (AGENTS.md §12). Quita este comentario al copiarla. -->
# Evolutivo

Trazabilidad de lo que se ha entregado en el proyecto, en orden cronológico. Cada entrega agrega una entrada al final; las anteriores no se reescriben ni se borran.

**Solo avance.** Aquí no van pendientes, bloqueos, stoppers ni riesgos: esos van en `docs/PENDIENTES.md`.

Formato de cada entrada (lenguaje entendible para negocio):

```markdown
## AAAA-MM-DD · <cliente>/<módulo>

- **Entregado:** <qué se puede hacer ahora, en una o dos frases>.
- **Detalle técnico:** <endpoint, conexión, widget o cambio de contrato>.
- **Referencia:** <commit, PR o tag>.
```

## AAAA-MM-DD · Base del proyecto

- **Entregado:** base del backend lista para agregar reportes: autenticación, salud del servicio y caché.
- **Detalle técnico:** proyecto NestJS creado con la skill `nest-base` del harness.
- **Referencia:** <commit inicial>.
