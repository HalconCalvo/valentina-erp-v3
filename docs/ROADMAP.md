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

## 2. Push a producción — hecho (2026-10-10 14:22, cd103bd; producción en u0v1w2x3y4z5)
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
  - Acciones de solo ícono sin descripción: resuelto (VTable usa title; partidas de la cotización con descripción, 10/10).
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
- 2026-10-10 tarde: las 25 ventanas hechas a mano restantes (Finanzas, Tesorería, Dirección, Producción, Diseño,
  Clientes, Proveedores, Usuarios) pasan a Modal; formato único de moneda y fecha en todo el sistema; sin fetch() directo.
- Pendiente (conforme se toquen): Finanzas, Tesorería, Dirección, Producción (Kanban con `fetch()`), Diseño,
  Logística; tablero de Ventas (archivo de 1,600 líneas) y cuerpo de Rayos X (tabla de facturas).

## 6. Pendientes del journal — hecha (2026-10-10)
- Hecho (2026-10-10, commits locales): Heartbeat 404; redondeo del costo de compra; requisiciones duplicadas
  (candado); corrección de recepción (saldo de factura y tasa exenta); devoluciones por NC y /inventory/reception
  en unidad de uso (millar → pieza); kárdex con salidas negativas; tablero de Inventario = Valuación (D5);
  "Finalizada" → "Pagada (saldo cero)" (D3); usuarios, caja chica y solicitudes de pago se cancelan, no se borran.
- **Seguridad (hecho, commit 4d0963b + 2597aff):** sesión y rol en todas las escrituras de dinero, compras,
  inventario y usuarios (D6, D7). En producción desde el push del 10/10 (cd103bd).
- D2–D7 resueltas por Gabriel y aplicadas (D4: IVA en la OC, migración t9u0v1w2x3y4; D7: pagos solo DIRECTOR con interruptor para MANAGER, s8t9u0v1w2x3).
- Borrados físicos (hecho): diseño (producto/versión se desactivan), lote en borrador (CANCELLED), nómina pendiente
  de firma al cambiar equipo (CANCELLED); migración u0v1w2x3y4z5.
- Se deja: limpiar una asignación provisional de equipo en Planeación sigue borrando la fila (plan sin efecto externo;
  la bitácora registra el borrado). Cancelarla exige filtrar por estado en 3 consultas (diseño, logística, campo).
- Lecturas (GET) por rol (hecho, 2026-10-10): finanzas solo D/M/A; cotizaciones/OVs/cobros D/M/A + Ventas (lo suyo);
  logo con sesión. Campos de costo/margen fuera de Finanzas: D13.
- Botones de autorizar/rechazar OC con texto (hecho). fetch() directo: no queda ninguno (salvo el logout con keepalive).
- Guía (hecho 2026-10-10): sin console.* en el frontend; login, buscador del encabezado, selectores de archivo y el
  estatus de la receta usan los componentes. Excepción documentada: tabla de impresión del inventario físico
  (@media print). Campo no se tocó (EN ESPERA, D15).
- Revisión 2026-10-10 (noche) de los hallazgos anteriores: todos resueltos — tablero de Inventario = Valuación (D5),
  candado de requisiciones duplicadas, IVA de cada OC en "Todas las OCs" (D4), corrección de recepción parcial y tasa
  exenta, kárdex (filtro Desde/Hasta, salidas en negativo, costo por millar), "Finalizada" (D3), conversión
  millar/pieza, Heartbeat, redondeo del costo de compra. Borrados físicos: solo quedan la asignación provisional de
  Planeación (decidido dejarla) y los componentes de una receta en borrador (antes de cualquier efecto externo).
- Tarea 6 cerrada salvo lo que dependa de decisiones (DECISIONES_PENDIENTES).

## 7. Saneamiento de producción (reemplaza el arranque en ceros, D8) — en curso
- 2026-10-10: reporte en `docs/SANEAMIENTO.md`; Excel de materiales incompletos en ~/Downloads. Decisión D14 pendiente.
- Gabriel corrige desde la app lo que se pueda; Claude Code construye: recálculo de estados y saldos de CxC/OV,
  pago Fast-Track con registro de pago, corrección de IVA de OVs legacy, importación masiva del catálogo.
- Herramienta 1 hecha (2026-10-10): recálculo de estados de factura y saldos de OV (Gerencia → Saneamiento); causa de
  2.1 corregida en el registro de abonos (anticipo amortizado; comisión sobre el neto). Probada en pantalla como
  Gerencia en la copia local.
- Herramienta 2 hecha (2026-10-10): anticipos a proveedor "pagados" sin pago (17) se absorben con motivo; la recepción
  ya no los marca pagados; Fast-Track respeta D7 (Gerencia sin interruptor solo solicita); no se ejecuta un pago sobre
  factura pagada o cancelada.
