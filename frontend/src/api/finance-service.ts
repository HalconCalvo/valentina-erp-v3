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
     * Envía una solicitud de pago (Gerencia) -> PENDING
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
     * Cancela/Elimina una solicitud de pago (Solo si está PENDING)
     */
    cancelPaymentRequest: async (id: number): Promise<void> => {
        await client.delete(`/finance/payments/request/${id}`);
    },

    /**
     * Lista las solicitudes pendientes de firma (Dirección)
     * También usada por Gerencia para ver "En Espera"
     */
    getPendingApprovals: async (): Promise<SupplierPayment[]> => {
        const response = await client.get<SupplierPayment[]>('/finance/payments/pending-approvals');
        return response.data;
    },

    /**
     * Aprueba o Rechaza un pago (Dirección)
     */
    updatePaymentStatus: async (paymentId: number, status: PaymentStatus): Promise<SupplierPayment> => {
        const response = await client.put<SupplierPayment>(`/finance/payments/${paymentId}/status`, { status });
        return response.data;
    },
    
    /**
     * Obtiene todas las facturas con saldo pendiente para la Mesa de Control (Tabla de Auditoría).
     */
    getPendingInvoices: async (): Promise<PendingInvoice[]> => {
        const response = await client.get<PendingInvoice[]>('/finance/invoices/pending');
        return response.data;
    }
};