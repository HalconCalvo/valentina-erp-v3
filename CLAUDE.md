# Valentina ERP v3 — Reglas de Arquitectura para Cursor

## ROL DE CURSOR
Cursor es el programador. Claude es el arquitecto.
Cursor construye EXACTAMENTE lo que Claude define.
Cursor NO toma decisiones de arquitectura ni de UX por su cuenta.

---

## CAPA 1 — ESTRUCTURA DEL PROYECTO

### Frontend (React/TypeScript/Vite/Tailwind)
frontend/src/
  components/
    ui/          — Librería V (componentes base reutilizables)
    layout/      — Sidebar, MainLayout
  modules/
    {modulo}/
      pages/     — Páginas completas (rutas)
      components/— Componentes específicos del módulo
      hooks/     — Lógica reutilizable del módulo
      utils/     — Funciones auxiliares del módulo
  api/           — Servicios de API y endpoints
  types/         — Tipos TypeScript globales
  hooks/         — Hooks globales
  utils/         — Funciones auxiliares globales

### Backend (Python/FastAPI/SQLModel)
backend/app/
  api/v1/endpoints/ — Un archivo por dominio
  models/           — Modelos SQLModel
  schemas/          — Schemas de entrada/salida
  core/             — Configuración, BD, seguridad

### Nomenclatura:
- Componentes React: PascalCase (ej. VConfirmDialog.tsx)
- Hooks: camelCase con prefijo use (ej. useProviders.ts)
- Endpoints backend: snake_case (ej. get_purchase_orders)
- Páginas: PascalCase + Page (ej. MaterialsPage.tsx)

---

## CAPA 2 — LIBRERÍA DE COMPONENTES BASE

### REGLA ABSOLUTA:
Cursor NUNCA usa HTML nativo cuando existe un componente V equivalente.

### Componentes existentes — usar tal cual:
- Input          → src/components/ui/Input.tsx
- Modal          → src/components/ui/Modal.tsx
- SearchableSelect → src/components/ui/SearchableSelect.tsx
- Button         → src/components/ui/Button.tsx
- Card           → src/components/ui/Card.tsx
- Badge          → src/components/ui/Badge.tsx

### Componentes V por construir — Claude los define, Cursor los construye:
- VConfirmDialog — reemplaza window.confirm()
- VToast         — reemplaza alert()
- VCurrencyInput — input de moneda MXN
- VStatusBadge   — badge de estado con colores por entidad
- VTable         — tabla con filtros y acciones por rol
- VDatePicker    — selector de fecha con calendario
- VPageHeader    — header de página con título y acciones
- VEmptyState    — estado vacío con mensaje

### Sustituciones obligatorias:
- alert()           → VToast
- window.confirm()  → VConfirmDialog
- input directo     → Input
- select directo    → SearchableSelect
- table manual      → VTable
- input type=date   → VDatePicker

---

## CAPA 3 — PATRONES DE CÓDIGO

### Llamadas al API:
- SIEMPRE usar axiosClient de src/api/axios-client.ts
- NUNCA usar fetch() directo
- SIEMPRE manejar errores con try/catch
- SIEMPRE mostrar estado de carga
- NUNCA permitir doble clic — deshabilitar botón mientras procesa

### Patrón estándar:
const [isLoading, setIsLoading] = useState(false);
const handleAction = async () => {
  setIsLoading(true);
  try {
    await axiosClient.post('/endpoint', payload);
    loadData();
  } catch (error: any) {
    const msg = error.response?.data?.detail || 'Error inesperado';
    // mostrar con VToast, NUNCA con alert()
  } finally {
    setIsLoading(false);
  }
};

### Errores:
- Errores de red    → VToast con mensaje amigable
- Errores 404       → "No encontrado"
- Errores 403       → "Sin permisos"
- NUNCA mostrar stack traces al usuario
- NUNCA console.log en producción

---

## CAPA 4 — REGLAS DE NEGOCIO DE KOLOKA

### La regla de oro:
Todo lo que se crea se puede corregir.
Todo lo que se corrige se puede cancelar.
NADA se elimina fisicamente — siempre cancelar con trazabilidad.

### Roles y acceso:
- DIRECTOR  : acceso total
- MANAGER   : operaciones financieras + autorización de OCs
- ADMIN     : compras, proveedores, pagos (sin ejecutar)
- SALES     : solo cotizaciones y ventas propias
- DESIGN    : solo diseño e ingeniería
- PRODUCTION: producción y solicitudes de compra
- WAREHOUSE : compras y almacén
- LOGISTICS : logística e instalación

### Operaciones financieras:
Solo DIRECTOR, MANAGER y ADMIN pueden crear/editar/cancelar
facturas, pagos, movimientos bancarios y gastos operativos.
SALES y roles operativos NUNCA tocan finanzas.

### Cancelación:
- Siempre usar VConfirmDialog con variant=danger
- Siempre mostrar consecuencias antes de confirmar
- Al cancelar registros con saldos, revertir automáticamente
- Guardar fecha, hora y usuario que canceló

### Estados de entidades:
- Factura cliente  : PENDING → PAID | CANCELLED
- Factura proveedor: PENDING → PAID | CANCELLED
- OC: DRAFT → AUTORIZADA → ENVIADA → RECIBIDA_PARCIAL → RECIBIDA_TOTAL | CANCELADA
- Requisición: PENDIENTE → APLAZADA → PROCESADA | CANCELADA
- OV: DRAFT → ACCEPTED → WAITING_ADVANCE → SOLD → IN_PRODUCTION → FINISHED → COMPLETED | CANCELLED

### Campos de búsqueda:
- NUNCA texto libre para entidades del sistema
- SIEMPRE SearchableSelect con autocomplete
- SIEMPRE buscar por nombre Y código/SKU simultáneamente

### Formularios:
- Campos obligatorios marcados con * y validados antes de enviar
- Fechas: VDatePicker
- Montos: VCurrencyInput
- Al editar, prellenar TODOS los campos con valores actuales

### 4 caminos por flujo (Claude los define antes de construir):
1. Camino feliz
2. Corrección antes de efecto externo
3. Excepción después de efecto externo
4. Cancelación por acuerdo

---

## REGLAS GENERALES

- TypeScript estricto — sin any salvo casos justificados
- Comentarios en inglés
- Sin código comentado — si no se usa, se elimina
- Sin console.log en producción
- Componentes menores a 200 líneas
- NUNCA duplicar lógica — extraer a hook o utilidad
- Toda operación async tiene manejo de errores
- Toda lista tiene VEmptyState
- Toda operación lenta tiene indicador de carga