- Herramienta 4 hecha (2026-10-10): actualización masiva del catálogo desde Excel (Materiales → Actualización masiva).
- Herramienta 3 (IVA de OVs legacy) en espera de la lista de contabilidad (D14 punto 3).
- CxP (hecho 10/10 noche): Gerencia ve "Pagar"/"Pago Urgente" solo con el interruptor de D7 encendido.
- Refactor hecho (2026-10-12, commit local): la lógica de CxP sale de `finance.py` a servicios y repositorio; respuestas
  idénticas en la copia local; probado en pantalla el 12/10 (tablero, archivo maestro, detalle y pago directo).
- Se deja: guardia de rutas por rol en el frontend (el servidor ya valida rol en cada ruta; un guardia por módulo
  rompería enlaces profundos legítimos, p. ej. Gerencia → /director/audit).
- Refactor hecho (2026-10-12, commit local): `sales_service.register_installment` en 4 ayudantes (~40 líneas).
- D16 hecha (2026-10-12, commit local): saldo de $1.00 o menos = pagado (GlobalConfig, solo DIRECTOR) en abonos y
  Saneamiento; migración v1w2x3y4z5a6.
- 12/10: Gabriel aplicó en producción anticipos (16), facturas pagadas (10) y OV-0066 (SANEAMIENTO §7).

## 8. D13: el vendedor solo ve precio de venta — hecha (2026-10-10)
- Servidor: toda respuesta JSON a SALES sale con costos y márgenes en nulo (middleware general, cubre pantallas
  futuras); precio sugerido en `POST /quotations/price-suggestions` (sobreprecio objetivo, tasa cero); las partidas
  del vendedor toman el costo del servidor (receta, catálogo de reventa o el costo que ya tenía la partida manual).
- Pantalla: captura de cotización y partidas de orden de cambio piden el precio al servidor. Los PDF de cotización y
  OV no llevan costos (revisado). Probado en pantalla como vendedor (COT-0087 en la copia local).

## 9. Campo — reemplazada por la tarea 10 (Gabriel, 12/10)
- Sale de espera; se trabaja dentro del recorrido de la tarea 10.

## 10. PRIORIDAD 1 — Operar la segunda mitad del recorrido (Gabriel, 12/10) — hecha (2026-10-12, commit local)
- Reporte: `docs/RECORRIDO_OPERACION.md` (OV-0039 de bautizo a firma; 12 fallos corregidos; D17).
- 2026-10-12: D18 resuelta: la nómina de cada carril toma los días de la línea INSTALACOCINA / INSTALAGRANITO de la
  receta. D19 y D20 aprobadas y aplicadas. Corregido: "Listo para instalarse" exige que la casa
  esté en producción, que ningún lote suyo esté sin entrar a producción y que al menos uno haya salido (empaque o
  después), así el material siempre se descarga. Pendiente: D21 (casas que solo llevan instalación).
- Excel para Diseño: `~/Downloads/recetas_sin_instalacion.xlsx` (14 recetas + hoja Nadira).
- Nunca se ha usado: Planeación → Producción → Logística → Campo. Con una OV real en la copia local se recorre
  completa como la usaría cada puesto:
  - Planeación: bautizo, lotes, fechas.
  - Producción: entrada del lote, descarga de material, tablero, empaque, QR.
  - Logística: agenda de cuadrillas, carga del camión escaneando.
  - Campo (vista celular): fotos, firma del cliente, cierre.
- Reglas: el escaneo de carga vive solo en Logística (patio); Campo es la obra (evidencias, firma, cierre).
  D15: la nómina de cuadrilla solo se libera con la firma del cliente; ni la asignación ni la carga la generan.
- Se corrige lo que falle en el camino; lo de negocio va a DECISIONES_PENDIENTES.
- Entregable: reporte paso a paso (qué funcionó, qué se corrigió, qué queda para Gabriel).

## 12. Logística deja de ser módulo (Gabriel, 12/10) — hecha (2026-10-12, commit local)
- Planeación Maestra decide fechas y cuadrilla; vistas Calendario (Mes/Semana/Día) y "Agenda de instalación"
  (cuadrillas del día + "Programadas sin cuadrilla" de todas las fechas, con "Asignar cuadrilla").
- Alerta roja si una instalación está a 3 días o menos (o vencida) sin cuadrilla: franja en Planeación y tarjeta
  "Sin cuadrilla" en Ruta Crítica de Dirección (`GET /planning/installations/unstaffed`).
- Campo ejecuta: agenda del día, "Carga del camión" (escaneo, `/field/load`), fotos, trabajo terminado y firma.
- Menú en el orden del recorrido: Diseño → Ventas → Planeación → Compras → Producción → Campo → Administración.
  Las rutas /logistics redirigen a Campo o Planeación.

