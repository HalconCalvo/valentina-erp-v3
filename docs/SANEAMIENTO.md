# Plan de saneamiento de producción

> Decisión de Gabriel (D8, 2026-10-10): **no hay arranque en ceros**. Todo lo que hay en producción es real y se corrige
> poco a poco con la regla de oro: cancelar o ajustar con motivo, nunca borrar. Este documento reemplaza al plan de
> arranque.

**Reporte:** consultas de solo lectura a producción, 10/10/2026 ~15:00. Quién corrige: **App** = Gabriel desde la
aplicación; **Herramienta** = requiere código (lo construye Claude Code, con vista previa, motivo y bitácora).

## 1. Registros de prueba

| # | Registro | Estado hoy | Recomendación | Quién |
|---|---|---|---|---|
| 1.1 | Cotizaciones COT-0052 "Prueba 3" y COT-0059 "Prueba" (INMOBILIARIA SAN PEDRO CHOLUL) | Borrador | Cancelar con motivo "Registro de prueba" | App (Ventas → cotización → Cancelar) |
| 1.2 | COT-0004 "Prueba 8 Sep" (cancelada), COT-0066 "Prueba 7 Sep" (perdida); OV-0086, OV-0096, OV-0108 (canceladas) | Ya cerradas | Dejar | — |
| 1.3 | Cliente #22 "Cliente Prueba SA de CV" | Activo, sin cotizaciones ni OVs | Dar de baja | App (Monitor Clientes → Cancelar) |
| 1.4 | Proveedor #55 "PROVEEDOR PRUEBA 5E" | Activo, con 1 OC y 1 factura | Revisar si la OC y la factura son de prueba: si sí, cancelar la factura (Tesorería → CxP) y la OC, y dar de baja el proveedor; si no, renombrarlo | App |
| 1.5 | Material #805 "0990909 prueba" | Activo, sin existencia, sin recetas ni OCs | Dar de baja | App (Materiales → editar → Dar de baja) |
| 1.6 | Material #726 "TESTO1B ESTOPA" | Real (falso positivo del filtro "test") | Dejar | — |
| 1.7 | Usuario #1 "Director General <admin@example.com>" | Administrador principal | Cambiar el correo por uno real | App (Usuarios → editar) |
| 1.8 | Movimientos bancarios y de caja chica | Ninguno con texto de prueba | — | — |

## 2. OVs legacy (20, importadas en septiembre)

Todas tienen tasa "IVA Estándar" (16%). No hay en el catálogo una tasa llamada "Exento"; existe "Tasa Cero" (0%).

| # | Hallazgo | OVs | Recomendación | Quién |
|---|---|---|---|---|
| 2.1 | Facturas de avance **cobradas** (neto de anticipo amortizado) que siguen **PENDIENTE** | OV-0115 (1), OV-0117 (7), OV-0122 (3), OV-0130 (1), OV-0131 (1) = 13 facturas | Marcarlas PAGADAS | **Herramienta** "Recalcular estado de facturas de cliente" |
| 2.2 | OV **Finalizada/Pagada** con parte **sin facturar** (total − cobrado) | OV-0115 $23,193.97; OV-0117 $316,853.42; OV-0128 $70,075.14; OV-0129 $50,537.04; OV-0130 $24,434.24 | Confirmar con contabilidad si falta facturar (o si es fondo de garantía o descuento); según la respuesta: regresar a Vendida y recalcular saldo, o registrar el ajuste con motivo | Decisión de contabilidad → **Herramienta** de recálculo |
| 2.3 | Saldo **negativo** | OV-0131 CANEA: −$46,796.40 (cobrado $93,594 de $93,594.60) | Recalcular saldo ($0.60) y estado | **Herramienta** |
| 2.4 | Saldo guardado distinto a total − cobrado | OV-0122 ZENARA ($21,619.92 vs $343,770.48), OV-0123 PUERTO PALMERAS ($1,069,968.75 vs $2,036,060.80) | Recalcular con la misma regla | **Herramienta** |
| 2.5 | IVA 16% en OVs que debían ser exentas | Por identificar con contabilidad (el reporte no puede distinguirlo) | Contabilidad indica cuáles; se corrige la tasa de la OV y de sus facturas con motivo | Lista de contabilidad → **Herramienta** |
| 2.6 | Pendientes contables conocidos (journal 05/10) | ZENARA filas 15–16 (folios, abono de 2025), HABITARE OT 100 (fecha futura), GALERÍAS PH 71 (anticipo $49,539.54 vs $43,539.54), SPCH OC 58 2 y OC 65 (¿facturas?) | Contabilidad confirma cada uno; se corrige factura por factura | App (Rayos X: editar/cancelar factura con motivo) |

## 3. OVs no legacy con saldo descuadrado

