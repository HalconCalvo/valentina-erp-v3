import axiosClient from './axios-client';

export type AuditStatus = 'EN_CAPTURA' | 'ESPERANDO_AUTORIZACION' | 'CERRADA' | 'CANCELADA';

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
  resolved?: boolean;
}

export interface AuditSessionRead {
  id: number;
  status: AuditStatus;
  scheduled_date: string;
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

const AUDITS_BASE = '/foundations/inventory/audits';

export const formatInventoryCurrency = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

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

  createAuditSession: async (): Promise<AuditSessionRead> => {
    const response = await axiosClient.post(`${AUDITS_BASE}`);
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
