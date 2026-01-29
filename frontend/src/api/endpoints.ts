// frontend/src/api/endpoints.ts

export const API_ROUTES = {
    // --- AUTENTICACIÓN ---
    AUTH: {
        LOGIN: '/auth/login',
        ME: '/auth/me',
        USERS: '/auth/users',
    },

    // --- CIMIENTOS (Foundations) ---
    FOUNDATIONS: {
        CLIENTS: '/foundations/clients',
        PROVIDERS: '/foundations/providers',
        MATERIALS: '/foundations/materials',
        TAX_RATES: '/foundations/tax-rates',
        GLOBAL_CONFIG: '/foundations/config',
        UPLOAD_LOGO: '/foundations/config/upload-logo',
    },

    // --- INGENIERÍA (Design) ---
    DESIGN: {
        MASTERS: '/design/masters', 
        
        // === CORRECCIÓN AQUÍ: Agregamos el alias PRODUCTS ===
        PRODUCTS: '/design/masters', 
        
        MASTER_DETAIL: (id: number) => `/design/masters/${id}`, 
        
        // Rutas para navegar del Concepto a sus Versiones
        VERSIONS_BY_MASTER: (masterId: number) => `/design/masters/${masterId}/versions`,
        
        VERSIONS: '/design/versions', 
        
        // Ruta crítica para el "Constructor de Recetas"
        VERSION_DETAIL: (id: number) => `/design/versions/${id}`, 
        
        // Ruta para cambiar estado: Borrador -> Listo (Ready)
        VERSION_STATUS: (id: number) => `/design/versions/${id}/status`,
    },

    // --- VENTAS (Sales) ---
    SALES: {
        ORDERS: '/sales/orders', 
        ORDER_DETAIL: (id: number) => `/sales/orders/${id}`, 
        ORDER_STATUS: (id: number) => `/sales/orders/${id}/status`, 
    },
};