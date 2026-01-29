import { useState, useEffect, useCallback } from 'react';
// Ajustamos la importación para ser consistentes con el resto del proyecto
import client from '../../../api/axios-client';
// Si tienes un archivo de tipos, úsalo, si no, puedes definir la interfaz aquí mismo para evitar errores de compilación
// import { Material } from '../types/foundations';

export interface Material {
    id: number;
    sku: string;
    name: string;
    usage_unit: string;
    physical_stock: number;
    current_cost: number;
    // ... otros campos
}

export const useMaterials = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);

  const BASE_URL = '/foundations/materials';

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get(BASE_URL);
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

  return { 
    materials, 
    loading, 
    fetchMaterials, // <--- ¡ESTA ERA LA PIEZA FALTANTE!
    createMaterial, 
    updateMaterial, 
    deleteMaterial 
  };
};