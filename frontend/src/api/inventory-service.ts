import axiosClient from './axios-client';
import { ReceptionCreatePayload, InventoryReception } from '../types/inventory';

export interface AccountsPayableStats {
    total_payable: number;
    total_documents: number; 
    overdue_amount: number;
    upcoming_amount: number;
    breakdown_by_age: {
        current?: number;       
        "1-30": number;
        "31-60": number;
        "61-90"?: number;       
        "+90": number;
        [key: string]: number | undefined;
    };
}

// --- NUEVAS INTERFACES PARA LA VISTA DETALLADA ---
export interface ReceptionListItem {
    id: number;
    provider_name: string;
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    status: string;
    created_at: string;
}

export interface ReceptionDetailItem {
    sku: string;
    name: string;
    category: string;
    purchase_unit: string;
    usage_unit: string;
    conversion_factor: number;
    purchase_quantity: number;
    usage_quantity: number;
    unit_cost: number;
    subtotal: number;
}

export interface ReceptionFullDetail {
    id: number;
    provider_name: string;
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    notes: string;
    created_at: string;
    items: ReceptionDetailItem[];
}

export const inventoryService = {
    createReception: async (data: ReceptionCreatePayload): Promise<InventoryReception> => {
        const response = await axiosClient.post('/inventory/reception', data);
        return response.data;
    },

    // NUEVO: Trae la lista de recepciones
    getReceptions: async (): Promise<ReceptionListItem[]> => {
        const response = await axiosClient.get('/inventory/receptions');
        return response.data;
    },

    // NUEVO: Trae el desglose (ticket) de una recepción
    getReceptionById: async (id: number): Promise<ReceptionFullDetail> => {
        const response = await axiosClient.get(`/inventory/receptions/${id}`);
        return response.data;
    },

    getAccountsPayableSummary: async (): Promise<AccountsPayableStats> => {
        const response = await axiosClient.get('/inventory/financial-summary');
        return response.data;
    },

    // NUEVO: Cancela y revierte una recepción (Efecto Mariposa)
    cancelReception: async (id: number): Promise<any> => {
        const response = await axiosClient.delete(`/inventory/receptions/${id}`);
        return response.data;
    }
};