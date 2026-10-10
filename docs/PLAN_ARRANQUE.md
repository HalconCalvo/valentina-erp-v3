# Plan del arranque en ceros — PROPUESTA (pendiente de Gabriel, D8–D12)

> Borrador del 2026-10-10 (ROADMAP tarea 7). No se ejecuta nada hasta que Gabriel apruebe las decisiones.

## 1. Situación hoy (producción, conteo de la copia del 10/10/2026)

| Dato | Registros | ¿Parece real o de prueba? |
|---|---|---|
| Materiales | 813 | Real (catálogo; inventario físico de septiembre en captura) |
| Proveedores / Clientes | 74 / 28 | Real |
| Productos y versiones de diseño | 279 / 365 | Real (recetas) |
| Usuarios | 26 | Real |
| Órdenes de compra / facturas de proveedor / CxP | 322 / 391 / 358 | **Mezcla**: hay compras y recepciones reales de septiembre–octubre |
| Pagos a proveedores / movimientos bancarios | 303 / 628 | **Mezcla** |
| Caja chica | 601 movimientos | Real (Delmy Barrera, octubre) |
| Cotizaciones / OVs / cobros a clientes | 86 / 127 / 71 | Mezcla de pruebas y OVs reales |
| Lotes de producción / kárdex | 25 / 834 | Mezcla |

El journal del 05/10 dice "los datos actuales de producción son de prueba (se borran en el arranque)", pero desde
entonces producción se usa para operar (compras, recepciones, caja chica, inventario físico con corte al 30/09). Por eso
el arranque ya **no puede ser borrar todo**: hay que separar lo real de lo de prueba (D8).

## 2. Propuesta

**Fecha de corte:** el día que Gabriel elija, a las 23:59:59 hora Mérida (igual que el inventario físico).

**Se conserva tal cual:** usuarios y roles, configuración global, tasas de IVA, proveedores, clientes, materiales (con
su costo vigente), productos y recetas, bitácora de cambios.

**Saldos de apertura (al corte):**
1. Inventario: la existencia aprobada del inventario físico (sesión de septiembre y, si hace falta, una sesión nueva al
   corte). Kárdex nuevo con un movimiento "Saldo de apertura" por material.
2. Cuentas por cobrar: las OVs vivas con su saldo, con el importador legacy (plantilla de 2 hojas ya probada).
3. Cuentas por pagar: facturas de proveedor pendientes al corte (plantilla nueva, misma idea que el importador legacy).
4. Bancos: saldo de cada cuenta al corte (un movimiento de apertura).
5. Caja chica: saldo del fondo al corte.

**Lo de prueba:** no se borra (regla de oro). Se marca como "anterior al arranque": un campo `pre_go_live` (o la fecha
de corte) y las pantallas operativas lo filtran; reportes y bitácora lo siguen viendo.

**Multiempresa (SaaS, Fase 11 del plan maestro):** no se mezcla con el arranque (D11).

## 3. Cuatro caminos

1. **Feliz:** respaldo completo → se congela la operación al corte → se cargan saldos de apertura → validación cruzada
   (inventario, CxC, CxP y bancos cuadran contra Compaq y estados de cuenta) → se abre la operación.
2. **Corrección:** un saldo de apertura mal capturado se corrige con su propio ajuste con motivo (nunca editando el
   movimiento de apertura); la validación cruzada se repite.
3. **Excepción:** una diferencia descubierta después de abrir (p. ej. factura de proveedor que no se incluyó) se registra
   como movimiento con fecha efectiva al corte y motivo; el periodo del corte se reabre solo con DIRECTOR.
4. **Cancelación:** si la validación cruzada no cuadra el día del corte, no se abre: se restaura el respaldo y se
   reprograma la fecha.

## 4. Pasos técnicos (cuando se apruebe)

1. Migración: marca `pre_go_live` / fecha de arranque en GlobalConfig y filtros en pantallas operativas.
2. Plantillas e importadores: CxP de apertura y saldos bancarios (el de OVs ya existe).
3. Ensayo completo en la copia local con un dump fresco, cuadre contra los archivos de contabilidad.
4. Lista de verificación del día (respaldo, congelar, importar, cuadrar, abrir) y plan de vuelta atrás.

## 5. Decisiones para Gabriel

- **D8. ¿Qué es real hoy?** Recomiendo: catálogos, inventario físico de septiembre, compras/recepciones/pagos de
  proveedores desde septiembre y caja chica son reales; cotizaciones y OVs de prueba se identifican con la lista que
  dé Ventas. Alternativa: declarar todo lo transaccional como prueba y recargar saldos.
- **D9. Fecha de corte.** Recomiendo fin de mes (31/10/2026 23:59:59) para cuadrar con Compaq.
- **D10. Cómo se trata lo de prueba.** Recomiendo marcarlo y ocultarlo (no borrar). Alternativa: base nueva limpia y la
  actual queda de solo lectura como histórico.
- **D11. Multiempresa.** Recomiendo dejarlo fuera del arranque (6–8 semanas; arrancar con una sola empresa).
- **D12. Saldos de apertura de CxP y bancos.** Recomiendo importarlos de un Excel validado por contabilidad (misma
  mecánica validar → vista previa → importar todo o nada).
