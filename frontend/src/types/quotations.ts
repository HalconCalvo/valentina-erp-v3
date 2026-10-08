export type QuotationStatus =
  | 'DRAFT'
  | 'PENDING_AUTH'
  | 'CHANGES_REQUESTED'
  | 'AUTHORIZED'
  | 'CONVERTED'
  | 'LOST'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'APPLIED';

export type QuotationKind = 'NEW' | 'CHANGE_ORDER';

export type ChangeType = 'ADD' | 'QUANTITY_UP' | 'QUANTITY_DOWN' | 'PRICE' | 'CANCEL_LINE';

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
  change_type?: ChangeType | null;
  target_order_item_id?: number | null;
  cancel_instance_ids?: number[] | null;
  reversal_dispositions?: Record<string, string> | null;
  change_reason?: string | null;
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
  kind?: QuotationKind;
  parent_sales_order_id?: number | null;
  change_number?: number | null;
  change_reason?: string | null;
  applied_at?: string | null;
  client_po_folio?: string | null;
  client_po_date?: string | null;
  complementary_advance_amount?: number;
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
  /** OV complementaria: la OV original que amplía */
  parent_sales_order_id?: number | null;
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

/** One operation of a change order (CAM). */
export type ChangeOrderLine = {
  change_type: ChangeType;
  target_order_item_id?: number | null;
  product_name?: string | null;
  origin_version_id?: number | null;
  quantity: number;
  unit_price: number;
  frozen_unit_cost?: number;
  is_resale?: boolean;
  resale_sku?: string | null;
  commercial_description?: string | null;
  cancel_instance_ids?: number[];
  reversal_dispositions?: Record<string, string>;
  change_reason?: string | null;
};

export interface ChangeOrderPayload {
  sales_order_id: number;
  change_reason: string;
  lines: ChangeOrderLine[];
  advance_percent?: number | null;
  notes?: string | null;
}

export interface ChangeOrderAuthorizePayload {
  lines: ChangeOrderLine[];
  advance_percent: number;
  director_notes?: string | null;
}
