import axiosClient from './axios-client';

export type InvoiceStatusFix = {
  cxc_id: number; sales_order_id: number; order_folio: string; invoice_folio: string | null; payment_type: string;
  amount: number; amortized_advance: number; collected: number; credited: number; balance: number;
  status: string; new_status: string;
};

export type OrderBalanceFix = {
  sales_order_id: number; order_folio: string; project_name: string; client_name: string | null; is_legacy: boolean;
  total_price: number; collected: number; stored_balance: number; computed_balance: number;
  status: string; new_status: string;
};

export type RecalcAnomaly = { cxc_id: number; sales_order_id: number; order_folio: string; message: string };

export type BalanceRecalcPreview = { invoices: InvoiceStatusFix[]; orders: OrderBalanceFix[]; anomalies: RecalcAnomaly[] };

export type BalanceRecalcResult = { invoices_updated: number; orders_updated: number; skipped: string[] };

export type UnpaidAdvance = {
  invoice_id: number; invoice_number: string; provider_name: string | null; total_amount: number;
  issue_date: string | null; open_payments: number;
};

export type UnpaidAdvanceResult = { updated: number; skipped: string[] };

/** Sanitation tools (docs/SANEAMIENTO.md §6): preview, then apply with a reason (DIRECTOR or MANAGER). */
export const sanitationService = {
  previewBalances: async (): Promise<BalanceRecalcPreview> =>
    (await axiosClient.get('/sanitation/balances')).data,

  applyBalances: async (invoiceIds: number[], orderIds: number[], reason: string): Promise<BalanceRecalcResult> =>
    (await axiosClient.post('/sanitation/balances/apply', { invoice_ids: invoiceIds, order_ids: orderIds, reason })).data,

  previewSupplierAdvances: async (): Promise<UnpaidAdvance[]> =>
    (await axiosClient.get('/sanitation/supplier-advances')).data,

  applySupplierAdvances: async (invoiceIds: number[], reason: string): Promise<UnpaidAdvanceResult> =>
    (await axiosClient.post('/sanitation/supplier-advances/apply', { invoice_ids: invoiceIds, reason })).data,
};
