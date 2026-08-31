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


---

## COMPONENTES V — EJEMPLOS DE USO OBLIGATORIOS

### VConfirmDialog — SIEMPRE para acciones destructivas
NUNCA: if (!window.confirm('¿Eliminar?')) return;
SIEMPRE:
  const [showConfirm, setShowConfirm] = useState(false);
  <VConfirmDialog
    isOpen={showConfirm}
    title="Cancelar solicitud"
    message="Esta solicitud quedará marcada como cancelada."
    consequence="No podrás reactivarla — deberás crear una nueva."
    variant="danger"
    confirmLabel="Sí, cancelar"
    onConfirm={async () => { await handleCancel(); setShowConfirm(false); }}
    onCancel={() => setShowConfirm(false)}
  />

### VToast — SIEMPRE para feedback al usuario
NUNCA: alert('Guardado correctamente');
NUNCA: alert('Error al guardar');
SIEMPRE:
  import { toast } from '@/components/ui/VToast';
  toast.success('Solicitud cancelada correctamente');
  toast.error('No se pudo cancelar. Intenta de nuevo.');
  toast.warning('Esta OC ya fue enviada al proveedor');

### VTable — SIEMPRE para listas de datos
NUNCA: <table><thead>...</thead><tbody>...</tbody></table>
SIEMPRE:
  import { VTable } from '@/components/ui/VTable';
  <VTable
    columns={[{ key: 'name', label: 'Material', sortable: true }]}
    data={items}
    isLoading={loading}
    emptyState={{ title: 'Sin materiales', description: 'Agrega el primero.' }}
    actions={(row) => [
      { label: 'Editar', icon: <Pencil size={14}/>, onClick: () => edit(row) },
      { label: 'Cancelar', icon: <X size={14}/>, variant: 'danger',
        onClick: () => setConfirmId(row.id),
        hidden: row.status === 'CANCELADA' }
    ]}
  />

### VCurrencyInput — SIEMPRE para montos en MXN
NUNCA: <input type="number" value={price} onChange={...} />
SIEMPRE:
  import { VCurrencyInput } from '@/components/ui/VCurrencyInput';
  <VCurrencyInput
    label="Precio unitario *"
    value={price}
    onChange={setPrice}
    min={0.01}
    error={price <= 0 ? 'El precio debe ser mayor a cero' : undefined}
  />

### VStatusBadge — SIEMPRE para estados de entidades
NUNCA: <span className="bg-green-100 text-green-700">PAGADA</span>
SIEMPRE:
  import { VStatusBadge } from '@/components/ui/VStatusBadge';
  <VStatusBadge status={invoice.status} entity="invoice" />

### VEmptyState — SIEMPRE para listas vacías
NUNCA: {items.length === 0 && <p>No hay elementos</p>}
SIEMPRE:
  import { VEmptyState } from '@/components/ui/VEmptyState';
  {items.length === 0 && (
    <VEmptyState
      icon={<Package size={48}/>}
      title="Sin solicitudes activas"
      description="Crea la primera solicitud de compra."
      action={{ label: 'Nueva solicitud', onClick: () => setShowForm(true) }}
    />
  )}


---

## REGLAS DE BACKEND (Python/FastAPI/SQLModel)

### ARQUITECTURA — 4 CAPAS OBLIGATORIAS

La responsabilidad de cada capa es fija. Cursor NO mezcla responsabilidades.

CAPA 1 — Endpoints (app/api/v1/endpoints/)
  - Solo recibe la petición HTTP
  - Valida autenticación y rol del usuario
  - Llama al Service correspondiente
  - Devuelve la respuesta HTTP
  - NUNCA contiene lógica de negocio
  - NUNCA hace queries a la base de datos directamente
  - Máximo 20 líneas por función de endpoint

CAPA 2 — Services (app/services/)
  - Contiene TODA la lógica de negocio
  - Orquesta múltiples operaciones
  - Maneja transacciones atómicas
  - Llama al Repository para acceso a datos
  - NUNCA conoce detalles de HTTP (no usa Request ni Response)
  - Máximo 50 líneas por función de service