## 13. Ambiente "Valentina Pruebas" — hecha (13/10): base copiada 13:03; API y sitio en línea, franja roja y modo seguro comprobados 14:13
- Franja roja, título "PRUEBAS ·", modo seguro forzado con APP_ENVIRONMENT=pruebas, script de copia de producción
  con candados. Pasos de Render en `docs/AMBIENTE_PRUEBAS.md`.

## 14. Obra piloto — creada en Pruebas (13/10): cliente #38, receta #422 copia de #410
- Cliente OBRA PILOTO + receta Cocina Obra Piloto (muebles, piedra, instalaciones). Guía por área en
  `docs/OBRA_PILOTO.md` (Ventas cotiza 3 casas mañana).


## 15. Importador de OVs por Folio_OV + OVs cerradas (buzón del asesor y Gabriel, 13/10) — hecha (push 17:08, probada en Pruebas)
- Folio_OV liga facturas; vacío = OV nueva (nunca duplica). Descarga del Excel ya lleno desde la app.
- La subida solo AGREGA lo que falta en Valentina y REPORTA las diferencias (no sobrescribe ni cancela; D25, D26);
  reporte de diferencias descargable para corregir a mano con motivo. Todo se sigue capturando en la app.
- Gerencia → OV y Facturación: Vigentes / Cerradas (pagadas, saldo cero) / Canceladas.
- Probada en pantalla en Pruebas (13/10 17:15): Excel descargado sin cambios = nada que agregar; Excel con abono
  cambiado y factura nueva = agrega 1, reporta 2 (no cambió el abono); OV y Facturación 36 / 9 / 82.

## 16. Decisiones de Gabriel (14/10)
1. D22 aprobada — hecha (ya aplicada desde el 12/10).
2. Costo_OV en el Excel de migración — hecha (commit local): columna opcional en la hoja OVs (sin IVA). OV legacy:
   la primera vez se registra; un cambio se reporta y se aplica solo con motivo. OV nacida en Valentina: solo se
   reporta. La plantilla descargada la incluye. Con costo, la OV entra al Margen neto % del tablero.
