import { useState, useCallback } from 'react';
import client from '../../../api/axios-client';
import { toast } from 'sonner'; // Asumimos Sonner o tu librería de Toast preferida

// Interfaces locales (idealmente mover a types/design.ts si crecen)
interface OrderItem {
    id: number;
    product_name: string;
    quantity: number;
    sku: string;
}

interface PendingOrder {
    id: number;
    client_name: string;
    order_date: string;
    items: OrderItem[];
}

interface ProductionBatch {
    id: number;
    code: string;
    status: 'draft' | 'confirmed' | 'in_production';
    created_at: string;
    orders_count: number;
}

export const useProductionBatches = () => {
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
    const [batches, setBatches] = useState<ProductionBatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 1. Obtener Órdenes de Venta "Aprobadas" pendientes de Lote
    const fetchPendingOrders = useCallback(async () => {
        setLoading(true);
        try {
            // Endpoint teórico: obtiene órdenes con status 'payment_confirmed' pero sin lote
            const { data } = await client.get('/design/orders/pending-production');
            setPendingOrders(data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error al cargar órdenes pendientes');
            toast.error("No se pudieron cargar las órdenes pendientes");
        } finally {
            setLoading(false);
        }
    }, []);

    // 2. Obtener Lotes Existentes
    const fetchBatches = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await client.get('/design/batches');
            setBatches(data);
        } catch (err: any) {
            toast.error("Error al cargar lotes de producción");
        } finally {
            setLoading(false);
        }
    }, []);

    // 3. Crear Lote (Agrupación Manual)
    // Recibe un array de IDs de Órdenes de Venta
    const createBatch = async (orderIds: number[], notes?: string) => {
        if (orderIds.length === 0) return;
        setLoading(true);
        try {
            const { data } = await client.post('/design/batches', {
                order_ids: orderIds,
                notes: notes
            });
            toast.success(`Lote ${data.code} creado exitosamente`);
            // Refrescamos las listas
            await fetchPendingOrders();
            await fetchBatches();
            return data;
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Error al crear el lote';
            toast.error(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // 4. Trigger de Inventario (Hard Allocation)
    // Valida recetas vs stock y "congela" los materiales
    const reserveStockForBatch = async (batchId: number) => {
        setLoading(true);
        try {
            const { data } = await client.post(`/design/batches/${batchId}/reserve-stock`);
            
            if (data.status === 'insufficient_stock') {
                toast.warning(`Stock insuficiente. Faltantes: ${data.missing_items.length} materiales.`);
                return false; // Retorna false para que la UI muestre alerta
            }

            toast.success("Materiales reservados y stock comprometido correctamente");
            await fetchBatches();
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Error al reservar stock');
            return false;
        } finally {
            setLoading(false);
        }
    };

    return {
        pendingOrders,
        batches,
        loading,
        error,
        fetchPendingOrders,
        fetchBatches,
        createBatch,
        reserveStockForBatch
    };
};