import axiosClient from './axios-client';
import { ReceptionCreatePayload, InventoryReception } from '../types/inventory';

// --- TIPOS NUEVOS (Reporte Financiero) ---
export interface AccountsPayableStats {
    total_payable: number;
    overdue_amount: number;
    upcoming_amount: number;
    breakdown_by_age: {
        current: number;
        "1-30": number;
        "31-60": number;
        "61-90": number;
        "+90": number;
        [key: string]: number;
    };
}

export const inventoryService = {
    /**
     * Registra una nueva recepción de compra (Entrada de Almacén)
     */
    createReception: async (data: ReceptionCreatePayload): Promise<InventoryReception> => {
        const response = await axiosClient.post('/inventory/reception', data);
        return response.data;
    },

    /**
     * (Opcional Futuro) Obtener historial de recepciones
     */
    getReceptions: async (): Promise<InventoryReception[]> => {
        const response = await axiosClient.get('/inventory/receptions');
        return response.data;
    },

    /**
     * NUEVO: Obtiene el reporte financiero de Cuentas por Pagar (KPIs + Antigüedad)
     * Conecta con GET /analytics/accounts-payable-summary
     */
    getAccountsPayableSummary: async (): Promise<AccountsPayableStats> => {
        const response = await axiosClient.get('/analytics/accounts-payable-summary');
        return response.data;
    }
};