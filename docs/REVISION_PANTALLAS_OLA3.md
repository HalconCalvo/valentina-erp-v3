# Tercera ola de la guía de pantallas — revisión (16/10/2026)

Revisión de solo lectura de todas las rutas contra `docs/GUIA_PANTALLAS.md` y la checklist de CLAUDE.md §3.
**Nada cambiado todavía.** Con la lista aprobada por Gabriel se aplica pantalla por pantalla en `pruebas`.

Resumen: 50 pantallas (rutas y subniveles principales). Cumplen: 2 del todo (/director/legacy-import,
/production/in-process) y 6 con una observación menor (/production/ready, /finance/aging, /finance/pending-invoices,
/director/audit, /ov-tracking, hub de /design). **No cumplen: 42.**

Sin hallazgos en todo el código: `alert`, `window.confirm`, `console.*`, `fetch()` directo, `<select>` nativo.
Patrón general a corregir: 32 `Modal size="custom"` en 23 archivos; muchos `<button>`/`<textarea>` nativos; `VTable` sin
`emptyState`/`isLoading`; fechas y montos con `es-MX`/`toFixed`.

## Los 5 problemas más visibles
1. **Compras (Nueva solicitud, Mesa de Control / Freno, Centro de Despacho, tarjetas A–E):** títulos en MAYÚSCULAS
   dentro de paneles `rounded-3xl shadow-xl`, íconos de color, "REGRESAR" en píldora de 10 px, botones dentro del título;
   títulos duplicados al incrustar Andén, Materiales y Proveedores (`RequisitionsModule.tsx:298,307`,
   `PurchaseOrdersModule.tsx:1493–1592`, `InventoryDashboardPage.tsx:221–232, 415–468`).
2. **Andén → recepción de una OC:** sin encabezado estándar; proveedor dos veces en azul y mayúsculas; "Regresar" es un
   círculo solo con ícono a la izquierda; avisos con emoji; botones en mayúsculas (`InventoryReceptionPage.tsx:745–985`).
3. **Gerencia:** título "Administración V4.0"; títulos numerados; subtítulo de todos los niveles = «Use «Regresar» para
   volver al nivel inmediato anterior.»; `h1` sin ícono; "Regresar" nativo; en 5. Nómina el título no cambia al entrar a
   Comisiones / Destajos / Semanal (`ManagementDashboard.tsx:255–291`).
4. **Campo (teléfono), sus 3 pantallas:** estilo propio (paleta gray, botones azul/naranja nativos, "←" o solo ícono a
   la izquierda, vacíos con texto suelto, spinners, fechas `es-MX`) (`FieldHomePage`, `FieldLoadPage`, `FieldInstancePage`).
5. **Catálogos y configuración con el encabezado viejo:** Materiales (además `DataTable` retirado), Clientes, Proveedores,
   Usuarios, Tasas de IVA, Configuración y Ayuda (`h1 text-2xl font-bold`, sin ícono, contenedor `p-6`). Les siguen Piso
   de Producción (contenedor a pantalla completa) y Planeación (sin encabezado).

