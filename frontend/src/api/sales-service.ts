import axiosClient from './axios-client';
import { API_ROUTES } from './endpoints';
import { SalesOrder, SalesOrderStatus } from '../types/sales';

export const salesService = {
    /**
     * Crea una nueva Cotización/Orden.
     * El Backend se encarga de generar el Snapshot de costos automáticamente.
     */
    createOrder: async (order: Omit<SalesOrder, 'id' | 'status' | 'created_at' | 'subtotal' | 'tax_amount' | 'total_price'>): Promise<SalesOrder> => {
        const response = await axiosClient.post(API_ROUTES.SALES.ORDERS, order);
        return response.data;
    },

    /**
     * Obtiene el listado de órdenes.
     * @param status (Opcional) Filtrar por estatus (DRAFT, SENT, etc.)
     * @param clientId (Opcional) Filtrar por cliente
     */
    getOrders: async (status?: SalesOrderStatus, clientId?: number): Promise<SalesOrder[]> => {
        const params: any = {};
        if (status) params.status = status;
        if (clientId) params.client_id = clientId;

        const response = await axiosClient.get(API_ROUTES.SALES.ORDERS, { params });
        return response.data;
    },

    /**
     * Obtiene el detalle completo de una orden específica (incluyendo items y totales).
     */
    getOrderDetail: async (orderId: number): Promise<SalesOrder> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId);
        const response = await axiosClient.get(url);
        return response.data;
    },

    /**
     * Actualiza una orden.
     * IMPORTANTE: Si se envía el campo 'items', el backend borrará los items anteriores
     * y creará los nuevos (Edición Completa).
     */
    updateOrder: async (orderId: number, data: Partial<SalesOrder>): Promise<SalesOrder> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId); 
        const response = await axiosClient.patch(url, data);
        return response.data;
    },

    /**
     * Elimina una orden de la base de datos.
     */
    deleteOrder: async (orderId: number): Promise<void> => {
        const url = API_ROUTES.SALES.ORDER_DETAIL(orderId);
        await axiosClient.delete(url);
    },

    /**
     * Descarga el PDF de la Cotización desde el Backend (Fuerza la descarga del archivo).
     */
    downloadPDF: async (orderId: number, fileName: string = 'Cotizacion.pdf') => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/pdf`;
        
        try {
            const response = await axiosClient.get(url, {
                responseType: 'blob',
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            link.href = downloadUrl;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            
            link.click();
            
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error("Error descargando PDF:", error);
            throw error;
        }
    },

    /**
     * Obtiene el BLOB del PDF para previsualización (NO descarga, solo retorna los datos).
     */
    getPdfPreview: async (orderId: number): Promise<Blob> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/pdf`;
        const response = await axiosClient.get(url, {
            responseType: 'blob',
        });
        return response.data; // Retorna el Blob directamente para usarlo en un iframe o visor
    },

    // =========================================================
    // --- FASE 1: AUTORIZACIÓN INTERNA (GERENCIA) ---
    // =========================================================

    /**
     * VENDEDOR: Solicita autorización (Cambia DRAFT -> SENT)
     */
    requestAuth: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/request-auth`;
        await axiosClient.post(url);
    },

    /**
     * DIRECTOR: Autoriza la cotización (Cambia SENT -> ACCEPTED)
     */
    authorizeOrder: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/authorize`;
        await axiosClient.post(url);
    },

    /**
     * DIRECTOR: Rechaza la cotización (Cambia SENT -> REJECTED)
     */
    rejectOrder: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/reject`;
        await axiosClient.post(url);
    },

    // =========================================================
    // --- FASE 2: CIERRE CON CLIENTE (VENTAS) ---
    // =========================================================

    /**
     * VENTA CERRADA: El cliente aceptó y pagó (ACCEPTED -> SOLD)
     */
    markAsSold: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/mark_sold`;
        await axiosClient.post(url);
    },

    /**
     * VENTA PERDIDA: El cliente rechazó la propuesta (ACCEPTED -> CLIENT_REJECTED)
     */
    markAsLost: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/mark_lost`;
        await axiosClient.post(url);
    },

    /**
     * SOLICITAR CAMBIOS: El cliente pide ajustes (ACCEPTED -> CHANGE_REQUESTED/DRAFT)
     * Esto desbloquea la cotización para edición.
     */
    requestChanges: async (orderId: number): Promise<void> => {
        const url = `${API_ROUTES.SALES.ORDER_DETAIL(orderId)}/request_changes`;
        await axiosClient.post(url);
    }
};