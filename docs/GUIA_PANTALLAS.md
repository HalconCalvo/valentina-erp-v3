# Guía de pantallas — Valentina ERP

> **Versión 2, 16/10/2026 (D42). §14 decidido por Gabriel 17/10 20:35:** (a) Antigüedad igual a Cobranza; (b) reportes a
> ancho completo, formularios `max-w-7xl`. Piloto en 4 pantallas (19/10, docs/piloto_ola3/); las 42 restantes esperan
> su aprobación.
> La versión 1 (aprobada 10/10, D1) tomaba como modelo Valuación, Kárdex e Importación legacy. Gabriel vio
> /director/legacy-import y no le gustó; las que sí le gustan son **Cobranza** (`/finance/cxc-report`,
> `modules/finance/pages/CxcReportPage.tsx`) y **Antigüedad de saldos** (`/finance/aging`,
> `modules/finance/components/AccountsReceivableAgingPanel.tsx`). **Lo que Gabriel aprobó es lo que ve:** todo lo de
> abajo está copiado de esas dos pantallas, con clases exactas. Donde las dos difieren, manda **Cobranza**: de ella
> le gustan los colores, la ubicación de los botones, la claridad y el orden de la información, y el tamaño de letra.

---

## 1. Estructura de una pantalla (orden de la información)

```
┌ Contenedor ─────────────────────────────────────────────────────────────┐
│ [ícono] Título                          Cargando…  [Actualizar] [Regresar a …] │
│ Subtítulo de una línea                                                    │
│ ──────────────────────────────────────────────────────────────────────── │
│ [Tarjeta] [Tarjeta] [Tarjeta] [Tarjeta]      ← cifras clave (opcional)    │
│ ┌ Filtros ─────────────────────────────────────────────────────────────┐ │
│ │ CLIENTE      TIPO        DESDE       HASTA                            │ │
│ │ ☐ Incluir pagadas   ☐ Ver solo canceladas                             │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ ┌ Tabla ───────────────────────────────────────────────────────────────┐ │
│ │ Folio  Emisión  Proyecto …                  Monto   Saldo   [Acción]  │ │
│ │ CLIENTE A                                           Debe: $379,706.00 │ │
│ │ 560    12/07/2026 …                       $379,706.00 …      [Cobrar] │ │
│ │ TOTALES (22 facturas)                         $…      $…       $…     │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```
Orden fijo: **qué pantalla es → cuánto suma → cómo filtro → el detalle agrupado → el total**. Los botones de la
pantalla van arriba a la derecha; el botón de cada renglón va en la última columna.

## 2. Contenedor y encabezado
| Elemento | Clases exactas (Cobranza) |
|---|---|
| Contenedor | `p-8 w-full pb-24 space-y-6 animate-fadeIn` (ancho completo: las tablas de muchas columnas lo necesitan). Pantallas de formulario o de poca información: `p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn` (Antigüedad). |
| Fila del encabezado | `flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4` |
| Título `h1` | `text-3xl font-black tracking-tight flex items-center gap-3 text-slate-800`, con el ícono **dentro** del `h1`: ícono lucide `size={32}` `className="text-indigo-600"` |
| Subtítulo | `p` `text-slate-500 mt-1 font-medium`, **una sola línea** que dice qué muestra la pantalla. Las explicaciones largas van en la ayuda "?". |
| Lado derecho | `flex items-center gap-3`, en este orden: aviso de carga, **Actualizar**, **Regresar a …** |
| Aviso de carga | `span text-xs text-slate-400 font-bold animate-pulse` "Cargando..." (solo mientras carga) |
| Actualizar | `Button variant="outline"` con `<RefreshCw size={16} />` y texto "Actualizar"; mientras carga, "Procesando..." y deshabilitado |
| Regresar | `Button variant="outline"` con `<ArrowLeft size={16} />` y texto **"Regresar a <pantalla de origen>"** (p. ej. "Regresar a Cobranza"). Siempre a la derecha. |
| Pantallas de campo (teléfono) | contenedor `max-w-lg mx-auto p-4`; mismo encabezado con `h1 text-2xl` |

Títulos sin color por módulo y sin números ("5. Nómina" → "Nómina"); sin mayúsculas sostenidas.

## 3. Tarjetas de cifras clave
- Fila: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`.
- Tarjeta: `bg-white border border-slate-200 rounded-xl p-4 shadow-sm` (blanca; **el color va solo en la cifra**,
  nunca en el fondo ni en el borde).
- Etiqueta: `p text-[11px] font-bold uppercase tracking-wide text-slate-500`.
- Cifra: `p text-2xl font-black tabular-nums mt-1` + color de la tabla de colores (§8).
- Ejemplo (Cobranza): "CxC vivas" 22 en `text-indigo-700`, "Total facturado" en `text-slate-800`, "Abonos + ant.
  aplic." en `text-emerald-700`, "Facturado sin cobrar" en `text-amber-700`.
- Si la pantalla solo tiene un total, va como **total en la barra de la tabla** (Antigüedad, §5).
- Reemplaza a las tarjetas teñidas de la versión 1 (`bg-X-50 border-X-200`, como las de Importación legacy).

## 4. Filtros
- Tarjeta propia entre las cifras y la tabla: `bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4`.
- Rejilla: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`.
- Etiqueta: `label block text-xs font-bold text-slate-500 uppercase mb-1`.
- Controles: entidades con `SearchableSelect` (placeholder "Todos los clientes" / "Todos"); fechas con
  `Input type="date"` ("Desde", "Hasta").
