import { useState, useEffect, useCallback } from 'react';
// CORRECCIÓN 1: Ruta relativa exacta para evitar errores de compilación
import client from '../../../api/axios-client';

export interface Client {
    id?: number;
    full_name: string;
    rfc_tax_id?: string;
    email: string;
    phone: string;
    fiscal_address?: string;
    
    contact_name?: string;
    contact_phone?: string;
    contact_dept?: string;
    contact_email?: string;  // <--- NUEVO
    
    contact2_name?: string;
    contact2_phone?: string;
    contact2_dept?: string;
    contact2_email?: string; // <--- NUEVO
    
    contact3_name?: string;
    contact3_phone?: string;
    contact3_dept?: string;
    contact3_email?: string; // <--- NUEVO
    
    contact4_name?: string;
    contact4_phone?: string;
    contact4_dept?: string;
    contact4_email?: string; // <--- NUEVO
    
    notes?: string;
    registration_date?: string;
    is_active?: boolean;
}

export const useClients = () => {
  // CORRECCIÓN 2: Inicializar siempre como array vacío
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const BASE_URL = '/foundations/clients';

  // 1. OBTENER (GET)
  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await client.get(BASE_URL);
      // CORRECCIÓN 3: Validación defensiva. 
      // Solo asignamos si es un arreglo, si no, array vacío para no romper la tabla.
      if (Array.isArray(response.data)) {
        setClients(response.data);
      } else {
        console.warn("Respuesta inesperada de Clientes:", response.data);
        setClients([]);
      }
    } catch (error) {
      console.error("Error cargando clientes:", error);
      setClients([]); 
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // 2. CREAR (POST)
  const createClient = async (newClient: Client) => {
    try {
      await client.post(BASE_URL, newClient);
      await fetchClients(); 
      return { success: true };
    } catch (error: any) {
      console.error(error);
      return { success: false, error: error.response?.data?.detail || "Error al crear cliente" };
    }
  };

  // 3. ACTUALIZAR (PUT)
  const updateClient = async (id: number, updatedClient: Client) => {
    try {
      await client.put(`${BASE_URL}/${id}`, updatedClient);
      await fetchClients();
      return { success: true };
    } catch (error: any) {
      console.error(error);
      return { success: false, error: error.response?.data?.detail || "Error al actualizar cliente" };
    }
  };

  // 4. ELIMINAR (DELETE)
  const deleteClient = async (id: number) => {
    try {
      await client.delete(`${BASE_URL}/${id}`);
      await fetchClients();
      return { success: true };
    } catch (error: any) {
      console.error(error);
      return { success: false, error: error.response?.data?.detail || "Error al eliminar cliente" };
    }
  };

  return { 
    clients, 
    loading, 
    createClient, 
    updateClient, 
    deleteClient, 
    fetchClients 
  };
};