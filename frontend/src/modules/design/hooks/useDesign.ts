import { useState, useCallback } from 'react';
import { designService } from '../../../api/design-service';
import { ProductMaster, ProductVersion, VersionStatus } from '../../../types/design';

export const useDesign = () => {
    // --- ESTADOS ---
    const [masters, setMasters] = useState<ProductMaster[]>([]);
    const [currentMaster, setCurrentMaster] = useState<ProductMaster | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // --- ACCIONES (FUNCTIONS) ---

    /**
     * Carga el listado de familias de productos (Maestros)
     */
    const loadMasters = useCallback(async (clientId?: number) => {
        setLoading(true);
        setError(null);
        try {
            const data = await designService.getMasters(clientId);
            setMasters(data);
        } catch (err: any) {
            console.error("Error loading masters:", err);
            setError(err.response?.data?.detail || 'Error al cargar los diseños.');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Crea una nueva familia de productos
     */
    const addMaster = useCallback(async (masterData: Omit<ProductMaster, 'id' | 'created_at' | 'versions'>) => {
        setLoading(true);
        setError(null);
        try {
            const newMaster = await designService.createMaster(masterData);
            // Actualizamos la lista localmente agregando el nuevo al inicio
            setMasters(prev => [newMaster, ...prev]);
            return newMaster;
        } catch (err: any) {
            console.error("Error creating master:", err);
            setError(err.response?.data?.detail || 'Error al crear el diseño.');
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Actualiza un Maestro existente (Nombre, Categoría, Cliente)
     * --- NUEVA FUNCIÓN AGREGADA ---
     */
    const updateMaster = useCallback(async (id: number, masterData: Partial<ProductMaster>) => {
        setLoading(true);
        setError(null);
        try {
            // Nota: Asumimos que designService tiene updateMaster. Si no, habrá que agregarlo al servicio después.
            const updatedMaster = await designService.updateMaster(id, masterData);
            
            // Actualizamos la lista localmente
            setMasters(prev => prev.map(m => m.id === id ? updatedMaster : m));
            
            // Si estamos viendo el detalle de este maestro, actualizarlo también
            if (currentMaster && currentMaster.id === id) {
                setCurrentMaster(prev => prev ? { ...prev, ...updatedMaster } : null);
            }
            
            return updatedMaster;
        } catch (err: any) {
            console.error("Error updating master:", err);
            setError(err.response?.data?.detail || 'Error al actualizar el diseño.');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [currentMaster]);

    /**
     * Elimina un Maestro
     * --- NUEVA FUNCIÓN AGREGADA ---
     */
    const deleteMaster = useCallback(async (id: number) => {
        setLoading(true);
        setError(null);
        try {
            // Nota: Asumimos que designService tiene deleteMaster.
            await designService.deleteMaster(id);
            
            // Eliminamos del estado local
            setMasters(prev => prev.filter(m => m.id !== id));
            
            // Si estábamos viendo el detalle del eliminado, limpiar
            if (currentMaster && currentMaster.id === id) {
                setCurrentMaster(null);
            }
        } catch (err: any) {
            console.error("Error deleting master:", err);
            setError(err.response?.data?.detail || 'No se pudo eliminar. Verifica que no tenga recetas activas.');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [currentMaster]);

    /**
     * Carga el detalle de un Maestro (incluyendo sus versiones)
     */
    const loadMasterDetail = useCallback(async (masterId: number) => {
        setLoading(true);
        setError(null);
        try {
            const data = await designService.getMasterDetail(masterId);
            setCurrentMaster(data);
        } catch (err: any) {
            console.error("Error loading master detail:", err);
            setError(err.response?.data?.detail || 'Error al cargar detalles.');
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Crea una nueva Versión (Receta) para el Maestro actual
     */
    const addVersion = useCallback(async (versionData: Omit<ProductVersion, 'id' | 'created_at' | 'estimated_cost'>) => {
        setLoading(true);
        setError(null);
        try {
            const newVersion = await designService.createVersion(versionData);
            
            // Si estamos viendo el detalle de un maestro, actualizamos su lista de versiones
            if (currentMaster && currentMaster.id === versionData.master_id) {
                const updatedVersions = currentMaster.versions ? [...currentMaster.versions, newVersion] : [newVersion];
                setCurrentMaster({ ...currentMaster, versions: updatedVersions });
            }
            return newVersion;
        } catch (err: any) {
            console.error("Error creating version:", err);
            setError(err.response?.data?.detail || 'Error al guardar la versión.');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [currentMaster]);

    /**
     * Publica una versión (DRAFT -> READY)
     */
    const publishVersion = useCallback(async (versionId: number) => {
        setLoading(true);
        setError(null);
        try {
            const updatedVersion = await designService.updateVersionStatus(versionId, VersionStatus.READY);
            
            // Actualizar estado local
            if (currentMaster && currentMaster.versions) {
                const updatedVersions = currentMaster.versions.map(v => 
                    v.id === versionId ? updatedVersion : v
                );
                setCurrentMaster({ ...currentMaster, versions: updatedVersions });
            }
            return updatedVersion;
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al publicar la versión.');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [currentMaster]);

    return {
        masters,
        currentMaster,
        loading,
        error,
        loadMasters,
        addMaster,
        updateMaster, // <--- EXPORTADO
        deleteMaster, // <--- EXPORTADO
        loadMasterDetail,
        addVersion,
        publishVersion
    };
};