3. Diseño: número de receta/versión (#id) en catálogo y editor, y búsqueda por número — hecha (commit local):
   "Receta #id" en el SKU y junto a la versión, "#id" en el editor; buscar "#197" o "197" muestra solo esa versión.
4. Guía de pantallas, segunda ola (Finanzas, Tesorería, Dirección, Producción/Kanban, Diseño, tablero de Ventas,
   cuerpo de Rayos X) y luego ayuda "?" (Ventas, Compras y Almacén, Diseño, Administración, Gerencia).
   - Segunda ola de la guía — hecha (commit local): Finanzas y Rayos X, Tesorería, Dirección, Producción/Kanban,
     Diseño y Ventas (46 archivos): ~180 botones nativos → Button (emerald para crear/cobrar/pagar), encabezados
     estándar, ~45 formatos locales → utils/format, spinners → "Procesando..."/esqueleto, 2 prompt() → Modal,
     doble clic evitado en Pagar (nómina) y Solicitar Etiquetas. Errores de tipos 156 → 149 (ninguno nuevo).
     Excepciones nativas a propósito: tarjetas y renglones clicables, arrastre del Kanban, chips pequeños.
     Arreglos encontrados: estado de cuenta impreso mostraba "{formatMoney(new Date())}"; Cobranza sin "$".
     Pendiente: prueba en pantalla.
   - Ayuda "?" nivel 1 (ayuda de la pantalla abierta) — hecha (commit local): textos en `frontend/src/help/ayuda.md`
     (una sección "# /ruta" por pantalla, español sencillo, borrador para aprobación de Gabriel o del jefe de área);
     el "?" abre la ayuda de la pantalla y un botón al manual general. Niveles 2 (manual) y 3 (preguntas
     frecuentes) después.
## 17. Hallazgos del ensayo general, obra piloto OV-0157 (buzón del asesor, 14/10) — hecha en commits locales
Push pendiente: Pruebas despliega de `main` igual que producción (pregunta en el buzón, 13:27). Prueba en pantalla
pendiente (sesión local vencida). Migración nueva `x3y4z5a6b7c8` (sube/baja/sube probada en local).
1. Prioridad 1: H38 (IM/IP contra la fecha real de producción), D32 (carga: hoy + siguiente día hábil), H37 (cámara
   del iPhone: aviso, código manual, reintentar; no regresa a la lista).
2. Decisiones D29 (sin bautizo masivo en el Simulador), D30 (sin lote con faltante núcleo), D31 (requisición a
   Compras desde el Simulador, ligada a la OV).
3. Simulador/Compras/Almacén: H18, H20, H21 (requisición ↔ OV hasta la OC), H22 (quitar partida regresa la
   solicitud), H23, H24, H25, H29 (Kárdex con OV, lote y folio de OC).
4. Producción/Etiquetas: H26, H27, H30, H31, H32, H33, H34, H35 (aviso con el detalle del servidor), H36.
5. Ventas/Facturación: H2/H4 (costo de receta con una sola cifra), H3 (D33 aplicada), H5, H6, H7 (ya en la guía),
   H8, H9, H12, H13, H14. H1 no reproducido con los datos (ver buzón).

## 18. Hallazgos del ensayo, segunda parte (pasos 11–13, buzón del asesor 15/10 12:25) — hecha en `pruebas`
Confirmados en Pruebas: H38, H37, H14, D32. Sin migración nueva. Prueba en pantalla en Pruebas pendiente.
1. H42 cuadrilla sigue la fecha de su carril (modal y arrastre), nunca se borra al reprogramar; arrastre respeta H38.
2. H45 Centro de Impresión por carril hasta que ese carril se carga. H39 ✓ del calendario por carril.
3. Campo: H43 herrajes con el criterio de surtido, H41 paso "Trabajo terminado" entre Fotos y Firma, H40 encabezado
   de Carga en el teléfono.
4. H46 Pendiente de Facturar en español y con IVA indicado; D35 (suma con/sin IVA) pendiente.
5. Hecho: el modal bloquea PM y PP cada uno por su carril; el límite de H38 usa solo el lote MDF.
6. Hecho: quitar la cuadrilla de un carril la cancela (CANCELLED, con bitácora); ya no se borra.

## 19. D36 + D35-A: factura de avance = casa completa con IVA y anticipo proporcional (Gabriel 15/10 16:15) — hecha en `pruebas`
Servicio `progress_invoice_service` (sugerencia, tope, última casa); vista previa `GET /sales/orders/{id}/progress_preview`;
"Registrar Avance" con tres cifras y motivo; Pendiente de Facturar con IVA; la ventana de cobro de Cobranza guarda
la factura completa. Probado en Pruebas con Piloto 1 sin guardar.

## 20. Hallazgos del 16/10 (buzón del asesor 09:10 y 09:25: H47–H51) — hecha en `pruebas`
- H51/H50 (03a5988): Nómina de instaladores abre en "Por pagar" y titula cada bandeja; cada renglón dice su instalación
  ("Piloto 1 · Muebles / Piedra"). En la base de Pruebas el pago de David por Piedra (id 3, $800) sigue por pagar.
- H47–H49 (1afd9c7): `GET /sales/orders/{id}/billing_summary` (una sola regla de saldo, la de CxC); ventana de la OV con
  facturado sin doble anticipo, casas pendientes con IVA, "Falta cobrar del contrato" y PAGADA por saldo; abono propone
  el saldo y muestra las casas de la factura; Tesorería salda con la amortización y no acepta más que el saldo;
  antigüedad de CxC (analítica, Gerencia, Cobranza) por saldo abierto.
- Pendiente: prueba en pantalla (Chrome no conectado al terminar).
- H56 (1c80fc2, migración y4z5a6b7c8d9): una solicitud de etiquetas/manifiesto sigue en el Centro de Impresión hasta
  descargarse (impresa con fecha y usuario); Empaque avisa al pasar a Listo sin imprimir.
- Siguen: H52 (un botón "Declarar y solicitar manifiesto"), H53 (Piloto 1 firmada sigue en Empaque en
  LOTE-PIEDRA-0011), H54 ("Piedra: DEAD" → "Piedra: lista"), H55 (píldora PM/PP a la fecha real de producción).

## 11. PRIORIDAD 2 — Indicadores del tablero de Dirección (con Gabriel) — hecha (2026-10-12, commit local)
- Decisiones de Gabriel (12/10) aplicadas con una sola fuente (`GET /analytics/director-summary`, solo DIRECTOR):
  1. Ventas: OVs vendidas del año sin IVA (tasa 0 y 16) contra la meta anual.
  2. Liquidez = Bancos + CxC facturada pendiente + Inventario (3 cajones) − CxP; clic: desglose de cada componente.
  3. Rentabilidad: Margen neto % sobre venta ponderado del año; clic: 5 más y 5 menos rentables. Overhead, nómina y
     piezas pasaron a Eficiencia de Fábrica.
  4. Cartera: CxC pendiente; clic: antigüedad y proyección de flujo; la pantalla dice si cuadra con Liquidez (cuadra).
  5. Top clientes: venta del año; clic: por Margen neto %, por días de factura a cobro, ventas MDF y Piedra.
  6. Tarjetas numeradas 1–10.
- Criterios aplicados (reversibles) en D22.
- Visto: la Eficiencia de Fábrica sigue en $0.00 por pieza (sin piezas READY ni nómina semanal capturada).
