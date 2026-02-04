import axiosClient from './axios-client';
import { ReceptionCreatePayload, InventoryReception } from '../types/inventory';

// --- TIPOS NUEVOS (Reporte Financiero) ---
export interface AccountsPayableStats {
    total_payable: number;
    total_documents: number; // <--- ¡AGREGADO! El contador de facturas
    overdue_amount: number;
    upcoming_amount: number;
    breakdown_by_age: {
        current?: number;       // Lo puse opcional (?) por si el backend no lo envía explícitamente como "current"
        "1-30": number;
        "31-60": number;
        "61-90"?: number;       // Opcional para flexibilidad
        "+90": number;
        [key: string]: number | undefined;
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
     * NOTA: Se actualizó la URL para coincidir con inventory.py
     */
    getAccountsPayableSummary: async (): Promise<AccountsPayableStats> => {
        // CORREGIDO: Apuntamos al endpoint que acabamos de crear en inventory.py
        const response = await axiosClient.get('/inventory/financial-summary');
        return response.data;
    }
};