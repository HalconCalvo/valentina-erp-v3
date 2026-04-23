import axiosClient from './axios-client';
import { API_ROUTES } from './endpoints';
import { ProductMaster, ProductVersion, VersionStatus } from '../types/design';

// --- NUEVAS INTERFACES PARA EL SIMULADOR ---
export interface PendingInstance {
  id: number;
  custom_name: string;
  product_name: string;
  order_project_name: string;
  order_id: number;
  client_name?: string | null;
  semaphore?: string | null;
  schedule?: {
    PM: string | null;
    PP: string | null;
    IM: string | null;
    IP: string | null;
  } | null;
}

export interface SimulatedMaterial {
  material_id: int;
  sku: string;
  name: string;
  category: string;
  required_qty: number;
  available_qty: number;
  is_blocking: boolean;
  status_color: 'RED' | 'YELLOW' | 'GREEN';
}

export interface SimulateBatchResponse {
  suggested_status: string;
  materials: SimulatedMaterial[];
}

export interface LabelRequestItem {
  instance_id: number;
  custom_name: string;
  client_name: string;
  project_name: string;
  declared_bundles: number;
  is_stone: boolean;
}

export const designService = {
    // ==========================================
    // MAESTROS (Familias de Productos)
    // ==========================================
    getMasters: async (clientId?: number, onlyReady?: boolean): Promise<ProductMaster[]> => {
        const params: any = {};
        if (clientId) params.client_id = clientId;
        if (onlyReady) params.only_ready = true;
        const response = await axiosClient.get(API_ROUTES.DESIGN.MASTERS || '/design/masters', { params });
        return response.data;
    },

    createMaster: async (master: Omit<ProductMaster, 'id' | 'created_at' | 'versions'>): Promise<ProductMaster> => {
        const response = await axiosClient.post(API_ROUTES.DESIGN.MASTERS || '/design/masters', master);
        return response.data;
    },

    updateMaster: async (id: number, master: Partial<ProductMaster>): Promise<ProductMaster> => {
        const url = `${API_ROUTES.DESIGN.MASTERS || '/design/masters'}/${id}`;
        const response = await axiosClient.put(url, master);
        return response.data;
    },

    deleteMaster: async (id: number): Promise<void> => {
        const url = `${API_ROUTES.DESIGN.MASTERS || '/design/masters'}/${id}`;
        await axiosClient.delete(url);
    },

    getMasterDetail: async (masterId: number): Promise<ProductMaster> => {
        const url = `${API_ROUTES.DESIGN.MASTERS || '/design/masters'}/${masterId}`; 
        const response = await axiosClient.get(url);
        return response.data;
    },

    uploadBlueprint: async (id: number, file: File): Promise<any> => {
        const url = `${API_ROUTES.DESIGN.MASTERS || '/design/masters'}/${id}/blueprint`;
        const formData = new FormData();
        formData.append('blueprint', file); 
        const response = await axiosClient.post(url, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    deleteBlueprint: async (id: number): Promise<void> => {
        const url = `${API_ROUTES.DESIGN.MASTERS || '/design/masters'}/${id}/blueprint`;
        await axiosClient.delete(url);
    },

    // ==========================================
    // VERSIONES (Recetas e Ingredientes)
    // ==========================================
    createVersion: async (version: Omit<ProductVersion, 'id' | 'created_at' | 'estimated_cost'>): Promise<ProductVersion> => {
        const response = await axiosClient.post(API_ROUTES.DESIGN.VERSIONS || '/design/versions', version);
        return response.data;
    },

    updateVersion: async (id: number, version: Partial<ProductVersion>): Promise<ProductVersion> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS || '/design/versions'}/${id}`;
        const response = await axiosClient.put(url, version);
        return response.data;
    },

    getVersion: async (versionId: number): Promise<ProductVersion> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS || '/design/versions'}/${versionId}`;
        const response = await axiosClient.get(url);
        return response.data;
    },

    updateVersionStatus: async (versionId: number, status: VersionStatus): Promise<ProductVersion> => {
        const url = API_ROUTES.DESIGN.VERSION_STATUS ? API_ROUTES.DESIGN.VERSION_STATUS(versionId) : `/design/versions/${versionId}/status`;
        const response = await axiosClient.patch(url, null, { params: { status } });
        return response.data;
    },

    renameVersion: async (versionId: number, newName: string): Promise<ProductVersion> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS || '/design/versions'}/${versionId}/rename`;
        const response = await axiosClient.patch(url, null, { params: { new_name: newName } });
        return response.data;
    },

    deleteVersion: async (versionId: number): Promise<void> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS || '/design/versions'}/${versionId}`;
        await axiosClient.delete(url);
    },

    // ==========================================
    // SIMULADOR Y LOTIFICACIÓN (NUEVO)
    // ==========================================
    getPendingInstances: async (batchType: string = 'MDF'): Promise<PendingInstance[]> => {
        const url = '/design/pending_instances';
        const response = await axiosClient.get(url, {
            params: { batch_type: batchType },
        });
        return response.data;
    },

    simulateBatch: async (instanceIds: number[], batchType: string): Promise<SimulateBatchResponse> => {
        const url = '/design/simulate_batch';
        const response = await axiosClient.post(url, {
            instance_ids: instanceIds,
            batch_type: batchType
        });
        return response.data;
    },

    getLabelRequests: async (): Promise<LabelRequestItem[]> => {
        const response = await axiosClient.get('/design/label_requests');
        return response.data;
    },
};