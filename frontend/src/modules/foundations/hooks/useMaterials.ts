import { useState, useEffect, useCallback } from 'react';
import client from '../../../api/axios-client';
import { Material } from '../../../types/foundations';

export const useMaterials = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);

  const BASE_URL = '/foundations/materials';

  const fetchMaterials = useCallback(async (includeInactive = false) => {
    setLoading(true);
    try {
      const url = includeInactive ? `${BASE_URL}?include_inactive=true` : BASE_URL;
      const { data } = await client.get(url);
      // VALIDACIÓN DE SEGURIDAD (Evita pantalla blanca)
      if (Array.isArray(data)) {
        setMaterials(data);
      } else {
        console.warn("API Materiales no devolvió un array:", data);
        setMaterials([]);
      }
    } catch (error) {
      console.error("Error cargando materiales:", error);
      setMaterials([]); // Fallback seguro
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const createMaterial = async (data: Partial<Material>) => {
    try {
      await client.post(BASE_URL, data);
      await fetchMaterials(); 
      return { success: true };
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Error desconocido';
      return { success: false, error: msg };
    }
  };

  const updateMaterial = async (id: number, data: Partial<Material>) => {
    try {
      await client.put(`${BASE_URL}/${id}`, data);
      await fetchMaterials();
      return { success: true };
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Error desconocido';
      return { success: false, error: msg };
    }
  };

  const deleteMaterial = async (id: number) => {
    try {
      await client.delete(`${BASE_URL}/${id}`);
      await fetchMaterials();
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Error al eliminar' };
    }
  };

  const reactivateMaterial = async (id: number, includeInactive = false) => {
    try {
      await client.put(`${BASE_URL}/${id}`, { is_active: true });
      await fetchMaterials(includeInactive); // recargar respetando el filtro actual
      return { success: true };
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Error desconocido';
      return { success: false, error: msg };
    }
  };

  return { 
    materials, 
    loading, 
    fetchMaterials,
    createMaterial, 
    updateMaterial, 
    deleteMaterial,
    reactivateMaterial
  };
};