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

### D3. Estado "Finalizada" de la OV — 2026-10-10 — ROADMAP tarea 6
- **Contexto:** la OV pasa a FINISHED cuando su saldo llega a cero, aunque la obra siga en producción o instalación;
  la pantalla decía "Finalizada Cerrada" y se leía como obra terminada.
- **Opciones:** A) solo cambiar la etiqueta a "Pagada (saldo cero)". B) FINISHED solo cuando el saldo es cero Y todas
  las instancias tienen firma de conformidad (cambia la lógica y los reportes que filtran por FINISHED).
- **Recomendación:** A ahora (no cambia lógica); B si Gabriel quiere que "Finalizada" signifique obra entregada.
- **Reversible:** sí (aplicada A: etiqueta "Pagada (saldo cero)" en el monitor de Ventas).
- **Estado:** pendiente

### D4. IVA de las órdenes de compra — 2026-10-10 — ROADMAP tarea 6
- **Contexto:** la OC no guarda tasa de IVA; "Todas las OCs" y el detalle calculan el total con 16% fijo. La recepción
  sí pide la tasa (16%, 8% o 0%), así que una OC exenta o de frontera se ve con un total equivocado hasta recibirse.
- **Opciones:** A) agregar tasa de IVA a la OC (por defecto 16%, editable al emitir; migración con 0.16 en las
  existentes). B) dejar 16% fijo en la OC y que solo la factura/recepción lleve la tasa real.
- **Recomendación:** A.
- **Reversible:** no aplicado (requiere migración); la tarea sigue con lo demás.
- **Estado:** pendiente

### D5. Valor del inventario en el tablero de Inventario — 2026-10-10 — ROADMAP tarea 6
- **Contexto:** el tablero mostraba $2,259,249.11 (suma de existencias incluyendo negativas, sin producción en
  proceso) y Valuación $2,283,776.16 (materia prima positiva + en proceso + terminado).
- **Opciones:** A) el tablero muestra el mismo total que Valuación; Almacén ve "—" porque la valuación es solo para
  Dirección, Gerencia y Administración (decisión del PLAN 1). B) mantener un número propio para Almacén.
- **Recomendación:** A.
- **Reversible:** sí (aplicada A).
- **Estado:** pendiente

### D6. Quién administra usuarios — 2026-10-10 — ROADMAP tarea 6 (seguridad)
- **Contexto:** crear, editar y borrar usuarios no revisaba rol: cualquier usuario con sesión podía crear un DIRECTOR,
  cambiar el rol o la contraseña de otro, o borrarlo. Está así en producción hasta el próximo push.
- **Opciones:** A) DIRECTOR y ADMIN administran usuarios; cada quien cambia solo su nombre, teléfono y contraseña.
  B) solo DIRECTOR. C) DIRECTOR y MANAGER.
- **Recomendación:** A (es lo que el código ya sugería con la meta mensual: ADMIN y DIRECTOR).
- **Reversible:** sí (aplicada A). "Eliminar" pasa a "Dar de baja" con motivo obligatorio (nunca se borra).
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
