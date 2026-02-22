import client from './axios-client';
// Importamos TODOS los tipos desde el archivo central de tipos
import { 
    AccountsPayableStats, 
    PaymentRequestPayload, 
    SupplierPayment, 
    PaymentStatus, 
    PendingInvoice 
} from '../types/finance';

export const financeService = {
    /**
     * Obtiene los KPIs de las 3 Tarjetas (Rojo, Naranja, Verde)
     */
    getPayableDashboardStats: async (): Promise<AccountsPayableStats> => {
        const response = await client.get<AccountsPayableStats>('/finance/payable-stats');
        return response.data;
    },

    /**
     * Paso 1: Envía una solicitud de pago (Administración) -> PENDING
     */
    requestPayment: async (data: PaymentRequestPayload): Promise<SupplierPayment> => {
        const response = await client.post<SupplierPayment>('/finance/payments/request', data);
        return response.data;
    },

    /**
     * Actualiza una solicitud existente (Modo Edición)
     */
    updatePaymentRequest: async (id: number, data: PaymentRequestPayload): Promise<SupplierPayment> => {
        const response = await client.put<SupplierPayment>(`/finance/payments/request/${id}`, data);
        return response.data;
    },

    /**
     * Cancela/Elimina una solicitud de pago (Solo si está PENDING o REJECTED)
     */
    cancelPaymentRequest: async (id: number): Promise<void> => {
        await client.delete(`/finance/payments/request/${id}`);
    },

    /**
     * Lista las solicitudes pendientes de firma o ejecución
     */
    getPendingApprovals: async (): Promise<SupplierPayment[]> => {
        const response = await client.get<SupplierPayment[]>('/finance/payments/pending-approvals');
        return response.data;
    },

    /**
     * Obtiene los pagos que ya fueron autorizados por Dirección y están listos para ejecutarse.
     */
    getApprovedPayments: async (): Promise<SupplierPayment[]> => {
        const response = await client.get<SupplierPayment[]>('/finance/payments/approved');
        return response.data;
    },
    
    /**
     * Paso 2: Aprueba o Rechaza un pago (Dirección)
     * NUEVO: Se envía la cuenta bancaria dictaminada si se aprueba.
     */
    updatePaymentStatus: async (paymentId: number, status: PaymentStatus, approvedAccountId?: number): Promise<SupplierPayment> => {
        const payload = { 
            status, 
            approved_account_id: approvedAccountId 
        };
        const response = await client.put<SupplierPayment>(`/finance/payments/${paymentId}/status`, payload);
        return response.data;
    },

    /**
     * Paso 3: Ejecuta un pago autorizado (Administración / Tesorería) [NUEVO ENDPOINT]
     * Descuenta del banco, registra en historial y baja saldo de factura.
     */
    executePayment: async (paymentId: number): Promise<SupplierPayment> => {
        const response = await client.post<SupplierPayment>(`/finance/payments/${paymentId}/execute`);
        return response.data;
    },
    
    /**
     * Obtiene todas las facturas con saldo pendiente para la Mesa de Control.
     */
    getPendingInvoices: async (): Promise<PendingInvoice[]> => {
        const response = await client.get<PendingInvoice[]>('/finance/invoices/pending');
        return response.data;
    }
};