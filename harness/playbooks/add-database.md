# Playbook: agregar una conexión de BD

Referencia: `AGENTS.md` §6 y §13.

1. **Confirmar con el humano:** el nombre lógico de la conexión (UPPER_SNAKE, ej. `REPORTS`) y qué módulos la usarán. Nunca pidas ni escribas credenciales reales en el código ni en el chat.
2. Agrega el nombre a `DATABASES` y el bloque de variables `DB_<NOMBRE>_*` en:
   - `.env.example`, con valores de ejemplo;
   - `.env.local`, con valores locales de desarrollo.
   - **No toques `.env`.**
3. Verifica que la validación de `src/config/` exige las variables de cada nombre listado en `DATABASES`. Normalmente no requiere cambios de código, porque es dinámica.
4. En los repositories que la usen, inyecta el pool con `@Inject(getPoolToken('<NOMBRE>'))`.
5. Confirma que `/health` reporta la nueva conexión.
6. Documenta la conexión en el `README.md` de cada módulo que la use.
7. Corre `./harness/init.sh`.

Recuerda que el usuario de BD debe ser de solo lectura. El pool fuerza `default_transaction_read_only = on` como segunda barrera, no como única.
