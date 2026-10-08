import type { ReversalPayload } from './production-service';
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
  RetentionAlertRead,
  RetentionUpdatePayload,
  OrderMoneySummary,
  CustomerCreditNote,
  CustomerCreditNotePayload,
} from '../types/sales';

export type LegacyImportOrderCreated = {
    project_name: string;
    order_id: number;
    folio: string;
    outstanding_balance: number;
}

export type LegacyImportIssue = {
    sheet: string;
    row: number | null;
    project: string | null;
    message: string;
}

export type LegacyImportPreviewOrder = {
    row: number;
    project_name: string;
    client_name: string;
    seller_name: string;
    tax_rate_name: string;
    total_price: number;
    subtotal: number;
    tax_amount: number;
    invoices: number;
    installments: number;
    outstanding_balance: number;
    payment_status: string;
}

export type LegacyImportPreview = {
    orders: LegacyImportPreviewOrder[];
    orders_to_create: number;
    invoices_to_create: number;
    installments_to_create: number;
    can_import: boolean;
    warnings: LegacyImportIssue[];
    errors: LegacyImportIssue[];
}

export type LegacyImportResult = {
    orders_created: number;
    invoices_created: number;
    installments_created: number;
    orders_created_details: LegacyImportOrderCreated[];
    warnings: LegacyImportIssue[];
    errors: LegacyImportIssue[];
}

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
     * Obtiene el listado de órdenes.
     * @param status (Opcional) Filtrar por estatus (WAITING_ADVANCE, SOLD, etc.)
     * @param clientId (Opcional) Filtrar por cliente
     */
    getOrders: async (status?: SalesOrderStatus, clientId?: number): Promise<SalesOrder[]> => {
        const params: any = {};
        if (status) params.status = status;
        if (clientId) params.client_id = clientId;

        const response = await axiosClient.get(API_ROUTES.SALES.ORDERS, {
            params: { ...params, t: Date.now() }
        });
        return response.data;
    },

    /**
     * Obtiene el detalle completo de una orden específica (incluyendo items y totales).
     */
    getOrderDetail: async (orderId: number): Promise<SalesOrder> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId);
        const response = await axiosClient.get(url, { params: { t: Date.now() } });
        return response.data;
    },

    /**
     * Actualiza datos de cabecera de una OV (notas, condiciones, OC del cliente, anticipo).
     * Las partidas se modifican con los flujos de "Modificar OV"; las cotizaciones viven en quotation-service.
     */
    updateOrder: async (orderId: number, data: Partial<SalesOrder>): Promise<SalesOrder> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId); 
        const response = await axiosClient.patch(url, data);
        return response.data;
    },

    patchInstanceDeliveryDeadline: async (
        orderId: number,
        instanceId: number,
        payload: { delivery_deadline: string; apply_to_all_without_date: boolean },
    ): Promise<{
        updated_count: number;
        instances: Array<{
            id: number;
            delivery_deadline: string | null;
            semaphore: string;
            semaphore_label: string;
        }>;
    }> => {
        const response = await axiosClient.patch(
            API_ROUTES.SALES.INSTANCE_DELIVERY_DEADLINE(orderId, instanceId),
            payload,
        );
        return response.data;
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

    /**
     * Cancela una OV en espera de anticipo (WAITING_ADVANCE -> CANCELLED_OV).
     * Solo si no tiene anticipo pagado. Es terminal.
     */
    cancelOv: async (orderId: number, reversal?: ReversalPayload): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/cancel_ov`;
        await axiosClient.post(url, reversal ? { reversal } : null);
    },

    // =========================================================
    // --- NUEVO MOTOR HÍBRIDO DE COBRANZA (V3.5) ---
    // =========================================================

    /**
     * ADMINISTRACIÓN: Registra el Anticipo (La bolsa inicial)
     * (WAITING_ADVANCE -> SOLD)
     */
    registerAdvancePayment: async (orderId: number, payload: PaymentPayload) => {
        // mark_sold: define el importe OBJETIVO del anticipo (advance_invoice_amount). Ya no crea pagos.
        const response = await axiosClient.post(`/sales/orders/${orderId}/mark_sold`, payload);
        return response.data;
    },

    registerAdvanceInstallment: async (orderId: number, payload: PaymentPayload) => {
        // Registra un abono parcial del anticipo (nace PAID). Acumula contra advance_invoice_amount.
        const response = await axiosClient.post(`/sales/orders/${orderId}/advance_payments`, payload);
        return response.data;
    },

    /**
     * Camino A: emite la factura de anticipo (crea un CustomerPayment ADVANCE PENDING).
     * Los abonos posteriores nacen en Tesorería al conciliar el ingreso.
     */
    emitAdvanceInvoice: async (orderId: number, payload: { invoice_folio: string | null; amount: number; invoice_date?: string | null; change_quotation_id?: number | null }) => {
        const response = await axiosClient.post(`/sales/orders/${orderId}/emit_advance_invoice`, payload);
        return response.data;
    },

    /**
     * Camino C: emite factura por el 100% del contrato (CustomerPayment FULL PENDING).
     */
    emitFullInvoice: async (orderId: number, payload: { invoice_folio: string; amount: number; invoice_date?: string | null }) => {
        const response = await axiosClient.post(`/sales/orders/${orderId}/emit_full_invoice`, payload);
        return response.data;
    },

    /**
     * ADMINISTRACIÓN: Registra un Avance/Estimación (Cobro por Instancias)
     */
    registerProgressPayment: async (orderId: number, payload: PaymentPayload) => {
        const response = await axiosClient.post(`/sales/orders/${orderId}/register_progress`, payload);
        return response.data;
    },

    /** Commercial description of a line: direct edit (no money involved), kept in the change log. */
    updateItemDescription: async (orderId: number, itemId: number, description: string, reason?: string) => {
        const response = await axiosClient.patch(`/sales/orders/${orderId}/items/${itemId}/description`, {
            commercial_description: description,
            reason: reason || null,
        });
        return response.data;
    },

    /** Credit notes to capture and complementary advances left by change orders. */
    getMoneySummary: async (orderId: number): Promise<OrderMoneySummary> => {
        const response = await axiosClient.get(`/sales/orders/${orderId}/money-summary`, { params: { t: Date.now() } });
        return response.data;
    },

    createCreditNote: async (orderId: number, payload: CustomerCreditNotePayload): Promise<CustomerCreditNote> => {
        const response = await axiosClient.post(`/sales/orders/${orderId}/credit-notes`, payload);
        return response.data;
    },

    applyCreditNote: async (noteId: number, customerPaymentId: number): Promise<CustomerCreditNote> => {
        const response = await axiosClient.post(`/sales/credit-notes/${noteId}/apply`, { customer_payment_id: customerPaymentId });
        return response.data;
    },

    cancelCreditNote: async (noteId: number, reason: string): Promise<CustomerCreditNote> => {
        const response = await axiosClient.post(`/sales/credit-notes/${noteId}/cancel`, { cancel_reason: reason });
        return response.data;
    },

    // ---> NUEVA FUNCIÓN: LA CONCILIACIÓN BANCARIA <---
    confirmCXCPayment: async (orderId: number, cxcId: number) => {
        const response = await axiosClient.post(`/sales/orders/${orderId}/confirm_payment/${cxcId}`);
        return response.data;
    },

    /**
     * Opción X: registra un ABONO parcial contra una factura (CustomerPayment).
     * El backend acumula los abonos y marca la factura PAID al saldarla.
     */
    registerInstallment: async (
        cxcId: number,
        payload: {
            amount: number;
            payment_date?: string | null;
            notes?: string | null;
            reference?: string | null;
            account_id?: number | null;
            instance_ids?: number[];
            is_advance?: boolean;
        }
    ) => {
        const response = await axiosClient.post(`/sales/invoices/${cxcId}/installments`, payload);
        return response.data;
    },

    /**
     * Lista los abonos de una factura. NOTA: el endpoint GET puede no existir aún en backend;
     * queda listo para cuando se agregue.
     */
    getInstallments: async (cxcId: number) => {
        const response = await axiosClient.get(`/sales/invoices/${cxcId}/installments`);
        return response.data;
    },

    updateInstallment: async (
        installmentId: number,
        payload: {
            amount?: number;
            payment_date?: string | null;
            notes?: string | null;
            reference?: string | null;
            instance_ids?: number[];
            is_advance?: boolean;
        }
    ) => {
        const response = await axiosClient.patch(`/sales/installments/${installmentId}`, payload);
        return response.data;
    },

    cancelInstallment: async (installmentId: number, cancel_reason: string) => {
        const response = await axiosClient.patch(`/sales/installments/${installmentId}/cancel`, {
            cancel_reason,
        });
        return response.data;
    },

    /**
     * Camino A: facturas de CxC pendientes (para el selector de Tesorería al registrar un ingreso).
     */
    getPendingInvoices: async () => {
        const response = await axiosClient.get('/sales/invoices/pending-cxc');
        return response.data;
    },

    getCxcReport: async (params: {
        client_id?: number;
        date_from?: string;
        date_to?: string;
        include_paid?: boolean;
        only_cancelled?: boolean;
    } = {}) => {
        const qs = new URLSearchParams();
        if (params.client_id != null) qs.set('client_id', String(params.client_id));
        if (params.date_from) qs.set('date_from', params.date_from);
        if (params.date_to) qs.set('date_to', params.date_to);
        if (params.include_paid) qs.set('include_paid', 'true');
        if (params.only_cancelled) qs.set('only_cancelled', 'true');
        const q = qs.toString();
        const response = await axiosClient.get(`/sales/invoices/cxc-report${q ? '?' + q : ''}`);
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

    /**
     * Seguimiento de OV: estado de casas agrupadas por street+lot.
     * Sin order_id → todas las OVs activas. Con order_id → solo esa OV.
     */
    getHousesStatus: async (orderId?: number): Promise<any[]> => {
        const params = orderId ? { order_id: orderId } : {};
        const response = await axiosClient.get('/sales/houses-status', { params });
        return response.data;
    },

    validateLegacyOrders: async (file: File): Promise<LegacyImportPreview> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axiosClient.post('/sales/orders/legacy-import/validate', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    importLegacyOrders: async (file: File): Promise<LegacyImportResult> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axiosClient.post('/sales/orders/legacy-import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    updatePaymentRetention: async (paymentId: number, payload: RetentionUpdatePayload) => {
        const response = await axiosClient.patch(`/sales/payments/${paymentId}/retention`, payload);
        return response.data;
    },

    invoiceRetention: async (paymentId: number, folio: string) => {
        const response = await axiosClient.post(`/sales/payments/${paymentId}/retention/invoice`, { folio });
        return response.data;
    },

    collectRetention: async (paymentId: number) => {
        const response = await axiosClient.post(`/sales/payments/${paymentId}/retention/collect`);
        return response.data;
    },

    waiveRetention: async (paymentId: number, reason: string) => {
        const response = await axiosClient.post(`/sales/payments/${paymentId}/retention/waive`, { reason });
        return response.data;
    },

    getRetentionAlerts: async (): Promise<RetentionAlertRead[]> => {
        const response = await axiosClient.get('/sales/retentions/alerts');
        return response.data;
    },
};