| # | OV | Hallazgo | Recomendación | Quién |
|---|---|---|---|---|
| 3.1 | OV-0019 Santa Loreto Etapa 2 (Finalizada) | Anticipo $81,517.50 marcado PAGADO sin abono ni movimiento bancario; saldo −$34,690.50 | Confirmar si el anticipo se cobró: si sí, registrar el abono con fecha y cuenta reales; luego recalcular saldo | App (abono) + **Herramienta** (recálculo) |
| 3.2 | OV-0045 "Puerto Palmeras" (Vendida, 14 partidas) vs **OV-0123** "PUERTO PALMERAS, 18 LOTES" (legacy) | Misma obra y cliente, totales casi iguales; OV-0045 tiene dos anticipos PAGADOS ($1,311,381.50) sin abonos | Probable duplicado: confirmar cuál es la buena. Si es OV-0123, cancelar OV-0045 con motivo (sin efecto en bancos: no hay abonos) | Decisión → App (cancelar OV) |
| 3.3 | OV-0066 Casa NADIRA 33A | Anticipo cobrado ($76,748.98) pero el saldo guardado es el total | Recalcular saldo | **Herramienta** |
| 3.4 | OV-0041 (factura 481) y OV-0053 (facturas 591 y 615) | Facturas de avance con anticipo amortizado **mayor** que la factura (p. ej. $82,419.50 sobre $74,177.55; parece capturado con IVA) | Corregir el anticipo amortizado de cada factura | App (Rayos X: editar factura con motivo); la herramienta las lista como anomalía |

## 4. Proveedores, bancos y caja chica

| # | Hallazgo | Recomendación | Quién |
|---|---|---|---|
| 4.1 | 29 facturas de proveedor PAGADAS (casi todas anticipos "ANT-OC-…") sin pago registrado: se pagaron por "Pago Fast-Track" (movimiento bancario directo) | Dejar el dinero como está; **corregir el flujo** para que el pago rápido registre también el pago a proveedor | **Código** (flujo Fast-Track) |
| 4.2 | Santander: saldo guardado $243,109.92 vs inicial + movimientos $245,507.64 (diferencia **$2,397.72**). Hay dos pagos Fast-Track de $2,397.72 (10/08 y 19/08) a facturas distintas (#223 y #252) y otra factura #271 con el mismo folio de anticipo que #252 | Comparar con el estado de cuenta: si hay un pago duplicado, registrar el ingreso/ajuste con motivo; si el estado de cuenta coincide con $243,109.92, falta un movimiento de egreso por $2,397.72 | App (movimiento manual con motivo) tras revisar el estado de cuenta |
| 4.3 | Inversión Creciente: cuadra ($264,250.00) | — | — |
| 4.4 | Caja chica: egresos = reposiciones ($155,711.30); saldo $5,000 con fondo configurado $6,000 | Si el fondo real es $6,000, registrar una reposición de $1,000 | App |

## 5. Inventario y compras

| # | Hallazgo | Recomendación | Quién |
|---|---|---|---|
| 5.1 | 0601-040 Bisagra salice: existencia −1 sin ningún movimiento en kárdex | Ajuste de inventario a 0 con motivo (o lo resuelve el conteo físico de la sesión #2) | App |
| 5.2 | 0502-004: dos requisiciones automáticas activas (duplicado anterior al candado del 10/10) | Cancelar una | App (Compras → Solicitudes) |
| 5.3 | Materiales activos: **178 sin proveedor**, **78 sin unidad de compra/uso**, **45 de ruta MATERIAL con costo 0** | Completar el catálogo; lista en `~/Downloads/saneamiento_materiales_2026-10-10.xlsx` | App (Materiales) o **Herramienta** de importación masiva si se llena el Excel |
| 5.4 | Comprometido vs reservas activas | Cuadra | — |
| 5.5 | SKU duplicados | Ninguno | — |

## 6. Herramientas que construye Claude Code (en orden)

1. **Recalcular estado y saldo de facturas y OVs** — **hecha (2026-10-10)**: Gerencia → tarjeta "Saneamiento".
   Vista previa (antes → después), se eligen las filas, motivo obligatorio, solo DIRECTOR/MANAGER, todo en bitácora.
   Regla: saldo de la OV = total − abonos vigentes; factura PAGADA cuando abonos + notas de crédito + anticipo
   amortizado la cubren. No crea abonos, movimientos bancarios ni comisiones. Se corrigió además la causa de 2.1: al
   registrar un abono ya se descuenta el anticipo amortizado (y la comisión se calcula sobre el neto).
   Antes de aplicar: 2.2 (OVs Finalizadas que regresarían a Vendida) y 3.1/3.2 (anticipos "pagados" sin abono, que
   regresarían a Pendiente) esperan la respuesta de contabilidad (D14); 2.1, 2.3, 2.4 y 3.3 se pueden aplicar ya.
2. **Pago Fast-Track registra el pago a proveedor** (4.1), para que no se repita.
3. **Corrección de tasa de IVA de una OV legacy y sus facturas** (2.5), cuando contabilidad entregue la lista.
4. **Importación masiva del catálogo** (5.3) desde el Excel completado, si se prefiere a capturar uno por uno.
