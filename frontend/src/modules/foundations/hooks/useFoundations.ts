import { useState, useEffect, useCallback } from 'react';
import client from '@/api/axios-client'; 
import { GlobalConfig, TaxRate } from '@/types/foundations'; 

export const useFoundations = () => {
    const [config, setConfig] = useState<GlobalConfig | null>(null);
    const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // --- 1. CARGAR DATOS (Lógica Central) ---
    const refreshData = useCallback(async () => {
        try {
            setLoading(true);
            const [configRes, taxRes] = await Promise.all([
                client.get('/foundations/config'),   
                client.get('/foundations/tax-rates')
            ]);
            setConfig(configRes.data);
            setTaxRates(taxRes.data);
            setError(null);
        } catch (err) {
            console.error("Error cargando datos:", err);
            setError('Error cargando configuración del servidor.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Carga inicial automática
    useEffect(() => {
        refreshData();
    }, [refreshData]);

    // --- 2. GUARDAR CONFIGURACIÓN (Texto y Reglas) ---
    const updateConfig = async (updatedData: Partial<GlobalConfig>) => {
        setSaving(true);
        try {
            const { data } = await client.put('/foundations/config', updatedData);
            setConfig(data);
            return { success: true };
        } catch (err) {
            console.error("Error guardando config:", err);
            return { success: false };
        } finally {
            setSaving(false);
        }
    };

    // --- 3. GESTIÓN DE IMPUESTOS ---
    const createTaxRate = async (name: string, rate: number) => {
        setSaving(true);
        try {
            // Enviamos is_active: true por defecto
            await client.post('/foundations/tax-rates', { name, rate, is_active: true });
            await refreshData(); // Recargamos la lista para ver el nuevo
            return { success: true };
        } catch (err) {
            console.error("Error creando impuesto:", err);
            return { success: false, error: 'Error al crear impuesto' };
        } finally {
            setSaving(false);
        }
    };

    // NUEVO: Función para actualizar impuesto
    const updateTaxRate = async (id: number, name: string, rate: number) => {
        setSaving(true);
        try {
            await client.put(`/foundations/tax-rates/${id}`, { name, rate });
            await refreshData(); // Recargamos la lista
            return { success: true };
        } catch (err) {
            console.error("Error actualizando impuesto:", err);
            return { success: false, error: 'Error al actualizar impuesto' };
        } finally {
            setSaving(false);
        }
    };

    // NUEVO: Función para eliminar impuesto
    const deleteTaxRate = async (id: number) => {
        setSaving(true);
        try {
            await client.delete(`/foundations/tax-rates/${id}`);
            await refreshData(); // Recargamos la lista
            return { success: true };
        } catch (err) {
            console.error("Error eliminando impuesto:", err);
            return { success: false, error: 'Error al eliminar impuesto' };
        } finally {
            setSaving(false);
        }
    };

    const toggleTaxRate = async (id: number) => {
        try {
            await client.put(`/foundations/tax-rates/${id}/toggle`);
            await refreshData(); // Recargamos para ver el cambio de estatus
            return { success: true };
        } catch (err) {
            console.error("Error cambiando estado impuesto:", err);
            return { success: false };
        }
    };

    // --- 4. GESTIÓN DE LOGO ---
    const uploadLogo = async (file: File) => {
        setSaving(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await client.post('/foundations/config/upload-logo', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            
            if (config) {
                setConfig({ ...config, logo_path: response.data.url });
            }
            return true;
        } catch (err) {
            console.error("Error subiendo logo:", err);
            return false;
        } finally {
            setSaving(false);
        }
    };

    return { 
        config, 
        taxRates, 
        loading, 
        error, 
        saving, 
        
        // --- API PÚBLICA ---
        fetchConfig: refreshData, 
        refreshData,              
        updateConfig, 
        
        // Impuestos
        createTaxRate,
        updateTaxRate,    // <-- Añadido aquí
        deleteTaxRate,    // <-- Añadido aquí
        toggleTaxRate,

        // Logo
        uploadLogo
    };
};