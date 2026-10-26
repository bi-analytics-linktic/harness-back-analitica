<!-- Plantilla del harness → docs/EVOLUTIVO.md (AGENTS.md §12). Quita este comentario al copiarla. -->
# Evolutivo

Trazabilidad de lo que se ha entregado en el proyecto, en orden cronológico. Cada entrega agrega una entrada al final; las anteriores no se reescriben ni se borran.

**Solo avance.** Aquí no van pendientes, bloqueos, stoppers ni riesgos: esos van en `docs/PENDIENTES.md`.

Formato de cada entrada (lenguaje entendible para negocio):

```markdown
## AAAA-MM-DD HH:mm -0500 · <cliente>/<módulo>

- **Responsable:** <nombre de quien hizo la entrega>.
- **Entregado:** <qué se puede hacer ahora, en una o dos frases>.
- **Detalle técnico:** <endpoint, conexión, widget o cambio de contrato>.
- **Referencia:** <commit, PR o tag>.
```

- **Fecha y hora:** hora de Bogotá, Colombia (UTC-5), del momento en que se registra la entrega: `TZ=America/Bogota date '+%Y-%m-%d %H:%M %z'`.
- **Responsable:** la persona que trabaja en ese momento, según `git config user.name`. Si está vacío, se le pregunta; nunca se pone el nombre de un agente.

## AAAA-MM-DD HH:mm -0500 · Base del proyecto

- **Responsable:** <git config user.name>.
- **Entregado:** base del backend lista para agregar reportes: autenticación, salud del servicio y caché.
- **Detalle técnico:** proyecto NestJS creado con la skill `nest-base` del harness.
- **Referencia:** <commit inicial>.
