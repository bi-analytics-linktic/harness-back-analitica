# Playbook: crear un módulo o cliente

Referencia: `AGENTS.md` §4 y §5.

1. **Confirmar con el humano:** nombre del cliente (carpeta de primer nivel), nombre del módulo, segmento base de la URL y conexión de BD por defecto.
2. **Cliente nuevo:** crea `src/modules/<cliente>/`. Si se quiere agrupar sus módulos, agrega `<cliente>.module.ts` que los importe, y regístralo en `app.module.ts`.
3. **Módulo nuevo:** crea `src/modules/<cliente>/<modulo>/` con:
   - `<modulo>.module.ts`: `@Module({ controllers: [], providers: [] })`, sin imports de otros módulos de negocio.
   - `README.md` con esta plantilla:
     ```markdown
     # <Módulo>
     Propósito: <una frase>.
     Conexión BD: <NOMBRE>.
     | Endpoint | Origen de datos | Caché TTL |
     |---|---|---|
     ```
4. Registra el módulo en su padre (el módulo del cliente o `app.module.ts`).
5. Crea la carpeta `<cliente>/<modulo>` en la colección de Postman y un encabezado `## <Módulo>` en `FRONT.md`.
6. Agrega endpoints con `new-endpoint.md`.
7. Corre `./init.sh`.
