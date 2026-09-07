export type QuotationStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface QuotationItem {
  id?: number;
  quotation_id?: number;
  product_name: string;
  origin_version_id?: number | null;
  quantity: number;
  unit_price: number;
  subtotal_price?: number;
  cost_snapshot?: Record<string, unknown>;
  frozen_unit_cost?: number;
  is_resale?: boolean;
  resale_sku?: string | null;
  commercial_description?: string | null;
  is_cancelled?: boolean;
}

export interface QuotationClientBasic {
  id: number;
  business_name: string;
  trade_name?: string | null;
}

export interface Quotation {
  id: number;
  status: QuotationStatus;
  project_name: string;
  client_id: number;
  tax_rate_id: number;
  valid_until: string;
  delivery_date?: string | null;
  applied_margin_percent: number;
  applied_tolerance_percent?: number;
  applied_commission_percent?: number;
  advance_percent: number;
  has_advance_invoice?: boolean;
  advance_invoice_amount?: number | null;
  currency: string;
  notes?: string | null;
  conditions?: string | null;
  external_invoice_ref?: string | null;
  is_warranty?: boolean;
  created_at: string;
  subtotal: number;
  tax_amount: number;
  total_price: number;
  commission_amount?: number;
  user_id?: number | null;
  sales_order_id?: number | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  reject_reason?: string | null;
  rejected_by_user_id?: number | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  client?: QuotationClientBasic | null;
  items: QuotationItem[];
}

export interface QuotationCreatePayload {
  project_name: string;
  client_id: number;
  tax_rate_id: number;
  valid_until: string;
  delivery_date?: string | null;
  applied_margin_percent?: number;
  applied_tolerance_percent?: number;
  applied_commission_percent?: number;
  advance_percent?: number;
  has_advance_invoice?: boolean;
  advance_invoice_amount?: number | null;
  currency?: string;
  notes?: string | null;
  conditions?: string | null;
  external_invoice_ref?: string | null;
  is_warranty?: boolean;
  items: Omit<QuotationItem, 'id' | 'quotation_id' | 'subtotal_price' | 'is_cancelled'>[];
}

export type QuotationUpdatePayload = Partial<Omit<QuotationCreatePayload, 'items'>> & {
  items?: QuotationCreatePayload['items'];
};

export interface QuotationConvertResult {
  quotation_id: number;
  sales_order_id: number;
  message: string;
}

export interface QuotationListFilters {
  status?: QuotationStatus;
  search?: string;
}
