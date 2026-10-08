import axiosClient from './axios-client';
import type {
  ChangeOrderAuthorizePayload,
  ChangeOrderPayload,
  Quotation,
  QuotationStatus,
} from '../types/quotations';

const BASE = '/change-orders';

/** Change orders (CAM) of a sales order. Request authorization, return, cancel and renew use quotationService. */
export const changeOrderService = {
  list: async (params: { salesOrderId?: number; status?: QuotationStatus } = {}): Promise<Quotation[]> => {
    const response = await axiosClient.get(`${BASE}/`, {
      params: { sales_order_id: params.salesOrderId, status_filter: params.status, t: Date.now() },
    });
    return Array.isArray(response.data) ? response.data : [];
  },

  get: async (id: number): Promise<Quotation> => {
    const response = await axiosClient.get(`${BASE}/${id}`, { params: { t: Date.now() } });
    return response.data;
  },

  create: async (payload: ChangeOrderPayload): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/`, payload);
    return response.data;
  },

  update: async (id: number, payload: Partial<Omit<ChangeOrderPayload, 'sales_order_id'>>): Promise<Quotation> => {
    const response = await axiosClient.patch(`${BASE}/${id}`, payload);
    return response.data;
  },

  authorize: async (id: number, payload: ChangeOrderAuthorizePayload): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/${id}/authorize`, payload);
    return response.data;
  },

  apply: async (id: number, po: { client_po_folio?: string | null; client_po_date?: string | null }): Promise<Quotation> => {
    const response = await axiosClient.post(`${BASE}/${id}/apply`, po);
    return response.data;
  },
};

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  ADD: 'Partida nueva',
  QUANTITY_UP: 'Más unidades',
  QUANTITY_DOWN: 'Cancelar unidades',
  PRICE: 'Cambio de precio',
  CANCEL_LINE: 'Cancelar partida',
};

export const DISPOSITION_LABELS: Record<string, string> = {
  RETURN_TO_STOCK: 'Regresa al almacén',
  WASTE: 'Merma',
};
