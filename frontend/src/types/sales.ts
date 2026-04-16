// Estatus de la Orden (Espejo del Backend)
export enum SalesOrderStatus {
    // FASE 1: CREACIÓN
    DRAFT = "DRAFT",                 // Borrador (Editable por Ventas)
    
    // FASE 2: AUTORIZACIÓN INTERNA
    SENT = "SENT",                   // En Revisión (Enviada a Gerencia / Bloqueada para Ventas)
    ACCEPTED = "ACCEPTED",           // Autorizada por Gerencia (Lista para enviar al Cliente)
    REJECTED = "REJECTED",           // Rechazada por Gerencia (Vuelve a Ventas para corrección)
    
    // FASE 3: CIERRE CON CLIENTE Y COBRANZA
    WAITING_ADVANCE = "WAITING_ADVANCE", // <--- NUEVO ESTATUS: Esperando pago de anticipo
    SOLD = "SOLD",                   // ¡VENDIDA! (Cliente aceptó y pagó / Pasa a Producción)
    CLIENT_REJECTED = "CLIENT_REJECTED", // Perdida (Cliente rechazó la propuesta)
    CHANGE_REQUESTED = "CHANGE_REQUESTED", // Cliente solicita cambios (Regresa a ser editable)

    // FASE 4: PRODUCCIÓN (Futuro)
    IN_PRODUCTION = "IN_PRODUCTION", // En Producción
    FINISHED = "FINISHED",           // <--- NUEVO: Entregada y Pagada (Cierre Operativo)
    COMPLETED = "COMPLETED",         // Entregada
    CANCELLED = "CANCELLED"          // Cancelada Administrativamente
}

// Nivel 2: Partida de la Orden
export interface SalesOrderItem {
    id?: number; 
    sales_order_id?: number;
    
    // Identificación
    product_name: string;
    origin_version_id?: number | null; 
    
    // Valores
    quantity: number;
    unit_price: number; 
    subtotal_price?: number; 
    
    // Snapshot
    cost_snapshot?: Record<string, any>; 
    frozen_unit_cost?: number; 

    // ---> NUEVO: Para el Monitor Post-Venta <---
    instances?: any[]; 
}

// Nivel 1: Cabecera de la Orden
export interface SalesOrder {
    id?: number;
    
    // Relaciones
    client_id: number;
    tax_rate_id: number;
    user_id?: number; // <-- Agregado para consistencia con Backend
    
    // Datos Generales
    project_name: string;
    status: SalesOrderStatus;
    created_at?: string;
    valid_until: string;      // ISO Date
    delivery_date?: string | null;   // ISO Date
    
    // Reglas de Negocio & Financieras
    applied_margin_percent: number;      // Margen Global o Ponderado
    applied_tolerance_percent: number;
    applied_commission_percent?: number; // Tasa de comisión (ej: 0.05)
    
    // --- NUEVOS CAMPOS V3.5: REGLAS DE ANTICIPO ---
    advance_percent?: number;
    has_advance_invoice?: boolean;
    
    // Totales (Calculados por Backend)
    subtotal?: number;
    tax_amount?: number;
    total_price?: number;
    
    // --- CAMPO NUEVO: IMPORTE REAL ---
    commission_amount?: number; // El dinero exacto de la comisión
    
    // Extras
    currency: string;
    notes?: string;
    conditions?: string;      
    external_invoice_ref?: string;
    is_warranty: boolean;

    /** V5 — Folio de OC del cliente (captura obligatoria al aceptar → WAITING_ADVANCE) */
    client_po_folio?: string | null;
    /** V5 — Fecha de OC del cliente (ISO) */
    client_po_date?: string | null;
    
    // Lista de Partidas
    items: SalesOrderItem[];
}

    // --- NUEVOS MOLDES PARA EL MOTOR HÍBRIDO ---

export type PaymentType = "ADVANCE" | "PROGRESS" | "SETTLEMENT";

// El historial de pagos (Ahora Cuentas por Cobrar - CXC)
export interface CustomerPayment {
    id: number;
    sales_order_id: number;
    payment_type: PaymentType;
    invoice_folio: string | null;
    
    // ---> LO NUEVO <---
    status: "PENDING" | "PAID" | "CANCELLED";
    invoice_date: string;
    
    amount: number;
    amortized_advance: number;
    payment_date: string | null; // Ahora puede ser nulo si no han pagado
    created_at: string;
    /** Legacy UI; verdad de nómina en SalesCommission.is_paid */
    commission_paid?: boolean;
}

// El paquete (payload) que React le enviará a FastAPI
export interface PaymentPayload {
    invoice_folio: string | null;
    amount: number;
    amortized_advance: number;
    instance_ids: number[];
}

export interface PayrollCommissionRow {
  kind: string;
  id: number | null;
  sales_order_id: number;
  project_name: string | null;
  seller_name: string | null;
  amount: number;
  days_waiting: number;
  reference_label: string;
  customer_payment_id: number | null;
  cxc_status: string | null;
  admin_notes: string | null;
  payroll_deferred: boolean;
}

export interface CommissionsPayrollOverview {
  retained_total: number;
  payable_total: number;
  paid_total: number;
  retained: PayrollCommissionRow[];
  payable: PayrollCommissionRow[];
  paid: PayrollCommissionRow[];
}

// Registro de comisión desde la tabla SalesCommission (verdad única)
export interface SalesCommissionRecord {
    id: number;
    customer_payment_id: number;
    user_id: number;
    user_name: string | null;
    user_role: string | null;
    commission_type: 'SELLER' | 'DIRECTOR_GLOBAL';
    base_amount: number;
    rate: number;
    commission_amount: number;
    is_paid: boolean;
    created_at: string;
    sales_order_id: number | null;
    project_name: string | null;
    payment_amount: number | null;
}

// Instancias 🟢🟢 CERRADAS pendientes de Factura de Avance
export interface PendingProgressInstance {
    instance_id: number;
    custom_name: string;
    production_status: string;
    /** Valor contable de la pieza (partida / cantidad) — suma = bucket avances Tarjeta B. */
    line_amount: number;
    signed_received_at: string | null;
    order_id: number | null;
    order_folio: string;
    project_name: string | null;
    client_name: string;
    item_product_name: string | null;
}

/** Respuesta GET /sales/invoicing-rights — derecho a facturación (Tarjeta B). */
export interface InvoicingRightAdvanceRow {
    order_id: number;
    project_name: string | null;
    client_name: string;
    advance_percent: number;
    total_price: number;
    advance_amount: number;
}

export interface InvoicingRightProgressRow extends PendingProgressInstance {}

export interface InvoicingRightsRead {
    advance_pending_total: number;
    progress_work_total: number;
    total_pending_invoice: number;
    advances: InvoicingRightAdvanceRow[];
    progress_instances: InvoicingRightProgressRow[];
}