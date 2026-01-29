import { useState, useEffect, useCallback } from 'react'; // <--- 1. IMPORTAR useCallback
import client from '../../../api/axios-client';

export interface Provider {
  id?: number;
  business_name: string;
  legal_name?: string;
  rfc_tax_id: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  credit_days: number;
}

export const useProviders = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const BASE_URL = '/foundations/providers';

  // --- CORRECCIÓN CRÍTICA: ENVOLVER EN useCallback ---
  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get(BASE_URL);
      if (Array.isArray(data)) {
        setProviders(data);
      } else {
        setProviders([]);
      }
    } catch (error) {
      console.error("Error cargando proveedores:", error);
      setProviders([]); 
    } finally {
      setLoading(false);
    }
  }, []); // <--- Array vacío: La función nunca cambiará de identidad

  // Efecto inicial
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const createProvider = async (provider: Provider) => {
    try {
      await client.post(BASE_URL, provider);
      await fetchProviders();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.detail || "Error al crear" };
    }
  };

  const updateProvider = async (id: number, provider: Provider) => {
    try {
      await client.put(`${BASE_URL}/${id}`, provider);
      await fetchProviders();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.detail || "Error al actualizar" };
    }
  };

  const deleteProvider = async (id: number) => {
    if (!window.confirm("¿Confirma que desea eliminar este proveedor?")) return;
    try {
      await client.delete(`${BASE_URL}/${id}`);
      await fetchProviders();
    } catch (error) {
      alert("No se pudo eliminar.");
    }
  };

  return { 
      providers, 
      loading, 
      fetchProviders, 
      createProvider, 
      updateProvider, 
      deleteProvider 
  };
};