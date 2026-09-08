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

export const analyticsService = {
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
