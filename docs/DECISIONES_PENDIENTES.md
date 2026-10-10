# Decisiones pendientes de Gabriel

Decisiones de negocio que no detienen el trabajo (CLAUDE.md §1). Gabriel las revisa en bloque.
Si la decisión es reversible se aplica la recomendación mientras tanto; si no, la tarea espera.

## Formato

```
### D<n>. <título corto> — <fecha AAAA-MM-DD> — <tarea del ROADMAP>
- **Contexto:** qué se encontró y por qué hace falta decidir.
- **Opciones:** A) … B) … C) …
- **Recomendación:** opción y por qué.
- **Reversible:** sí (aplicada la recomendación) / no (tarea en espera).
- **Estado:** pendiente | aprobada (<fecha>, opción) | rechazada (<fecha>, motivo)
```

## Pendientes

### D2. Títulos de pantalla: sin color o un color por módulo — 2026-10-10 — ROADMAP tarea 4
- **Contexto:** al aprobar D1 la elección de títulos llegó sin resolver ("[sin color, un solo estilo / conservar
  un color por módulo]").
- **Opciones:** A) sin color, un solo estilo (`text-slate-800`). B) conservar un color por módulo.
- **Recomendación:** A. Hoy solo Finanzas tiene títulos de color y no siguen una regla (azul, índigo y verde en
  el mismo módulo); el módulo ya se distingue por el menú y el ícono.
- **Reversible:** sí (aplicada la recomendación en la guía; cambiarla es una clase por pantalla).
- **Estado:** pendiente

## Resueltas

### D1. Aprobar la guía de pantallas — 2026-10-10 — ROADMAP tarea 3
- **Contexto:** `docs/GUIA_PANTALLAS.md` (propuesta) fija contenedor, encabezado, tarjetas, filtros, tablas,
  botones, modales y formatos con base en las mejores pantallas actuales (Valuación, Kárdex, Importación legacy,
  Proveedores, Bitácora). Hoy conviven 3 estilos de título, 4 colores de botón primario y ~25 formatos de moneda.
- **Puntos que más se notan para el usuario:**
  1. Un solo color primario (indigo); verde solo para crear, recibir, cobrar y pagar.
  2. Moneda siempre `$1,234.56` / `-$60.00` (hoy varias pantallas muestran formato MXN de es-MX).
  3. Títulos sin color por módulo (Finanzas hoy los tiene en azul, índigo o verde).
  4. Rayos X se divide al rediseñarlo (hoy abre hasta 9 ventanas una sobre otra).
- **Opciones:** A) aprobar tal cual. B) aprobar con cambios (indicar cuáles). C) rechazar.
- **Recomendación:** A. Se aplica por módulo (ROADMAP tarea 4), empezando por Ventas, Inventario y Compras.
- **Reversible:** no se aplica a pantallas existentes hasta aprobarla (tarea 4 en espera).
- **Estado:** aprobada (2026-10-10, A): un color primario y verde solo para crear/recibir/cobrar/pagar;
  moneda `$1,234.56` / `-$60.00`; Rayos X dividido. Títulos: ver D2.
