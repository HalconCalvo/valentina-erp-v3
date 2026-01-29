import { useState, useCallback } from 'react';
import { salesService } from '../../../api/sales-service';
import { SalesOrder, SalesOrderStatus } from '../../../types/sales';

export const useSales = () => {
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [currentOrder, setCurrentOrder] = useState<SalesOrder | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- 1. LISTAR ORDENES (Con modo Silencioso) ---
    // Agregamos el parámetro 'silent' al final
    const fetchOrders = useCallback(async (status?: SalesOrderStatus, clientId?: number, silent: boolean = false) => {
        // Solo activamos el loading visual si NO es silencioso
        if (!silent) {
            setLoading(true);
        }
        
        setError(null);
        try {
            const data = await salesService.getOrders(status, clientId);
            setOrders(data);
        } catch (err: any) {
            console.error("Error al cargar órdenes:", err);
            // En modo silencioso, evitamos llenar la pantalla de errores si falla un ping
            if (!silent) {
                setError(err.response?.data?.detail || "Error al cargar el listado de ventas.");
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, []);

    // --- 2. DETALLE DE ORDEN ---
    const fetchOrderDetail = useCallback(async (orderId: number) => {
        setLoading(true);
        setError(null);
        try {
            const data = await salesService.getOrderDetail(orderId);
            setCurrentOrder(data);
            return data;
        } catch (err: any) {
            console.error("Error al cargar detalle:", err);
            setError(err.response?.data?.detail || "Error al cargar el detalle.");
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    // --- 3. CREAR COTIZACIÓN ---
    const createQuote = async (orderData: Omit<SalesOrder, 'id' | 'status' | 'created_at' | 'subtotal' | 'tax_amount' | 'total_price'>) => {
        setLoading(true);
        setError(null);
        try {
            const newOrder = await salesService.createOrder(orderData);
            setOrders(prev => [newOrder, ...prev]);
            return { success: true, order: newOrder };
        } catch (err: any) {
            console.error("Error al crear cotización:", err);
            const msg = err.response?.data?.detail || "No se pudo crear la cotización.";
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setLoading(false);
        }
    };

    // --- 4. ACTUALIZAR ESTATUS ---
    const updateOrderStatus = async (orderId: number, newStatus: SalesOrderStatus) => {
        setLoading(true);
        try {
            const updatedOrder = await salesService.updateOrder(orderId, { status: newStatus });
            
            setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
            
            if (currentOrder && currentOrder.id === orderId) {
                setCurrentOrder(updatedOrder);
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.response?.data?.detail || "Error al actualizar estatus." };
        } finally {
            setLoading(false);
        }
    };

    return {
        orders,
        currentOrder,
        loading,
        error,
        fetchOrders,
        fetchOrderDetail,
        createQuote,
        updateOrderStatus
    };
};