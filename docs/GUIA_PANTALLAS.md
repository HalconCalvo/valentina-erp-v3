# Guía de pantallas — Valentina ERP

> **Aprobada 2026-10-10 (D1).** Títulos sin color según la recomendación de D2 (pendiente de confirmar).
> Se aplica a pantallas existentes en la tarea 4 del ROADMAP (después de la F4); las pantallas nuevas ya la siguen.

Basada en las pantallas que hoy mejor cumplen CLAUDE.md §3 (inventario del 2026-10-10, 47 rutas):
**Valuación de inventario** (`foundations/pages/InventoryValuationPage.tsx`), **Kárdex** (`KardexPage.tsx`),
**Importación legacy** (`director/pages/LegacyImportPage.tsx`), **Proveedores/Clientes** y **Bitácora**
(`director/pages/AuditPage.tsx`). No se inventan estilos: todo lo de abajo ya existe en alguna de ellas.

---

## 1. Estructura de una pantalla

```
┌ Contenedor ──────────────────────────────────────────────┐
│ Encabezado: ícono · Título · subtítulo     [acciones]     │
│ ─────────────────────────────────────────────────────── │
│ Tarjetas resumen (KPI)            (opcional)              │
│ Panel de filtros                  (opcional)              │
│ Tabla (VTable) / contenido                                │
└──────────────────────────────────────────────────────────┘
```

| Elemento | Estándar | Referencia |
|---|---|---|
| Contenedor | `p-8 max-w-7xl mx-auto space-y-6 pb-24 animate-fadeIn` | Valuación, Kárdex |
| Encabezado | contenedor `flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4`; ícono lucide 32 px `text-indigo-600`; `h1 text-3xl font-black text-slate-800 tracking-tight`; subtítulo `p text-slate-500 mt-1 font-medium` | Valuación |
| Regresar | `Button variant="outline"` con `ArrowLeft` y texto "Regresar", a la derecha del encabezado | Valuación |
| Títulos de sección | `h2 text-sm font-black uppercase tracking-wider text-slate-500` | Detalle de cotización |
| Pantallas de campo (iPad/teléfono) | contenedor `max-w-lg mx-auto p-4`; mismo encabezado en `text-2xl` | Campo |

Los títulos no llevan color por módulo (nada de `text-indigo-800`, `text-emerald-800` en el `h1`).

## 2. Tarjetas resumen (KPI)
- Fila `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`.
- Tarjeta: `rounded-xl border p-4`, tono `border-X-200 bg-X-50 text-X-900`; etiqueta `text-[10px] font-black
  uppercase tracking-wider`, valor `text-2xl font-black`. Total general: `bg-slate-800 text-white`.
- Tonos con significado fijo: **slate** neutro, **emerald** a favor/cobrado, **amber** pendiente/atención,
  **rose** en contra/vencido, **indigo** informativo.
- Se extrae el `SummaryCard` de Valuación a `components/ui/VSummaryCard.tsx`.

## 3. Panel de filtros
- `rounded-2xl border border-slate-200 bg-white p-6 grid gap-4 md:grid-cols-3` (Kárdex).
- Etiqueta `text-[10px] font-black uppercase tracking-wider text-slate-500`.
- Entidades: `SearchableSelect`; fechas: `Input type="date"`; búsqueda libre: `Input` con ícono `Search` dentro.
- Los filtros se aplican al cambiar (sin botón "Buscar") salvo en reportes pesados.

## 4. Tablas
- Siempre `VTable` con `emptyState` (`VEmptyState`: ícono, título, descripción) e `isLoading` (esqueleto).
  `DataTable` (TanStack) queda retirado; hoy solo lo usa Materiales.
- Columnas de dinero alineadas a la derecha, `tabular-nums`; la cabecera dice "con IVA" o "sin IVA".
- **Acciones de renglón:**
  - Universales (ver, editar, PDF, historial): solo ícono de `lib/tableActionIcons` con `title` obligatorio
    (VTable usa `title` como tooltip y aria-label; sin `title` ni `label` el ícono queda mudo).
  - De flujo o irreversibles (autorizar, aplicar, generar OV, cancelar): botón con texto.
- Estado: `VStatusBadge` (no `Badge` suelto ni clases a mano).

## 5. Botones
| Tipo | Estilo |
|---|---|
| Primario | `bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg px-4 py-2` |
| Crear / recibir / cobrar / pagar | `bg-emerald-600 hover:bg-emerald-700` (mismo tamaño) |
| Secundario | `Button variant="outline"` |
| Peligro | solo dentro de `VConfirmDialog variant="danger"` |
- Una sola acción primaria por pantalla o modal. Mientras procesa: deshabilitado y texto "Guardando..." /
  "Procesando..." (sin spinners).
- Se corrige `Button` para que su variante `default` sea el primario indigo (hoy es casi negro y cada pantalla
  lo repinta); después se reemplazan los `<button>` nativos por `Button` conforme se toque cada pantalla.

## 6. Modales
- Siempre `Modal` (tamaños `sm`/`md`/`lg`/`xl`/`fullscreen`); nunca `div fixed inset-0`.
- Pie: secundario a la izquierda, primario a la derecha. Confirmaciones con `VConfirmDialog` con consecuencias.
- Máximo un nivel de modal sobre otro (Rayos X hoy anida hasta 9; se divide al rediseñarlo).

## 7. Formatos (un solo módulo `utils/format.ts`)
| Dato | Función | Ejemplo |
|---|---|---|
| Moneda | `formatMoney(n)` = `Intl.NumberFormat('en-US', {style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2})` | `$1,234.56`, `-$60.00` |
| Cantidad | `formatQty(n)` hasta 4 decimales | `12.5` |
| Porcentaje | `formatPercent` (de `margins.ts`) | `25.00%` |
| Fecha | `formatDate(d)` DD/MM/AAAA hora Mérida | `30/09/2026` |
| Fecha y hora | `formatDateTime(d)` | `30/09/2026 23:59` |
Se reemplazan las ~25 copias locales (`formatCurrency` es-MX, `toFixed`, `toLocaleString`) conforme se toque
cada pantalla.

## 8. Carga y estados vacíos
- Tabla: `isLoading` de VTable. Página completa: esqueleto `animate-pulse` del mismo tamaño que el contenido.
- Lista vacía: `VEmptyState` con ícono y, si aplica, acción ("Nueva cotización").

## 9. Pantallas "hub"
Ventas, Dirección, Gerencia, Tesorería, Inventario, Producción y Logística muestran tarjetas de sección. Se
mantiene: tarjeta `Card` con ícono, título y conteo; al entrar, el título cambia y aparece "Regresar".
Cuenta para la regla de 3 clics: menú → tarjeta → acción.

## 10. Orden para aplicarla (después de aprobada)
1. Base común: `utils/format.ts`, `VSummaryCard`, variante primaria de `Button`, `title` en acciones de
   Usuarios y Tasas de IVA.
2. Ventas, Inventario y Compras (ROADMAP tarea 4); peores primero: Órdenes de compra (7 modales a mano),
   Rayos X, Revisión financiera, Recepción.
3. Resto de módulos conforme se toquen.
