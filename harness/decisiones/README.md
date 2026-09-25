# Decisiones

Decisiones **de este repositorio**, que se van tomando a medida que el proyecto crece. Esta carpeta pertenece al repo: el paquete `@linktic/arness-back` la crea una sola vez y `arness sync` nunca la modifica. El resto de `harness/` es la base gestionada por el paquete y **no se edita**: todo lo nuevo se registra aquí.

## Reglas

- Un archivo por decisión: `NNNN-titulo-en-kebab-case.md`, con numeración correlativa y a partir de `_plantilla.md`. Atajo: `pnpm arness decision new "<título>"`.
- **Estados:** `Propuesta` → `Aceptada` → `Reemplazada por NNNN` | `Obsoleta`. Solo las decisiones `Aceptada` son vinculantes.
- Una decisión `Aceptada` prevalece sobre la base **solo dentro de su alcance**.
- Las decisiones aceptadas no se reescriben. Para cambiar una se crea otra que la reemplace, y en la anterior solo se actualiza el estado.
- Los agentes redactan las decisiones en estado `Propuesta`; solo un humano las pasa a `Aceptada`.
- Toda decisión se agrega a la tabla de abajo, que debe quedar al final de este archivo.

## Índice

| # | Decisión | Estado | Alcance | Fecha |
|---|---|---|---|---|
