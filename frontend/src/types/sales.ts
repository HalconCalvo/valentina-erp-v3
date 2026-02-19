// Estatus de la Orden (Espejo del Backend)
export enum SalesOrderStatus {
    // FASE 1: CREACIÓN
    DRAFT = "DRAFT",                 // Borrador (Editable por Ventas)
    
    // FASE 2: AUTORIZACIÓN INTERNA
    SENT = "SENT",                   // En Revisión (Enviada a Gerencia / Bloqueada para Ventas)
    ACCEPTED = "ACCEPTED",           // Autorizada por Gerencia (Lista para enviar al Cliente)
    REJECTED = "REJECTED",           // Rechazada por Gerencia (Vuelve a Ventas para corrección)
    
    // FASE 3: CIERRE CON CLIENTE
    SOLD = "SOLD",                   // ¡VENDIDA! (Cliente aceptó y pagó / Pasa a Producción)
    CLIENT_REJECTED = "CLIENT_REJECTED", // Perdida (Cliente rechazó la propuesta)
    CHANGE_REQUESTED = "CHANGE_REQUESTED", // Cliente solicita cambios (Regresa a ser editable)

    // FASE 4: PRODUCCIÓN (Futuro)
    IN_PRODUCTION = "IN_PRODUCTION", // En Producción
    COMPLETED = "COMPLETED",         // Entregada
    CANCELLED = "CANCELLED"          // Cancelada Administrativamente
}

// Nivel 2: Partida de la Orden
export interface SalesOrderItem {
    id?: number; 
    sales_order_id?: number;
    
    // Identificación
    product_name: string;
    origin_version_id?: number | null; // Null si es venta manual sin receta
    
    // Valores
    quantity: number;
    unit_price: number; // Precio unitario final (con margen y comisiones)
    subtotal_price?: number; 
    
    // Snapshot (Blindaje Financiero - Ingeniería de Costos)
    cost_snapshot?: Record<string, any>; 
    frozen_unit_cost?: number; // Costo directo al momento de cotizar
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
    
    // Lista de Partidas
    items: SalesOrderItem[];
}