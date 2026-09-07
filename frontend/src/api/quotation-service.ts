import axiosClient from './axios-client';
import {
  Quotation,
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

export const quotationService = {
  listQuotations: async (filters?: QuotationListFilters): Promise<Quotation[]> => {
    const params: Record<string, string> = {};
    if (filters?.status) params.status_filter = filters.status;
    const response = await axiosClient.get(`${BASE}/`, { params: { ...params, t: Date.now() } });
    let rows: Quotation[] = Array.isArray(response.data) ? response.data : [];
    const search = filters?.search?.trim().toLowerCase();
    if (search) {
      rows = rows.filter((q) => {
        const clientName = (q.client?.business_name ?? q.client?.trade_name ?? '').toLowerCase();
        const project = (q.project_name ?? '').toLowerCase();
        const folio = formatQuotationFolio(q.id).toLowerCase();
        return clientName.includes(search) || project.includes(search) || folio.includes(search);
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

  sendQuotation: async (id: number): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/${id}/send`);
    return response.data;
  },

  acceptQuotation: async (id: number): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/${id}/accept`);
    return response.data;
  },

  rejectQuotation: async (id: number, reason: string): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/${id}/reject`, { reject_reason: reason });
    return response.data;
  },

  cancelQuotation: async (id: number, reason: string): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/${id}/cancel`, { cancel_reason: reason });
    return response.data;
  },

  convertToOrder: async (id: number): Promise<QuotationConvertResult> => {
    const response = await axiosClient.post(`${BASE}/${id}/convert`);
    return response.data;
  },

  getQuotationPdf: async (id: number, fileName?: string): Promise<void> => {
    const response = await axiosClient.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName ?? `Cotizacion_${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
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
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
};