- Casillas en una fila aparte: `flex flex-wrap gap-6 pt-1 border-t border-slate-100`; cada una
  `label flex items-center gap-2 text-sm text-slate-700 cursor-pointer` con `Input type="checkbox" className="h-4 w-4 rounded border-slate-300"`.
- Los filtros se aplican al cambiar (sin botón "Buscar").
- Pantalla con una sola búsqueda (Antigüedad): va en la barra de la tabla, a la derecha: `relative w-full md:w-96`,
  ícono `<Search size={18} className="text-slate-400" />` dentro (`absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none`),
  `Input className="pl-10 text-sm font-medium shadow-sm"` con placeholder "Buscar cliente, proyecto o factura...".

## 5. Tabla
| Elemento | Clases exactas (Cobranza) |
|---|---|
| Tarjeta | `bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm` |
| Área con scroll | `overflow-auto max-h-[75vh]`; encabezado de columnas fijo arriba |
| Encabezado de columnas | `text-sm font-bold text-slate-600 bg-slate-50 border-b border-slate-200`, celdas `p-3`; texto normal (no mayúsculas) |
| Renglón agrupador (cliente, OV…) | `bg-indigo-50 border-y border-indigo-100 px-3 py-3 flex justify-between items-center`, fijo bajo el encabezado; nombre `font-black text-indigo-900`; subtotal a la derecha `font-black text-indigo-800 tabular-nums` ("Debe: $85,574.59") |
| Cuerpo | `text-sm` (VTable: celda `px-4 py-3 align-middle text-slate-700`, renglón `hover:bg-slate-50`, separador `divide-slate-100`) |
| Folio / referencia | `Button variant="link" className="h-auto p-0 font-semibold text-indigo-600 hover:text-indigo-800"`; abre el detalle (Rayos X) |
| Fechas | `text-slate-600`, `formatDate` |
| Texto largo (proyecto) | `text-slate-700 max-w-[180px] truncate block` |
| Claves (OV) | `font-mono text-xs text-slate-600` ("OV-0055") |
| Dinero | `block text-right tabular-nums`, `formatMoney`; el saldo `font-bold text-slate-800`; lo cobrado o abonado `text-emerald-700`; descuentos y notas de crédito `text-xs font-bold text-red-600` |
| Sin dato | `text-slate-300 text-xs` "—" |
| Antigüedad | `block text-right tabular-nums font-bold`, "95d"; `text-amber-600` si pasa de 30 días, si no `text-slate-500`. En pantallas de vencimientos (Antigüedad) se usa la etiqueta de §6. |
| Fila de totales | `flex w-full text-sm bg-slate-100 border-t-2 border-slate-300 font-black`; etiqueta `p-3 text-slate-700 uppercase text-xs tracking-wide` "Totales (22 facturas)"; cifras `p-3 text-right tabular-nums` con el color de su columna (abonado `text-emerald-800`, saldo `text-amber-800`) |
| Vacío / carga | `VTable` con `emptyState` ("No hay facturas con los filtros seleccionados.") e `isLoading` (esqueleto) |
| Total en barra (variante Antigüedad) | barra `p-4 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4`; total en `bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm`, etiqueta `text-xs font-bold text-slate-500 uppercase tracking-wider` "Total en pantalla:", cifra `font-black text-slate-900 text-xl tabular-nums` |
- Columnas ordenables (Antigüedad): clic en el título; flecha `ArrowUpDown size={16}` gris, activa en indigo.
- Se implementa dentro de `VTable` (encabezado `text-sm` normal, agrupador y totales como opciones), no con un
  encabezado hecho aparte: en las dos pantallas modelo el encabezado de flex puede desalinearse de las columnas.

## 6. Etiquetas de estado
- `inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border` + tono `bg-X-50 text-X-700 border-X-200`
  (`VStatusBadge` debe verse así).
- Tipo de documento (Antigüedad): "Anticipo · 237" en naranja, "Avance · 413" en azul.
- Vencido (Antigüedad): `text-xs px-2 py-1` mismo estilo; "Sí" rojo con `AlertTriangle size={14}` (más de 30 días),
  "En riesgo" ámbar (más de 15), "No" verde.

