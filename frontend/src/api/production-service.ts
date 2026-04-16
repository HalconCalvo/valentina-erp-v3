import axiosClient from './axios-client';
import { ProductionBatch } from '../types/production';

export const productionService = {
  // Obtener todos los lotes
  getBatches: async (): Promise<ProductionBatch[]> => {
    const response = await axiosClient.get('/production/');
    return response.data;
  },
  
  // Crear un nuevo lote 
  createBatch: async (data: { folio: string; batch_type: string; estimated_merma_percent?: number }): Promise<ProductionBatch> => {
    const response = await axiosClient.post('/production/', null, { params: data });
    return response.data;
  },

  // Asignar bultos/instancias a un lote
  assignInstanceToBatch: async (batchId: number, instanceId: number) => {
    const response = await axiosClient.post(`/production/${batchId}/assign_instance/${instanceId}`);
    return response.data;
  },

  // Actualizar el estatus del lote (Drag & Drop)
  updateBatchStatus: async (batchId: number, newStatus: string): Promise<ProductionBatch> => {
    // Asumimos que el backend recibirá el nuevo estatus vía query params
    const response = await axiosClient.patch(`/production/${batchId}/status`, null, { params: { status: newStatus } });
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
};