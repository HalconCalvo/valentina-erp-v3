import axiosClient from './axios-client';

export interface CxcAgingStats {
    total_pending: number;
    breakdown: Record<'0-30' | '31-60' | '61-90' | '+90', number>;
    count: number;
}

export interface OrderProfitabilityItem {
    order_id: number;
    folio: string;
    client_name: string;
    total_price: number;
    estimated_cost: number;
    /** Comisión incluida y utilidad neta (sin IVA) */
    commission_amount?: number;
    net_profit?: number;
    /** Margen neto % sobre venta (sin IVA, después de comisión) */
    margin_percent: number;
}

export interface CashFlowEntry {
    date: string;
    amount: number;
    reference: string;
}

export interface CashFlowProjection {
    current_balance: number;
    projection_30: number;
    projection_60: number;
    projection_90: number;
    expected_income: CashFlowEntry[];
    committed_expenses: CashFlowEntry[];
}

export interface TopClientItem {
    client_id: number;
    client_name: string;
    total_orders: number;
    total_revenue: number;
    avg_margin_percent: number;
}

/** Director dashboard: one source for the cards (amounts without VAT; margins are Margen neto % sobre venta). */
export type AmountLine = { label: string; amount: number; }

export type OrderMarginRow = {
    order_id: number;
    folio: string;
    client_name: string;
    sales_without_tax: number;
    cost: number;
    commission: number;
    net_margin_percent: number | null;
}

export type ClientSalesRow = {
    client_id: number;
    client_name: string;
    orders: number;
    sales_without_tax: number;
    net_margin_percent: number | null;
}

export type ClientPaymentSpeedRow = {
    client_id: number;
    client_name: string;
    collected: number;
    avg_days_to_collect: number;
}

export type LaneSalesRow = {
    lane: string;
    sales_without_tax: number;
    cost: number;
    commission: number;
    net_margin_percent: number | null;
}

export interface DirectorSummary {
    sales: { year: number; sales_without_tax: number; orders: number; annual_target: number; target_percent: number | null };
    liquidity: {
        banks: number; bank_lines: AmountLine[];
        receivables: number; receivable_lines: AmountLine[];
        inventory: number; inventory_lines: AmountLine[];
        payables: number; payable_lines: AmountLine[];
        net: number;
    };
    profitability: {
        sales_without_tax: number; cost: number; commission: number; net_margin_percent: number | null;
        orders_without_cost: number; sales_without_cost: number;
        most_profitable: OrderMarginRow[]; least_profitable: OrderMarginRow[];
    };
    receivables: { pending: number; documents: number; cash_flow_income: number };
    top_clients: {
        by_sales: ClientSalesRow[];
        by_margin: ClientSalesRow[];
        by_payment_speed: ClientPaymentSpeedRow[];
        by_lane: LaneSalesRow[];
    };
}

export const analyticsService = {
    getDirectorSummary: async (): Promise<DirectorSummary> => {
        const response = await axiosClient.get('/analytics/director-summary');
        return response.data;
    },

    getCxcAging: async (): Promise<CxcAgingStats> => {
        const response = await axiosClient.get('/analytics/cxc-aging');
        return response.data;
    },

    getOrderProfitability: async (): Promise<OrderProfitabilityItem[]> => {
        const response = await axiosClient.get('/analytics/order-profitability');
        return response.data;
    },

    getCashFlowProjection: async (): Promise<CashFlowProjection> => {
        const response = await axiosClient.get('/analytics/cash-flow-projection');
        return response.data;
    },

    getTopClients: async (): Promise<TopClientItem[]> => {
        const response = await axiosClient.get('/analytics/top-clients');
        return response.data;
    },
};
