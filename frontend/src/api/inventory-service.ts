import { formatAmount } from '@/utils/format';
import axiosClient from './axios-client';

export type AuditStatus = 'EN_CAPTURA' | 'ESPERANDO_AUTORIZACION' | 'CERRADA' | 'REABIERTA' | 'CANCELADA';

/** Why a counted line needs approval (comma-separated in approval_reason). */
export type ApprovalReason = 'PERCENT' | 'ZERO_THEORETICAL' | 'NEGATIVE_THEORETICAL' | 'VALUE';

export interface AuditItemRead {
  id: number;
  audit_id: number;
  material_id: number;
  material_sku: string | null;
  material_name: string | null;
  counted_quantity: number | null;
  captured: boolean;
  system_quantity?: number;
  variance?: number;
  requires_approval?: boolean;
  approved_by_id?: number | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  approval_reason?: string | null;
  resolved?: boolean;
  usage_unit?: string | null;
  auto_zero?: boolean;
  unit_cost_at_cut?: number | null;
  valued_difference?: number;
  adjustment_movement_id?: number | null;
}

export interface AuditSessionRead {
  id: number;
  status: AuditStatus;
  scheduled_date: string;
  cut_date: string | null;
  cut_at: string | null;
  closed_at: string | null;
  total_valued_difference: number | null;
  value_threshold: number;
  auditor_id: number | null;
  authorized_by_id: number | null;
  notes: string | null;
  created_at: string;
  items: AuditItemRead[];
  items_total: number;
  items_captured: number;
  items_pending_approval: number;
}

export interface KardexEntryRead {
  id: number;
  material_id: number;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  transaction_type: string;
  reason_code: string | null;
  project_id: number | null;
  reception_id: number | null;
  created_at: string;
  recorded_at: string | null;
  saldo_acumulado: number;
  operator_name: string | null;
}

export interface KardexRead {
  material_id: number;
  material_name: string;
  material_sku: string;
  current_stock: number;
  entries: KardexEntryRead[];
}

export interface LowStockMaterialRead {
  id: number;
  sku: string;
  name: string;
  physical_stock: number;
  min_stock: number;
  max_stock: number;
  current_cost: number;
}

export interface InventoryValuationRead {
  total_valuation: number;
}

export interface AuditSessionSummary {
  id: number;
  status: AuditStatus;
  created_at: string;
  scheduled_date: string;
  cut_date: string | null;
  closed_at: string | null;
  auditor_id: number | null;
  authorized_by_id: number | null;
  notes: string | null;
  items_total: number;
  items_captured: number;
}

export type RawMaterialLine = {
  material_id: number;
  sku: string;
  name: string;
  usage_unit: string;
  stock: number;
  usage_unit_cost: number;
  value: number;
};

export type InProcessLine = {
  instance_id: number;
  instance_name: string;
  batch_folio: string;
  value: number;
};

export type ValuationSummary = {
  raw_materials: number;
  work_in_progress: number;
  finished_goods: number;
  total: number;
  cost_of_sales: number;
  waste: number;
  negative_stock_materials: number;
  raw_material_lines: RawMaterialLine[];
  work_in_progress_lines: InProcessLine[];
  finished_goods_lines: InProcessLine[];
};

export type StockAuthorization = {
  id: number;
  batch_folio: string;
  authorized_by: string;
  reason: string;
  shortages: { sku: string; missing: number; usage_unit: string }[];
  created_at: string;
};

export type NegativeStockReport = {
  materials: RawMaterialLine[];
  authorizations: StockAuthorization[];
};

export type PeriodLockRead = {
  locked: boolean;
  locked_until?: string | null;
  locked_until_local?: string | null;
  audit_id?: number | null;
};

/** 422 detail when uncounted materials still have stock at the cut. */
export type UncapturedWithStockDetail = {
  code: 'UNCAPTURED_WITH_STOCK';
  message: string;
  materials: { sku: string; name: string }[];
};