CAPA 3 — Repositories (app/repositories/)
  - ÚNICO punto de acceso a la base de datos
  - Solo hace queries — sin lógica de negocio
  - Retorna modelos o None
  - NUNCA lanza HTTPException — lanza excepciones de dominio
  - Máximo 30 líneas por función de repository

CAPA 4 — Database (PostgreSQL)
  - Solo datos
  - Modelos en app/models/
  - Migraciones en Alembic

### REGLA DE ORO DEL BACKEND:
Todo código nuevo va en services/ o repositories/.
Los endpoints solo llaman y devuelven.
Si Cursor escribe lógica de negocio en un endpoint, está violando la arquitectura.

### ESTRUCTURA DE ARCHIVOS:
app/
  api/v1/endpoints/   — máximo 400 líneas por archivo, máximo 20 líneas por función
  services/           — lógica de negocio, máximo 50 líneas por función
  repositories/       — acceso a datos, máximo 30 líneas por función
  models/             — modelos SQLModel, un archivo por dominio
  schemas/            — Pydantic schemas de entrada y salida
  core/               — configuración, seguridad, dependencias

### IMPORTS:
- SIEMPRE al inicio del archivo — NUNCA dentro de funciones
- Orden: stdlib → third party (fastapi, sqlmodel) → app
- NUNCA importar el mismo módulo dos veces
- Si un import se usa en 3+ archivos, centralizarlo en app/core/deps.py

### VALIDACIÓN CON PYDANTIC:
- Todo input de API debe tener un schema Pydantic en app/schemas/
- La validación ocurre automáticamente antes de ejecutar cualquier lógica
- NUNCA validar manualmente con if/raise dentro del endpoint
- Schemas de entrada: sufijo Create o Update (ej. SalesOrderCreate)
- Schemas de salida: sufijo Read (ej. SalesOrderRead)

### IDEMPOTENCIA EN OPERACIONES CRÍTICAS:
- Crear factura, registrar pago, recepcionar OC — deben ser seguras si
  se ejecutan dos veces (el sistema detecta el duplicado y lo rechaza)
- Usar candados: verificar existencia antes de crear
- Usar índices únicos en BD para campos que no pueden duplicarse

### TRANSACCIONES ATÓMICAS:
- Si una operación afecta múltiples tablas, debe ser TODO O NADA
- Usar try/except alrededor de session.commit()
- Si algo falla: session.rollback() antes de lanzar la excepción
- NUNCA hacer commit parcial en operaciones multi-tabla

### MANEJO DE ERRORES:
- Endpoints: HTTPException con status_code y detail descriptivo
- Services: excepciones de dominio propias (ej. InvoiceAlreadyPaidError)
- Repositories: retornar None si no existe, nunca lanzar excepción
- NUNCA retornar {"error": "..."} — siempre HTTPException
- Códigos: 200 éxito, 201 creado, 400 error de negocio,
           403 sin permisos, 404 no encontrado, 409 conflicto

### LOGGING ESTRUCTURADO (auditoría):
- Toda operación financiera debe registrar: quién, qué, cuándo, cuánto
- Usar app/core/logger.py (a crear en Fase 2)
- Operaciones a auditar: crear/editar/cancelar facturas, pagos,
  movimientos bancarios, cambios de estado de OV y OC
- NUNCA usar print() — siempre el logger estructurado

### QUERIES A BASE DE DATOS:
- NUNCA hacer queries dentro de loops — usar selectinload() o joins
- SIEMPRE usar session.exec(select(...)) — nunca SQL raw salvo casos justificados
- SIEMPRE usar selectinload() para relaciones que se van a usar
- session.add() → session.commit() → session.refresh() en ese orden exacto
- NUNCA session.flush() salvo cuando se necesitan IDs antes del commit

