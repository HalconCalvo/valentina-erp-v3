import client from './axios-client';
import {
  PettyCashFund,
  PettyCashMovement,
  PettyCashMovementCreate,
} from '../types/petty_cash';

export type { PettyCashFund, PettyCashMovement, PettyCashMovementCreate };

export interface FundUpdatePayload {
  fund_amount?: number;
  minimum_balance?: number;
}

export const pettyCashService = {
  getFund: async (): Promise<PettyCashFund> => {
    const res = await client.get('/petty-cash/fund');
    return res.data;
  },

  updateFund: async (data: FundUpdatePayload): Promise<PettyCashFund> => {
    const res = await client.put('/petty-cash/fund', data);
    return res.data;
  },

  getMovements: async (params?: {
    skip?: number;
    limit?: number;
    movement_type?: string;
  }): Promise<PettyCashMovement[]> => {
    const res = await client.get('/petty-cash/movements', { params });
    return res.data;
  },

  createMovement: async (data: PettyCashMovementCreate): Promise<PettyCashMovement> => {
    const res = await client.post('/petty-cash/movements', data);
    return res.data;
  },

  deleteMovement: async (id: number): Promise<void> => {
    await client.delete(`/petty-cash/movements/${id}`);
  },

  uploadReceipt: async (movementId: number, file: File): Promise<{ receipt_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await client.post(`/petty-cash/movements/${movementId}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
