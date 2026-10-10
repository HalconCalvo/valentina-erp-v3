# ROADMAP — Valentina ERP

Orden de trabajo (CLAUDE.md §1). Se toma la tarea de mayor prioridad que no esté en espera:
plan → implementación → pruebas → commit → siguiente. Se actualiza al terminar cada tarea.

Estados: **en curso** · **en espera** (de quién) · **pendiente** · **hecha** (fecha, commit).

## 1. La ruta de producción decide qué lleva existencia — hecha (2026-10-10, 72d8d23)
- Gabriel resolvió los 6 materiales en producción (verificado: 6 líneas fuera, $15,855.15 a gasto, 46 por capturar).
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

## 2. Push a producción — listo (fuera de horario: hoy después de 19:00 o domingo)
- 2026-10-10 13:25: cadena de migraciones q6 → m3 → n4 → r7 → s8 → t9 probada (subir, bajar, subir) en copia fresca de producción; 244 tests backend, 17 frontend, build.
- Prueba en pantalla por rol (7 usuarios de prueba): todas las pantallas cargan; lo prohibido responde 403; MANAGER captura el inventario físico.
- 2026-10-10 probada en pantalla (copia local): COT-0086 enviada a Dirección, corrección de precio del tapacanto
  (5.33 → 6.00) con motivo; costo 9,866.06 → 9,933.06, precio de venta conservado, sobreprecio 29.68% → 28.80%,
  comisión $673.36 (5% de la venta sin IVA), anticipo 50%; catálogo actualizado y bitácora con
  "COT-0086: <motivo>". Sobreprecio mínimo (25) visible en Configuración.
- Migraciones m3/n4 probadas en local: bajar y subir; una sola cabeza. Tests: backend 208, frontend 14, build.
- El push sube también la F4 (commits locales en orden: F3, márgenes, comisión, ajuste de test, docs, F4).
- 4 commits locales sobre producción (corrección de recetas y precios al autorizar, definición única de
  márgenes, comisión = c × venta sin IVA, ajuste de test). Migraciones m3n4o5p6q7r8 → n4o5p6q7r8s9.
- Falta: prueba en pantalla en la copia local; push según reglas (fuera de horario).
- 2026-10-10: la extensión de Chrome no conecta ("Browser extension is not connected"); Gabriel debe abrir
  Chrome con la extensión y la misma cuenta de claude.ai. Backend 8000 y Vite 3000 locales ya corren.
- Al subir, n4o5p6q7r8s9 recalcula en producción sobreprecio y comisión guardados (no cambia precios).

## 3. Guía de pantallas — hecha (2026-10-10, D1 aprobada)
- Inventariar todas las pantallas; proponer `docs/GUIA_PANTALLAS.md` con base en las mejores pantallas actuales.
- Aprobación de Gabriel vía DECISIONES_PENDIENTES.
- 2026-10-10: propuesta escrita en `docs/GUIA_PANTALLAS.md`; inventario de 47 rutas. Hallazgos para la tarea 4:
  - `fetch()` directo (16): Kanban de producción ×8, reporte de pagos a proveedores ×3, centro de impresión ×2,
    estado de cuenta de proveedor, catálogo de diseño, importación CSV de clientes y proveedores.
  - `<input>` nativo visible: Login, catálogo de diseño, pantalla de campo.
  - 35 modales hechos a mano (`fixed inset-0`), 7 en Órdenes de compra.
  - `console.*` en hooks: useDesign, useFoundations, useMaterials, useClients, useProviders.
  - Acciones de solo ícono sin descripción (sin tooltip): Usuarios y Tasas de IVA.
  - Páginas huérfanas sin ruta: AccountsPayablePage, InstanceBaptismPage, auth/pages/LoginPage.tsx (vacío);
    routes/ProtectedRoute.tsx sin uso (las rutas solo validan sesión, no rol, salvo legacy-import y campo).

## 4. F4: bitácora en todo el sistema — hecha (2026-10-10, commit local; push fuera de horario)
- SQL directo → ORM: cuentas por pagar en finanzas (pagado/cancelado por folio), corrección de recepción
  (el DELETE físico pasa a cancelación de la CxP y su factura, con motivo; renglones de factura quedan en 0),
  gastos operativos (alta, edición, cancelación con motivo), alta de CxP en recepción, requisiciones automáticas.
- Una factura cancelada libera su folio (sincronización de finanzas y recepción la ignoran).
- Botón "Historial" en proveedor, cliente, usuario, lote de producción y factura de compra (cotización, OV,
  material y versión ya lo tenían).
