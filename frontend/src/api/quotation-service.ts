import axiosClient from './axios-client';
import {
  ClientPurchaseOrder,
  Quotation,
  QuotationAuthorizePayload,
  QuotationCreatePayload,
  QuotationConvertResult,
  QuotationListFilters,
  QuotationStatus,
  QuotationUpdatePayload,
} from '../types/quotations';

const BASE = '/quotations';

export const formatQuotationCurrency = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatQuotationFolio = (id: number): string =>
  `COT-${String(id).padStart(4, '0')}`;

const post = async (id: number, action: string, body?: unknown): Promise<Quotation> => {
  const response = await axiosClient.post(`${BASE}/${id}/${action}`, body);
  return response.data;
};

export const quotationService = {
  listQuotations: async (filters?: QuotationListFilters): Promise<Quotation[]> => {
    const params: Record<string, string> = {};
    if (filters?.status) params.status_filter = filters.status;
    const response = await axiosClient.get(`${BASE}/`, { params: { ...params, t: Date.now() } });
    let rows: Quotation[] = Array.isArray(response.data) ? response.data : [];
    const search = filters?.search?.trim().toLowerCase();
    if (search) {
      rows = rows.filter((q) => {
        const clientName = (q.client?.full_name ?? '').toLowerCase();
        const project = (q.project_name ?? '').toLowerCase();
        return clientName.includes(search) || project.includes(search) || q.folio.toLowerCase().includes(search);
      });
    }
    return rows;
  },

  getQuotation: async (id: number): Promise<Quotation> => {
    const response = await axiosClient.get(`${BASE}/${id}`, { params: { t: Date.now() } });
    return response.data;
  },

  createQuotation: async (data: QuotationCreatePayload): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/`, data);
    return response.data;
  },

  updateQuotation: async (id: number, data: QuotationUpdatePayload): Promise<Quotation> => {
    const response = await axiosClient.patch(`${BASE}/${id}`, data);
    return response.data;
  },

  requestAuthorization: (id: number): Promise<Quotation> => post(id, 'request-auth'),

  authorize: (id: number, data: QuotationAuthorizePayload): Promise<Quotation> => post(id, 'authorize', data),

  requestChanges: (id: number, reason: string): Promise<Quotation> => post(id, 'request-changes', { reason }),

  markLost: (id: number, reason: string): Promise<Quotation> => post(id, 'mark-lost', { reason }),

  cancelQuotation: (id: number, reason: string): Promise<Quotation> => post(id, 'cancel', { cancel_reason: reason }),

  renew: (id: number, validUntil: string): Promise<Quotation> => post(id, 'renew', { valid_until: validUntil }),

  convertToOrder: async (id: number, po: ClientPurchaseOrder): Promise<QuotationConvertResult> => {
    const response = await axiosClient.post(`${BASE}/${id}/convert`, po);
    return response.data;
  },

  openQuotationPdf: async (id: number): Promise<void> => {
    const pdfWindow = window.open('', '_blank');
    if (pdfWindow) {
      pdfWindow.document.write(
        '<div style="font-family:sans-serif;padding:40px;text-align:center;color:#666;"><h3>Generando PDF...</h3></div>',
      );
    }
    try {
      const response = await axiosClient.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
      const fileURL = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      if (pdfWindow) pdfWindow.location.href = fileURL;
    } catch {
      pdfWindow?.close();
      throw new Error('No se pudo generar el PDF.');
    }
  },
};

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_AUTH: 'Esperando autorización',
  CHANGES_REQUESTED: 'Cambios solicitados',
  AUTHORIZED: 'Autorizada',
  CONVERTED: 'Convertida en OV',
  LOST: 'Perdida',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
};

/** Statuses in which the seller can edit the quotation. */
export const EDITABLE_QUOTATION_STATUSES: QuotationStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];
