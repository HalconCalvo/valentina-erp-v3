export type QuotationStatus =
  | 'DRAFT'
  | 'PENDING_AUTH'
  | 'CHANGES_REQUESTED'
  | 'AUTHORIZED'
  | 'CONVERTED'
  | 'LOST'
  | 'EXPIRED'
  | 'CANCELLED';

export type QuotationItem = {
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
};

export interface QuotationClientBasic {
  id: number;
  full_name: string;
}

export interface QuotationUserBasic {
  id: number;
  full_name?: string | null;
}

export type Quotation = {
  id: number;
  folio: string;
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
  auth_requested_at?: string | null;
  authorized_at?: string | null;
  authorized_by_user_id?: number | null;
  director_notes?: string | null;
  changes_requested_at?: string | null;
  changes_requested_reason?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  converted_at?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  client?: QuotationClientBasic | null;
  user?: QuotationUserBasic | null;
  items: QuotationItem[];
};

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
  items: Omit<QuotationItem, 'id' | 'quotation_id' | 'subtotal_price'>[];
}

export type QuotationUpdatePayload = Partial<Omit<QuotationCreatePayload, 'items'>> & {
  items?: QuotationCreatePayload['items'];
};

/** Director's financial review: final prices, margin, commission (%) and advance. */
export interface QuotationAuthorizePayload {
  items: QuotationCreatePayload['items'];
  applied_margin_percent: number;
  applied_commission_percent: number;
  advance_percent: number;
  advance_invoice_amount?: number | null;
  director_notes?: string | null;
}

export interface ClientPurchaseOrder {
  client_po_folio: string;
  client_po_date: string;
}

export interface QuotationConvertResult {
  quotation_id: number;
  sales_order_id: number;
  message: string;
}

export interface QuotationListFilters {
  status?: QuotationStatus;
  search?: string;
}
