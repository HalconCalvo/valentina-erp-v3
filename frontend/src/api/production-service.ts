import axiosClient from './axios-client';
import { ProductionBatch } from '../types/production';

export type ReversalDisposition = 'RETURN_TO_STOCK' | 'WASTE';

export type ReversalPayload = {
  reason: string;
  disposition: ReversalDisposition;
};

export type BatchStatusOptions = {
  override_reason?: string;
  reversal?: ReversalPayload;
};

export type StockShortage = {
  material_id: number;
  sku: string;
  name: string;
  usage_unit: string;
  required: number;
  available: number;
  missing: number;
};

/** 409 detail returned by the backend for inventory decisions. */
export type InventoryConflictDetail = {
  code: 'INSUFFICIENT_STOCK' | 'REVERSAL_REQUIRED' | 'ADVANCE_REQUIRED';
  message: string;
  batch_folio?: string;
  shortages?: StockShortage[];
};

export function getInventoryConflict(err: unknown): InventoryConflictDetail | null {
  const response = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const detail = response?.data?.detail as InventoryConflictDetail | undefined;
  if (response?.status !== 409 || !detail || typeof detail !== 'object' || !('code' in detail)) return null;
  return detail;
}

export const productionService = {
  // Obtener todos los lotes
  getBatches: async (): Promise<ProductionBatch[]> => {
    const response = await axiosClient.get('/production/batches');
    return response.data;
  },

  getReadyInstances: async (): Promise<unknown[]> => {
    const response = await axiosClient.get('/production/instances/ready');
    return response.data;
  },

  
  // Crear un nuevo lote 
  createBatch: async (data: { batch_type: string; estimated_merma_percent?: number }): Promise<ProductionBatch> => {
    const response = await axiosClient.post(
      '/production/',
      null,
      {
        params: {
          batch_type: data.batch_type,
          estimated_merma_percent: data.estimated_merma_percent ?? 5.0,
        },
      }
    );
    return response.data;
  },

  // Asignar bultos/instancias a un lote
  assignInstanceToBatch: async (batchId: number, instanceId: number) => {
    const response = await axiosClient.post(`/production/${batchId}/assign_instance/${instanceId}`);
    return response.data;
  },

  // Actualizar el estatus del lote (Drag & Drop).
  // Entrar a producción descarga la receta; regresar de producción exige reversa.
  updateBatchStatus: async (
    batchId: number,
    newStatus: string,
    options: BatchStatusOptions = {},
  ): Promise<ProductionBatch> => {
    const response = await axiosClient.patch(`/production/${batchId}/status`, { status: newStatus, ...options });
    return response.data;
  },

  // Sacar una instancia de un lote (libera reservas o revierte material descargado)
  removeInstanceFromBatch: async (
    batchId: number,
    instanceId: number,
    reason: string,
    reversal?: ReversalPayload,
  ) => {
    const response = await axiosClient.post(`/production/${batchId}/instances/${instanceId}/remove`, {
      reason,
      reversal: reversal ?? null,
    });
    return response.data;
  },

  dispatchHardware: async (instanceId: number) => {
    const response = await axiosClient.patch(`/production/instances/${instanceId}/dispatch-hardware`);
    return response.data;
  },

  requestLabels: async (
    instanceId: number,
    mdfBundles: number,
    hardwareBundles: number
  ): Promise<{
    instance_id: number;
    mdf_bundles: number;
    hardware_bundles: number;
    total_bundles: number;
  }> => {
    const response = await axiosClient.post(`/production/instances/${instanceId}/request_labels`, {
      mdf_bundles: mdfBundles,
      hardware_bundles: hardwareBundles,
    });
    return response.data;
  },

  deleteBatch: async (batchId: number): Promise<{
    message: string;
    instances_reset: number;
    reservations_cancelled: number;
  }> => {
    const response = await axiosClient.delete(`/production/${batchId}`);
    return response.data;
  },

  markInstanceReady: async (instanceId: number): Promise<any> => {
    const response = await axiosClient.patch(
      `/production/instances/${instanceId}/ready`
    );
    return response.data;
  },
};