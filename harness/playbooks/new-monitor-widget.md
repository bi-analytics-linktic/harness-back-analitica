# Playbook: agregar un widget al monitor

Referencia: `AGENTS.md` §10 y §13, y `harness/reference/contrato-http.md` (Monitor). El monitor ya existe en `src/common/monitor/` (skill `nest-base`).

## 0. Confirmar con el humano

```
Widget:      <id-kebab>  ·  Título: <texto corto>  ·  Orden: <número>
Muestra:     <qué cifra o estado técnico>  ·  Desglose: <sí/no, por qué>
Origen:      <de dónde sale el dato: Nest, pool, caché, process>
Costo:       <consultas o llamadas por carga de página>
```

**Qué puede mostrar:** conteos, estados (`up`/`down`), versiones, uptime, tamaños de pool y latencias agregadas.
**Qué nunca muestra:** secretos o variables de entorno, SQL, mensajes de error de PostgreSQL o Redis, hosts o usuarios de BD, y datos de negocio (filas, montos, nombres de clientes). Si el humano pide algo de esta lista, detente: requiere una decisión en `harness/decisiones/`.

## 1. Implementar

1. Crea `src/common/monitor/widgets/<id>.widget.ts`: una clase `@Injectable()` que implementa `MonitorWidget` (`id`, `title`, `order`, `collect(): Promise<MonitorValue>`).
2. `collect()` debe ser barato y de solo lectura: sin escrituras, sin SQL de negocio y sin depender de Redis. Si necesita la BD, usa una consulta técnica en un `*.sql.ts` y el repository de `common/`; si falla, deja que lance: el monitor lo muestra como "No disponible" y registra solo el tipo de error.
3. Regístrala en `src/common/monitor/monitor.module.ts`, agregándola al arreglo `WIDGETS`. El multi-provider `MONITOR_WIDGETS` la recoge sola.
4. `src/common/` no importa de `src/modules/`. Si el dato es de un módulo de negocio, no va al monitor base: regístralo como decisión.

## 2. Tests

- `<id>.widget.spec.ts`: el valor y el desglose esperados, y que un error del origen se propaga (no se traga ni se formatea).
- Si cambia el HTML, ajusta `test/monitor.e2e-spec.ts` para que siga comprobando que no hay `<script>` y que un widget con error no rompe la página.

## 3. Cierre

Corre `./harness/init.sh` y revisa el checklist de `harness/playbooks/review.md` (un widget con datos sensibles es bloqueante).
