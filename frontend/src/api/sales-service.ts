import axiosClient from './axios-client';
import { API_ROUTES } from './endpoints';
import {
  SalesOrder,
  SalesOrderStatus,
  PaymentPayload,
  PendingProgressInstance,
  InvoicingRightsRead,
  SalesCommissionRecord,
  CommissionsPayrollOverview,
  CustomerPayment,
  PaymentType,
} from '../types/sales';

function pickArrayPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
        const o = payload as Record<string, unknown>;
        if (Array.isArray(o.items)) return o.items;
        if (Array.isArray(o.data)) return o.data;
        if (Array.isArray(o.payments)) return o.payments;
    }
    return [];
}

/** Acepta filas sueltas del API (snake_case / camelCase) → CustomerPayment PENDING */
function normalizeToCustomerPayment(row: unknown): CustomerPayment | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    const id = Number(r.id);
    const sales_order_id = Number(r.sales_order_id ?? r.order_id ?? r.salesOrderId);
    if (!Number.isFinite(id) || !Number.isFinite(sales_order_id)) return null;
    const status = String(r.status ?? 'PENDING').toUpperCase();
    if (status !== 'PENDING') return null;
    const rawPt = String(r.payment_type ?? r.paymentType ?? 'PROGRESS').toUpperCase();
    const safePt: PaymentType = ['ADVANCE', 'PROGRESS', 'SETTLEMENT'].includes(rawPt) ? (rawPt as PaymentType) : 'PROGRESS';
    return {
        id,
        sales_order_id,
        payment_type: safePt,
        invoice_folio: (r.invoice_folio as string) ?? (r.invoiceFolio as string) ?? null,
        status: 'PENDING',
        invoice_date: String(r.invoice_date ?? r.invoiceDate ?? r.created_at ?? new Date().toISOString()),
        amount: Number(r.amount) || 0,
        amortized_advance: Number(r.amortized_advance ?? r.amortizedAdvance) || 0,
        payment_date: (r.payment_date as string) ?? (r.paymentDate as string) ?? null,
        created_at: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
        commission_paid: r.commission_paid === true,
    };
}