### NOMENCLATURA:
- Endpoints: snake_case descriptivo (get_sales_orders, create_purchase_order)
- Services: snake_case con verbo (process_payment, calculate_order_total)
- Repositories: snake_case con verbo de datos (find_by_id, find_all, save, delete)
- Modelos: PascalCase (SalesOrder, PurchaseInvoice)
- Schemas: PascalCase + sufijo (SalesOrderCreate, SalesOrderRead)
- Variables y parámetros: snake_case
- Constantes: UPPER_SNAKE_CASE

### TAMAÑO DE FUNCIONES:
- Endpoint: máximo 20 líneas
- Service: máximo 50 líneas
- Repository: máximo 30 líneas
- Si una función supera el límite, dividirla en funciones auxiliares privadas
- Funciones auxiliares privadas: prefijo _ (ej. _calculate_tax)

### LO QUE CURSOR NO HACE SIN INSTRUCCIÓN DE CLAUDE:
- NO reorganizar archivos de endpoints (rompe imports del frontend)
- NO cambiar nombres de endpoints existentes (rompe el frontend)
- NO modificar modelos sin considerar migración de Alembic
- NO eliminar campos de modelos existentes
- NO hacer commits sin que Claude haya verificado la migración


---

## ARQUITECTURA BACKEND — SECCIÓN CRÍTICA (leer antes de tocar cualquier archivo Python)

### Las 4 capas del backend de Valentina son OBLIGATORIAS e INAMOVIBLES:

CAPA A — ENDPOINT (app/api/v1/endpoints/{dominio}.py)
  Hace: recibir HTTP, validar rol, llamar al Service, devolver respuesta
  NO hace: lógica de negocio, queries a BD, cálculos
  Tamaño máximo: 20 líneas por función

CAPA B — SERVICE (app/services/{dominio}_service.py)  ← AÚN NO EXISTE, SE CREA EN FASE 2
  Hace: toda la lógica de negocio, orquestar operaciones, manejar transacciones
  NO hace: queries directas a BD, conocer HTTP
  Tamaño máximo: 50 líneas por función

CAPA C — REPOSITORY (app/repositories/{dominio}_repository.py)  ← AÚN NO EXISTE, SE CREA EN FASE 2
  Hace: queries a la BD, retornar modelos o None
  NO hace: lógica de negocio, lanzar HTTPException
  Tamaño máximo: 30 líneas por función

CAPA D — DATABASE (PostgreSQL via SQLModel)
  Hace: persistir datos
  Modelos en: app/models/{dominio}.py

### REGLA QUE CURSOR DEBE REPETIRSE ANTES DE ESCRIBIR CÓDIGO PYTHON:
"¿Este código es lógica de negocio? → Va en services/"
"¿Este código es una query a BD? → Va en repositories/"
"¿Este código es una ruta HTTP? → Va en endpoints/ y llama al service"

### ESTADO ACTUAL DE LA MIGRACIÓN:
- services/ y repositories/ NO existen todavía
- Todo el código está actualmente en endpoints/ (deuda técnica)
- La migración es GRADUAL: todo código NUEVO va en la capa correcta
- El código existente se migra cuando se toca por otra razón

### EJEMPLO CORRECTO:
# endpoints/sales.py
@router.post("/orders")
def create_order(data: SalesOrderCreate, session: Session, user: CurrentUser):
    return sales_service.create_order(session, data, user)  # 3 líneas, delega al service

# services/sales_service.py
def create_order(session, data, user):
    _validate_client_exists(session, data.client_id)
    order = _build_order(data, user)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order

### EJEMPLO INCORRECTO (viola la arquitectura):
# endpoints/sales.py  ← NUNCA así
@router.post("/orders")
def create_order(data, session, user):
    client = session.get(Client, data.client_id)  # query en endpoint
    if not client:
        raise HTTPException(404)
    order = SalesOrder(...)  # construcción en endpoint
    session.add(order)       # commit en endpoint
    session.commit()
    return order