## 7. Botones
| Dónde | Cuál | Estilo |
|---|---|---|
| Encabezado, a la derecha | Actualizar, Regresar a … (y otras acciones de toda la pantalla, como Exportar) | `Button variant="outline"`, ícono 16 + texto |
| Última columna de cada renglón | La acción de flujo de ese renglón ("Cobrar", "Pagar", "Abrir / Pagar") | `Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"`, solo texto (verbo) |
| Renglón, sin permiso | — | no se muestra el botón; `text-xs text-slate-400` "—" |
| Formularios y modales | Guardar / Crear / Confirmar | `Button` primario (`bg-indigo-600 hover:bg-indigo-700 font-bold`); pagar o cobrar en verde |
| Peligro | Cancelar algo | solo dentro de `VConfirmDialog variant="danger"` |
- Ver, editar, PDF e historial siguen como ícono con `title` (lib/tableActionIcons).
- Mientras procesa: deshabilitado y "Procesando..." (sin spinners).
- Botones con texto normal (sin mayúsculas sostenidas), siempre con el componente `Button`.

## 8. Colores (significado fijo)
| Color | Uso | Clases |
|---|---|---|
| Gris pizarra | texto, totales neutros, bordes | `text-slate-800` cifras, `text-slate-600/500` secundarios, `border-slate-200` |
| Índigo | lo que se puede abrir (ícono, folio, agrupador, conteos) | `text-indigo-600` ícono y enlaces, `bg-indigo-50` agrupador, `text-indigo-700` conteos |
| Verde esmeralda | dinero a favor, cobrado, abonado; botón de cobrar/pagar | `text-emerald-700`, `bg-emerald-600` |
| Ámbar | pendiente, por cobrar, antigüedad alta | `text-amber-700` / `text-amber-600` |
| Rojo | en contra, vencido, notas de crédito | `text-red-600`, etiqueta `bg-red-50 text-red-700 border-red-200` |
El fondo de tarjetas y tablas es blanco; el color va en la cifra o en la etiqueta, no en el bloque.

## 9. Tamaños de letra
| Elemento | Tamaño |
|---|---|
| Título | `text-3xl font-black` |
| Subtítulo | base (16 px) `font-medium` |
| Cifra de tarjeta | `text-2xl font-black` |
| Etiqueta de tarjeta | `text-[11px] font-bold uppercase` |
| Etiqueta de filtro / fila de totales | `text-xs font-bold uppercase` |
| Encabezado de columnas, cuerpo de la tabla, casillas, botones | `text-sm` |
| Claves, montos secundarios | `text-xs` |
| Etiquetas de estado, folios de NC | `text-[10px] font-bold` |

## 10. Modales
- Siempre `Modal` (tamaños `sm`/`md`/`lg`/`xl`/`fullscreen`); nunca `div fixed inset-0` ni `size="custom"`.
- Pie: secundario a la izquierda, primario a la derecha. Confirmaciones con `VConfirmDialog` con consecuencias.
- Máximo un nivel de modal sobre otro.

## 11. Formatos (`utils/format.ts`)
| Dato | Función | Ejemplo |
|---|---|---|
| Moneda | `formatMoney(n)` (`en-US`, 2 decimales) | `$1,234.56`, `-$60.00` |
| Cantidad | `formatQty(n)` hasta 4 decimales | `12.5` |
| Porcentaje | `formatPercent` (`margins.ts`) | `25.00%` |
| Fecha | `formatDate(d)` DD/MM/AAAA hora Mérida | `30/09/2026` |
| Fecha y hora | `formatDateTime(d)` | `30/09/2026 23:59` |
Los montos dicen si son con o sin IVA (en la etiqueta de la tarjeta o de la columna).

## 12. Pantallas "hub"
Ventas, Dirección, Gerencia, Tesorería, Inventario, Producción y Logística muestran tarjetas de sección. Al entrar a
una sección, el título cambia al de la sección (sin número) y aparece "Regresar a <hub>" a la derecha, igual que §2.
Cuenta para la regla de 3 clics: menú → tarjeta → acción.

## 13. Qué cambió respecto a la versión 1
- Modelo: Cobranza y Antigüedad (antes Valuación, Kárdex e Importación legacy).
- Contenedor de ancho completo en reportes (antes siempre `max-w-7xl`).
- Ícono dentro del título; subtítulo de una línea; "Regresar a <origen>" con Actualizar a su lado.
- Tarjetas blancas con la cifra en color (antes tarjetas teñidas con `VSummaryCard`).
- Filtros en tarjeta `rounded-xl p-4 shadow-sm` (antes `rounded-2xl p-6 md:grid-cols-3`).
- Encabezado de columnas `text-sm` normal (antes `text-xs` en mayúsculas); agrupador índigo con subtotal; fila de
  totales; dinero con `tabular-nums` a la derecha.
- Acción de renglón en botón verde `size="sm"` en la última columna.
- Títulos de sección en mayúsculas entre tablas apiladas (como Importación legacy) ya no son modelo.

## 14. Para que Gabriel decida
- Antigüedad pinta de verde el borde de la tabla y su barra (`border-emerald-200 shadow-md`, `bg-emerald-50/50`, total
  en `text-emerald-900`). Con la regla de Cobranza (el color solo en las cifras) quedaría blanca y gris, como arriba en §5.
  ¿Se queda verde Antigüedad o se iguala a Cobranza?
- Contenedor: Cobranza usa ancho completo y Antigüedad `max-w-7xl`. La guía propone ancho completo en reportes y
  `max-w-7xl` en formularios.