- Probado: 6 tests nuevos (208 en total), en PostgreSQL local por API y botones en pantalla.

## 5. Aplicar la guía por módulos — primera ola hecha (2026-10-10); el resto conforme se toque
- Base común: utils/format.ts, VSummaryCard, botón primario índigo, Modal con opción `bare`, acciones con descripción.
- Arreglo general: Modal ponía `h-[90vh]` a todas las ventanas (comentario dentro de las clases); ahora se
  ajustan a su contenido.
- Ventas: acciones de flujo de cotización con texto; detalle y captura de cotización con encabezado estándar;
  moneda y fechas únicas; Rayos X dividido (diálogos, abonos, selector de casas, entregables; 3,263 → ~2,000 líneas).
- Inventario: tablero con valuación completa, kárdex, recepción, inventario físico y requisiciones con formatos
  únicos, encabezados estándar, esqueleto de carga y estado vacío.
- Compras: las 8 ventanas hechas a mano pasan a Modal (cierran con Escape); 30 montos es-MX → $1,234.56.
- Pendiente (conforme se toquen): Finanzas, Tesorería, Dirección, Producción (Kanban con `fetch()`), Diseño,
  Logística; tablero de Ventas (archivo de 1,600 líneas) y cuerpo de Rayos X (tabla de facturas).

## 6. Pendientes del journal — en curso
- Hecho (2026-10-10, commits locales): Heartbeat 404; redondeo del costo de compra; requisiciones duplicadas
  (candado); corrección de recepción (saldo de factura y tasa exenta); devoluciones por NC y /inventory/reception
  en unidad de uso (millar → pieza); kárdex con salidas negativas; tablero de Inventario = Valuación (D5);
  "Finalizada" → "Pagada (saldo cero)" (D3); usuarios, caja chica y solicitudes de pago se cancelan, no se borran.
- **Seguridad (hecho, commit 4d0963b + 2597aff):** sesión y rol en todas las escrituras de dinero, compras,
  inventario y usuarios (D6, D7). En producción sigue abierto hasta el push.
- D2–D7 resueltas por Gabriel y aplicadas (D4: IVA en la OC, migración t9u0v1w2x3y4; D7: pagos solo DIRECTOR con interruptor para MANAGER, s8t9u0v1w2x3).
- Borrados físicos (hecho): diseño (producto/versión se desactivan), lote en borrador (CANCELLED), nómina pendiente
  de firma al cambiar equipo (CANCELLED); migración u0v1w2x3y4z5.
- Se deja: limpiar una asignación provisional de equipo en Planeación sigue borrando la fila (plan sin efecto externo;
  la bitácora registra el borrado). Cancelarla exige filtrar por estado en 3 consultas (diseño, logística, campo).
- Siguen: revisión de lecturas (GET) por rol; botones de autorizar/rechazar OC como texto (guía).
- Hallazgos de la tarea 5 (2026-10-10):
  - El tablero de Inventario muestra $2,259,249.11 y Valuación $2,283,776.16: dos cálculos distintos del mismo valor.
  - Requisiciones automáticas duplicadas (0502-004 tiene dos PENDIENTE): tres pantallas las evalúan a la vez al
    cargar y la revisión "¿ya existe?" no es atómica.
  - "Todas las OCs": el total con IVA se calcula con 16% fijo.
- Borrados físicos que quedan (la bitácora los registra, pero sin el contenido): usuarios, productos y versiones
  de diseño, solicitud de pago a proveedor, movimiento de caja chica, lote en borrador y sus reservas,
  asignaciones de logística y planeación.
- Corrección de recepción parcial no ajusta el saldo pendiente de la factura (total 937, saldo 1,874);
  y lee una tasa 0% (exento) como 16%. Encontrado en la F4 (2026-10-10), se conservó el comportamiento.
- Kárdex: filtro Desde/Hasta, subtotal positivo en salidas, montos negativos "-$60.00", histórico con costo por millar.
- "Finalizada" en la OV (significa saldo cero, no obra terminada).
- Borrados físicos (p. ej. lote en borrador).
- Conversión millar/pieza en devoluciones por NC e /inventory/reception.
- Heartbeat 404.
- Costo de compra se redondea hacia arriba por punto flotante en `inventory_service._apply_purchase_cost`
  (34.45 → 34.46). Encontrado 2026-10-10.

## 7. Plan del arranque en ceros — pendiente
