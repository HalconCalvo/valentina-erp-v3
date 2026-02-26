import axiosClient from './axios-client';
import { API_ROUTES } from './endpoints';
import { ProductMaster, ProductVersion, VersionStatus } from '../types/design';

export const designService = {
    // ==========================================
    // MAESTROS (Familias de Productos)
    // ==========================================
    
    /**
     * Obtiene la lista de todos los Maestros de Producto.
     * @param clientId (Opcional) Filtrar por cliente.
     * @param onlyReady (Opcional) Si es true, SOLO devuelve productos con versión LISTA (útil para Ventas).
     */
    getMasters: async (clientId?: number, onlyReady?: boolean): Promise<ProductMaster[]> => {
        // Construimos los parámetros dinámicamente
        const params: any = {};
        
        if (clientId) {
            params.client_id = clientId;
        }
        
        // Aquí pasamos la señal al Backend
        if (onlyReady) {
            params.only_ready = true;
        }

        const response = await axiosClient.get(API_ROUTES.DESIGN.MASTERS, { params });
        return response.data;
    },

    /**
     * Crea un nuevo Maestro (Familia).
     */
    createMaster: async (master: Omit<ProductMaster, 'id' | 'created_at' | 'versions'>): Promise<ProductMaster> => {
        const response = await axiosClient.post(API_ROUTES.DESIGN.MASTERS, master);
        return response.data;
    },

    /**
     * Actualiza un Maestro existente.
     */
    updateMaster: async (id: number, master: Partial<ProductMaster>): Promise<ProductMaster> => {
        const url = `${API_ROUTES.DESIGN.MASTERS}/${id}`;
        const response = await axiosClient.put(url, master);
        return response.data;
    },

    /**
     * Elimina un Maestro existente.
     */
    deleteMaster: async (id: number): Promise<void> => {
        const url = `${API_ROUTES.DESIGN.MASTERS}/${id}`;
        await axiosClient.delete(url);
    },

    /**
     * Obtiene el detalle de un Maestro.
     */
    getMasterDetail: async (masterId: number): Promise<ProductMaster> => {
        const url = `${API_ROUTES.DESIGN.MASTERS}/${masterId}`; 
        const response = await axiosClient.get(url);
        return response.data;
    },

    /**
     * Sube un archivo (Plano PDF o Imagen) para un Producto Maestro.
     */
    uploadBlueprint: async (id: number, file: File): Promise<any> => {
        const url = `${API_ROUTES.DESIGN.MASTERS}/${id}/blueprint`;
        
        const formData = new FormData();
        formData.append('blueprint', file); 

        const response = await axiosClient.post(url, formData, {
            headers: {
                'Content-Type': 'multipart/form-data', 
            },
        });
        return response.data;
    },

    /**
     * Elimina el plano adjunto de un Maestro.
     */
    deleteBlueprint: async (id: number): Promise<void> => {
        const url = `${API_ROUTES.DESIGN.MASTERS}/${id}/blueprint`;
        await axiosClient.delete(url);
    },

    // ==========================================
    // VERSIONES (Recetas e Ingredientes)
    // ==========================================

    /**
     * Crea una nueva Versión con sus componentes.
     */
    createVersion: async (version: Omit<ProductVersion, 'id' | 'created_at' | 'estimated_cost'>): Promise<ProductVersion> => {
        const response = await axiosClient.post(API_ROUTES.DESIGN.VERSIONS, version);
        return response.data;
    },

    /**
     * Actualiza una versión existente (Para Guardar cambios en la Receta).
     */
    updateVersion: async (id: number, version: Partial<ProductVersion>): Promise<ProductVersion> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS}/${id}`;
        const response = await axiosClient.put(url, version);
        return response.data;
    },

    /**
     * Obtiene el detalle de una versión específica.
     */
    getVersion: async (versionId: number): Promise<ProductVersion> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS}/${versionId}`;
        const response = await axiosClient.get(url);
        return response.data;
    },

    /**
     * Actualiza el estatus de una versión (Borrador -> Listo).
     */
    updateVersionStatus: async (versionId: number, status: VersionStatus): Promise<ProductVersion> => {
        const url = API_ROUTES.DESIGN.VERSION_STATUS(versionId);
        const response = await axiosClient.patch(url, null, {
            params: { status }
        });
        return response.data;
    },

    /**
     * Renombra una versión de forma segura (PATCH ligero).
     */
    renameVersion: async (versionId: number, newName: string): Promise<ProductVersion> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS}/${versionId}/rename`;
        const response = await axiosClient.patch(url, null, {
            params: { new_name: newName }
        });
        return response.data;
    },

    /**
     * Elimina UNA SOLA versión sin afectar al Producto Maestro ni a otras versiones.
     */
    deleteVersion: async (versionId: number): Promise<void> => {
        const url = `${API_ROUTES.DESIGN.VERSIONS}/${versionId}`;
        await axiosClient.delete(url);
    }
};