const AUDITS_BASE = '/foundations/inventory/audits';

/** Amount without the $ sign (see utils/format). */
export const formatInventoryCurrency = (amount: number | undefined | null): string => formatAmount(amount);

export const inventoryService = {
  getValuationSummary: async (dateFrom?: string, dateTo?: string): Promise<ValuationSummary> => {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = `${dateTo}T23:59:59`;
    const response = await axiosClient.get('/foundations/inventory/valuation-summary', { params });
    return response.data;
  },

  getNegativeStock: async (): Promise<NegativeStockReport> => {
    const response = await axiosClient.get('/foundations/inventory/negative-stock');
    return response.data;
  },

  getKardex: async (
    materialId: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<KardexRead> => {
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const response = await axiosClient.get(`/foundations/materials/${materialId}/kardex`, { params });
    return response.data;
  },

  getLowStock: async (): Promise<LowStockMaterialRead[]> => {
    const response = await axiosClient.get('/foundations/materials/low-stock');
    return Array.isArray(response.data) ? response.data : [];
  },

  getInventoryValuation: async (): Promise<InventoryValuationRead> => {
    const response = await axiosClient.get('/foundations/materials/valuation');
    return response.data;
  },

  createAuditSession: async (cutDate: string, notes?: string): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}`, { cut_date: cutDate, notes: notes || null });
    return response.data;
  },

  reopenAudit: async (auditId: number, reason: string): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/reopen`, { reason });
    return response.data;
  },

  closeAuditAgain: async (auditId: number): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/close`);
    return response.data;
  },

  recountAuditItem: async (auditId: number, itemId: number, countedQuantity: number, reason: string) => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/items/${itemId}/recount`, {
      counted_quantity: countedQuantity,
      reason,
    });
    return response.data;
  },

  getPeriodLock: async (): Promise<PeriodLockRead> => {
    const response = await axiosClient.get('/foundations/inventory/period-lock');
    return response.data;
  },

  getAuditSettings: async (): Promise<{ inventory_audit_value_threshold: number }> => {
    const response = await axiosClient.get('/foundations/inventory/audit-settings');
    return response.data;
  },

  updateAuditSettings: async (threshold: number): Promise<{ inventory_audit_value_threshold: number }> => {
    const response = await axiosClient.patch('/foundations/inventory/audit-settings', {
      inventory_audit_value_threshold: threshold,
    });
    return response.data;
  },

  getActiveAudit: async (): Promise<AuditSessionRead | null> => {
    const response = await axiosClient.get(`${AUDITS_BASE}/active`);
    return response.data ?? null;
  },

  listAuditSessions: async (status?: AuditStatus): Promise<AuditSessionSummary[]> => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    const response = await axiosClient.get(AUDITS_BASE, { params });
    return Array.isArray(response.data) ? response.data : [];
  },

  getAuditDetail: async (id: number): Promise<AuditSessionRead> => {
    const response = await axiosClient.get(`${AUDITS_BASE}/${id}`);
    return response.data;
  },

  captureCount: async (
    auditId: number,
    itemId: number,
    quantity: number,
  ): Promise<AuditItemRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/capture`, {
      item_id: itemId,
      counted_quantity: quantity,
    });
    return response.data;
  },

  submitAudit: async (auditId: number): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/submit`);
    return response.data;
  },

  approveAuditItem: async (
    auditId: number,
    itemId: number,
    notes?: string,
  ): Promise<AuditItemRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/items/${itemId}/approve`, {
      notes: notes ?? null,
    });
    return response.data;
  },

  approveAllAudit: async (auditId: number): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/approve`);
    return response.data;
  },

  rejectAudit: async (auditId: number, reason: string): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/reject`, { reason });
    return response.data;
  },

  cancelAudit: async (auditId: number, reason: string): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}/${auditId}/cancel`, { reason });
    return response.data;
  },
};
