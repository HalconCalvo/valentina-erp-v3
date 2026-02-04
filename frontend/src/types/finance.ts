export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PaymentMethod = 'TRANSFERENCIA' | 'EFECTIVO' | 'CHEQUE' | 'TARJETA' | 'OTRO';

// --- 1. ESTADÍSTICAS DEL DASHBOARD (Las 3 Tarjetas) ---
// Debe coincidir exactamente con AccountsPayableDashboardStats en Python
export interface AccountsPayableStats {
    // Tarjeta Roja: Vencido + Vence este Viernes
    overdue_amount: number;
    overdue_count: number;
    
    // Tarjeta Naranja: Próximos 15 Días
    next_period_amount: number;
    next_period_count: number;
    
    // Tarjeta Verde: Futuro
    future_amount: number;
    future_count: number;
    
    // Contador: Solicitudes pendientes
    total_pending_approval: number;
}

// --- 2. TABLA DE FACTURAS (Auditoría) ---
// Necesario para el listado de documentos por pagar
export interface PendingInvoice {
    id: number;
    provider_name: string;
    invoice_number: string;
    due_date: string; // Viene como string "YYYY-MM-DD" del backend
    total_amount: number;
    outstanding_balance: number;
}

// --- 3. SOLICITUD DE PAGO (Input) ---
export interface PaymentRequestPayload {
    invoice_id: number;
    amount: number;
    payment_date: string; // ISO String ("YYYY-MM-DD")
    payment_method: PaymentMethod;
    reference?: string;
    notes?: string;
}

// --- 4. LISTADO DE SOLICITUDES (Output) ---
export interface SupplierPayment {
    id: number;
    purchase_invoice_id: number;
    provider_id: number;
    provider_name?: string;
    invoice_folio?: string;
    amount: number;
    payment_date: string;
    payment_method: PaymentMethod;
    reference?: string;
    notes?: string;
    status: PaymentStatus;
    created_at: string;
}