export const salesService = {
    /**
     * Crea una nueva Cotización/Orden.
     * El Backend se encarga de generar el Snapshot de costos automáticamente.
     */
    createOrder: async (order: Omit<SalesOrder, 'id' | 'status' | 'created_at' | 'subtotal' | 'tax_amount' | 'total_price'>): Promise<SalesOrder> => {
        const response = await axiosClient.post(API_ROUTES.SALES.ORDERS, order);
        return response.data;
    },

    /**
     * Obtiene el listado de órdenes.
     * @param status (Opcional) Filtrar por estatus (DRAFT, SENT, etc.)
     * @param clientId (Opcional) Filtrar por cliente
     */
    getOrders: async (status?: SalesOrderStatus, clientId?: number): Promise<SalesOrder[]> => {
        const params: any = {};
        if (status) params.status = status;
        if (clientId) params.client_id = clientId;

        const response = await axiosClient.get(API_ROUTES.SALES.ORDERS, { params });
        return response.data;
    },

    /**
     * Obtiene el detalle completo de una orden específica (incluyendo items y totales).
     */
    getOrderDetail: async (orderId: number): Promise<SalesOrder> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId);
        const response = await axiosClient.get(url);
        return response.data;
    },

    /**
     * Actualiza una orden.
     * IMPORTANTE: Si se envía el campo 'items', el backend borrará los items anteriores
     * y creará los nuevos (Edición Completa).
     */
    updateOrder: async (orderId: number, data: Partial<SalesOrder>): Promise<SalesOrder> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId); 
        const response = await axiosClient.patch(url, data);
        return response.data;
    },

    /**
     * Elimina una orden de la base de datos.
     */
    deleteOrder: async (orderId: number): Promise<void> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId);
        await axiosClient.delete(url);
    },

    /**
     * Descarga el PDF de la Cotización desde el Backend (Fuerza la descarga del archivo).
     */
    downloadPDF: async (orderId: number, fileName: string = 'Cotizacion.pdf') => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/pdf`;
        
        try {
            const response = await axiosClient.get(url, {
                responseType: 'blob',
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            link.href = downloadUrl;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            
            link.click();
            
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error("Error descargando PDF:", error);
            throw error;
        }
    },

    /**
     * Obtiene el BLOB del PDF para previsualización (NO descarga, solo retorna los datos).
     */
    getPdfPreview: async (orderId: number): Promise<Blob> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/pdf`;
        const response = await axiosClient.get(url, {
            responseType: 'blob',
        });
        return response.data; 
    },

    // =========================================================
    // --- FASE 1: AUTORIZACIÓN INTERNA (GERENCIA) ---
    // =========================================================

    /**
     * VENDEDOR: Solicita autorización (Cambia DRAFT -> SENT)
     */
    requestAuth: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/request-auth`;
        await axiosClient.post(url);
    },

    /**
     * DIRECTOR: Autoriza la cotización (Cambia SENT -> ACCEPTED)
     */
    authorizeOrder: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/authorize`;
        await axiosClient.post(url);
    },

    /**
     * DIRECTOR: Rechaza la cotización (Cambia SENT -> REJECTED)
     */
    rejectOrder: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/reject`;
        await axiosClient.post(url);
    },

    // =========================================================
    // --- FASE 2: CIERRE CON CLIENTE Y COBRANZA ---
    // =========================================================

    /**
     * El cliente acepta la cotización → OC obligatoria → WAITING_ADVANCE (V5).
     */
    requestAdvance: async (
        orderId: number,
        payload: { client_po_folio: string; client_po_date: string }
    ): Promise<SalesOrder> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/mark_waiting_advance`;
        const response = await axiosClient.post(url, payload);
        return response.data;
    },

    /**
     * VENTA PERDIDA: El cliente rechazó la propuesta (ACCEPTED -> CLIENT_REJECTED)
     */
    markAsLost: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/mark_lost`;
        await axiosClient.post(url);
    },

    /**
     * SOLICITAR CAMBIOS: El cliente pide ajustes (ACCEPTED -> CHANGE_REQUESTED/DRAFT)
     */
    requestChanges: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/request_changes`;
        await axiosClient.post(url);
    },

    // =========================================================
    // --- NUEVO MOTOR HÍBRIDO DE COBRANZA (V3.5) ---
    // =========================================================

    /**
     * ADMINISTRACIÓN: Registra el Anticipo (La bolsa inicial)
     * (WAITING_ADVANCE -> SOLD)
     */
    registerAdvancePayment: async (orderId: number, payload: PaymentPayload) => {
        // Usamos el mismo endpoint pero ahora le enviamos el payload con la factura y el importe
        const response = await axiosClient.post(`/sales/orders/${orderId}/mark_sold`, payload);
        return response.data;
    },

    /**
     * ADMINISTRACIÓN: Registra un Avance/Estimación (Cobro por Instancias)
     */
    registerProgressPayment: async (orderId: number, payload: PaymentPayload) => {
        const response = await axiosClient.post(`/sales/orders/${orderId}/register_progress`, payload);
        return response.data;
    },

    // ---> NUEVA FUNCIÓN: LA CONCILIACIÓN BANCARIA <---
    confirmCXCPayment: async (orderId: number, cxcId: number) => {
        const response = await axiosClient.post(`/sales/orders/${orderId}/confirm_payment/${cxcId}`);
        return response.data;
    },

    /**
     * ADMINISTRACIÓN: Obtiene todas las instancias 🟢🟢 CERRADAS sin factura de avance.
     * Alimenta la bandeja "Avances por Facturar" en PendingToInvoicePage.
     */
    getPendingProgressInstances: async (): Promise<PendingProgressInstance[]> => {
        const response = await axiosClient.get('/sales/orders/pending-progress');
        return response.data;
    },

    /**
     * Tarjeta B (Pendiente de Facturar): anticipos sin CXC ADVANCE + piezas CLOSED sin factura admin.
     * Totales y filas deben coincidir con PendingToInvoicePage y ReceivablesModule.
     */
    getInvoicingRights: async (): Promise<InvoicingRightsRead> => {
        const response = await axiosClient.get('/sales/invoicing-rights');
        return response.data;
    },

    /**
     * CXC emitidas pendientes de cobro (misma noción que Administración C. Antigüedad).
     * Fallback por varias rutas típicas en FastAPI; el backend debe exponer al menos una para rol SALES.
     */
    getPendingCustomerPaymentsForReceivable: async (): Promise<CustomerPayment[]> => {
        const attempt = async (url: string, params?: Record<string, string>): Promise<CustomerPayment[]> => {
            try {
                const res = await axiosClient.get(url, params ? { params } : undefined);
                const rows = pickArrayPayload(res.data);
                const parsed = rows.map(normalizeToCustomerPayment).filter((x): x is CustomerPayment => x != null);
                return parsed;
            } catch {
                return [];
            }
        };

        const fromDedicated = await attempt('/sales/customer-payments/pending');
        if (fromDedicated.length) return fromDedicated;

        const fromAllCp = await attempt('/sales/customer-payments');
        if (fromAllCp.length) return fromAllCp;

        const fromPayments = await attempt('/sales/payments', { status: 'PENDING' });
        if (fromPayments.length) return fromPayments;

        return attempt('/sales/customer-payments', { status: 'PENDING' });
    },

    /**
     * TESORERÍA/ADMIN: Obtiene el reporte de comisiones desde la tabla SalesCommission.
     * Fuente de verdad única — no requiere cálculo en frontend.
     */
    getCommissions: async (params?: {
        user_id?: number;
        commission_type?: 'SELLER' | 'DIRECTOR_GLOBAL';
        is_paid?: boolean;
    }): Promise<SalesCommissionRecord[]> => {
        const response = await axiosClient.get('/sales/commissions', { params });
        return response.data;
    },

    getCommissionsPayrollOverview: async (): Promise<CommissionsPayrollOverview> => {
        const response = await axiosClient.get('/sales/commissions/payroll-overview');
        return response.data;
    },

    updateCommissionPayroll: async (
        commissionId: number,
        payload: { admin_notes?: string | null; payroll_deferred?: boolean }
    ): Promise<void> => {
        await axiosClient.patch(`/sales/commissions/${commissionId}/payroll`, payload);
    },

    /**
     * Marca una comisión como pagada/no-pagada (legacy: bandera en CXC).
     */
    markCommissionPaid: async (paymentId: number, isPaid: boolean): Promise<void> => {
        await axiosClient.patch(`/sales/payments/${paymentId}`, { commission_paid: isPaid });
    },

    /** Tesorería: marca comisión en tabla sales_commissions (verdad única para nómina). */
    markCommissionPayrollPaid: async (commissionId: number, isPaid: boolean): Promise<void> => {
        await axiosClient.patch(`/sales/commissions/${commissionId}/mark-paid`, { is_paid: isPaid });
    },
};