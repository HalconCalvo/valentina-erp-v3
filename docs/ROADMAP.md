# ROADMAP — Valentina ERP

Orden de trabajo (CLAUDE.md §1). Se toma la tarea de mayor prioridad que no esté en espera:
plan → implementación → pruebas → commit → siguiente. Se actualiza al terminar cada tarea.

Estados: **en curso** · **en espera** (de quién) · **pendiente** · **hecha** (fecha, commit).

## 1. La ruta de producción decide qué lleva existencia — en espera (Gabriel, en producción)
- Código en producción: 72d8d23 (2026-10-10), migración q6r7s8t9u0v1 aplicada en Render.
- Falta que Gabriel resuelva en producción los 6 materiales de la sesión #2 (Inventario físico → sesión #2 →
  editar cada material, como DIRECTOR):
  | Material | Acción | A gasto |
  |---|---|---|
  | CINTA CANELA | Ruta → CONSUMIBLE, con motivo | 12 → $413.40 |
  | PEGAZUL (pega azulejo) | Ruta → CONSUMIBLE, con motivo | 105 → $10,851.75 |
  | RECOLECCION BASURA | Ruta → SERVICIO, con motivo | 7 → $0.00 |
  | PAPEL HIGIENICO | "Enviar existencia a gasto", con motivo | 2 → $1,020.00 |
  | AGUARRAS | "Enviar existencia a gasto", con motivo | 0.5 → $630.00 |
  | THINNER | "Enviar existencia a gasto", con motivo | 4 → $2,940.00 |
  Total $15,855.15, fechado al corte 30/09/2026 23:59:59. Después: recargar la sesión, la contadora captura
  los 46 restantes, envía y el Director autoriza.
- Ensayado en copia de producción (2026-10-10): resultado idéntico al esperado.

## 2. F3 + márgenes + comisión: prueba en pantalla y push — pendiente
- 4 commits locales sobre producción (corrección de recetas y precios al autorizar, definición única de
  márgenes, comisión = c × venta sin IVA, ajuste de test). Migraciones m3n4o5p6q7r8 → n4o5p6q7r8s9.
- Falta: prueba en pantalla en la copia local; push según reglas (fuera de horario).
- Al subir, n4o5p6q7r8s9 recalcula en producción sobreprecio y comisión guardados (no cambia precios).

## 3. Guía de pantallas — pendiente
- Inventariar todas las pantallas; proponer `docs/GUIA_PANTALLAS.md` con base en las mejores pantallas actuales.
- Aprobación de Gabriel vía DECISIONES_PENDIENTES.

## 4. Aplicar la guía por módulos — en espera (aprobación de la guía)
- Primero Ventas, Inventario y Compras.

## 5. F4: bitácora en todo el sistema — pendiente

## 6. Pendientes del journal — pendiente
- Kárdex: filtro Desde/Hasta, subtotal positivo en salidas, montos negativos "-$60.00", histórico con costo por millar.
- "Finalizada" en la OV (significa saldo cero, no obra terminada).
- Borrados físicos (p. ej. lote en borrador).
- Conversión millar/pieza en devoluciones por NC e /inventory/reception.
- Heartbeat 404.
- Costo de compra se redondea hacia arriba por punto flotante en `inventory_service._apply_purchase_cost`
  (34.45 → 34.46). Encontrado 2026-10-10.

## 7. Plan del arranque en ceros — pendiente
