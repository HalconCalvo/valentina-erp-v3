export interface ReceptionItem {
    material_id: number;
    quantity: number;
    line_total_cost: number; // Costo total de la línea (Ej. $500 por 10 piezas)
    
    // Auxiliares para UI
    tempId?: string; 
    material_name?: string;
    unit_cost_calculated?: number; // Solo para mostrar al usuario (line_total / qty)
}

export interface ReceptionCreatePayload {
    provider_id: number;
    invoice_number: string;
    invoice_date: string; // ISO String
    total_amount: number;
    notes?: string;
    items: ReceptionItem[];
}

export interface InventoryTransaction {
    id: number;
    material_id: number;
    quantity: number;
    unit_cost: number;
    subtotal: number;
    transaction_type: string;
    created_at: string;
    material_name?: string;
}

export interface InventoryReception {
    id: number;
    provider_id: number;
    invoice_number: string;
    reception_date: string;
    total_amount: number;
    status: string;
    transactions: InventoryTransaction[];
}