## Detalle por pantalla
| Pantalla | Qué no cumple |
|---|---|
| /login | spinner en el botón (debe decir "Procesando...") |
| / Inicio | banner de color con `h1` blanco 4xl; fecha y hora `es-MX` |
| /materials | contenedor `p-6`; `h1` viejo sin ícono; "SOLO LECTURA"/"COSTOS OCULTOS" en mayúsculas dentro del título; `DataTable` retirado; 11 botones nativos; moneda `es-MX` |
| /providers | contenedor; encabezado sin ícono; 5 botones nativos; modal custom |
| /clients | contenedor `p-6`; `h1` viejo; 7 botones nativos; modal custom; textarea nativo |
| /tax-rates | contenedor `max-w-4xl`; `h1` viejo con ícono azul; primario azul nativo; formulario en panel en vez de Modal |
| /config | contenedor; `h1` viejo; Guardar nativo `slate-900`; carga en texto; moneda `es-MX`; íconos azules |
| /help | sin contenedor; `h1` pequeño; "Regresar" a la izquierda como texto |
| /users | encabezado dentro de tarjeta; 5 botones nativos (incluye "Nuevo Usuario"); modal custom |
| /design (subvistas Catálogo, Simulador, Déficit, Lotes) | "Regresar" en fila aparte arriba; títulos `h2`; vacíos ad hoc; "En construcción" ad hoc; VTable sin vacío ni carga |
| /design/versions/:id | barra con `h1 xl`; "Regresar" solo ícono a la izquierda; sin contenedor estándar |
| /design/simulator | contenedor sin `p-8`; 4 botones nativos; VTable sin vacío ni carga |
| /design/print-center | tarjeta KPI ad hoc (degradado, 5xl) en vez de VSummaryCard; vacío sin ícono/descripción; emojis en datos y botones; estado "Pendiente de imprimir" a mano; error ad hoc |
| /sales | "Regresar a Tarjetas/al Tablero"; título "La Trinchera Comercial"; prefijos "Detalle:/Archivo:/Gestión:"; 3 VTable sin vacío ni carga |
| /quotations/new, edit | sin subtítulo ("Modo Director Activo" en mayúsculas); 4 botones y 3 textarea nativos; `toFixed`/`toLocaleString` |
| /quotations/:id | estado a mano en vez de VStatusBadge; 2 textarea nativos |
| /inventory (hub y subniveles) | ícono del hub en gris; encabezado de subniveles `h2` sin ícono ni subtítulo con "Regresar" nativo; títulos duplicados; Alertas de stock sin vacío |
| /inventory → 1. Solicitud de compra (Nueva solicitud) | títulos en MAYÚSCULAS; subtítulo en cursiva; "REGRESAR" 10 px; botón de envío a todo el ancho en mayúsculas; panel `rounded-3xl` |
| /inventory → 2. Órdenes de compra (Mesa de Control / Freno, Centro de Despacho…) | ver problema 1; además spinner "Sincronizando Sistema..."; proveedor y SKU en mayúsculas; botones `uppercase`; vacíos ad hoc; 7 modales custom con títulos en mayúsculas; 16 botones nativos; `toFixed` |
| /inventory → E. Todas las OCs | "Regresar" subrayado en mayúsculas; proveedor en mayúsculas; modal custom; 5 botones nativos |
| /inventory/reception (Andén, lista) | sin "Regresar" por ruta directa; lista hecha a mano en vez de VTable; modal de anticipo custom; spinner; botón naranja |
| Andén → recepción de una OC | ver problema 2 |
| /inventory → 4b. Conteo físico | títulos `h3`; 13 botones nativos; 2 VTable sin vacío |
| /inventory/kardex | spinner "Cargando..."; vacío con spinner como ícono; 2 botones nativos |
| /inventory/valuation | ícono naranja; "Editar material" nativo dentro de la columna |
| /treasury → Cuentas por pagar | subnivel `h3` en franja de color con título coloreado; VTable sin vacío |
| /treasury → Cuentas por cobrar | `h3` con subtítulo genérico; "Regresar a Tarjetas/Tareas" |
| /treasury → Gastos operativos | 3 modales custom; 2 textarea |
| /treasury → Caja chica | 13 botones nativos; fechas `es-MX` |
| /finance/cxc-report | contenedor sin `max-w-7xl`; "Regresar a Cobranza"; 2 VTable sin vacío ni carga |
| /finance/supplier-payments, /finance/provider-statement | VTable sin vacío ni carga |
| /director | modal de salud custom con título en mayúsculas; 3 VTable sin vacío |
| /director/sanitation | contenedor `p-6`; `h1` sin ícono; "Regresar" solo ícono a la izquierda |
| /management (hub y niveles, 5. Nómina) | ver problema 3; además "Nueva cuenta" nativa `slate-800`; Nómina: 3 textarea nativos, 2 VTable sin vacío |
| /production (hub) | acceso restringido con emoji; tarjetas "Módulo 1…" con otro estilo |
| /production/kanban (Piso de Producción) | contenedor a pantalla completa con fondo blanco; "👁 Solo Lectura"; búsqueda sin ícono; carga en texto; paleta gray; 2 modales custom; VTable sin vacío |
| /planning | sin encabezado; acceso restringido con emoji; pestañas y aviso nativos; emojis y flechas de texto; spinners; fechas `es-MX`; muchos botones nativos en sus componentes |
| /field | contenedor sin `p-4`; encabezado sin ícono (nombre del usuario + "Valentina Campo" naranja); botón primario azul nativo; spinner; vacío con `<p>`; estados a mano |
| /field/load (Carga del camión) | barra fija propia gray; "←" a la izquierda sin "Regresar"; estados a mano; carga y vacío en texto; emojis; fechas `es-MX`; 5 botones nativos |
| /field/instance/:id | "Regresar" solo ícono a la izquierda; `h1` xl; "no encontrada" con botón naranja; 10 botones nativos; spinner; hora `es-MX` |

Excepciones que se quedan (documentadas en el código): `<input type="file">` de la cámara en Campo; `<table>` de
impresión del conteo físico; cajón lateral de Planeación en iPad.

## Propuesta de orden
1. Componentes base primero (un cambio arregla muchas pantallas): Modal sin `custom`, `VTable` con vacío y carga,
   encabezado de subnivel y "Regresar" de los hubs (Compras, Gerencia, Tesorería, Diseño).
2. Lo que se vio en el ensayo: Compras, Andén, Gerencia / 5. Nómina, Piso de Producción, Centro de impresión, Campo.
3. Catálogos y configuración (encabezado viejo).
4. Planeación (pantalla grande, al final).
