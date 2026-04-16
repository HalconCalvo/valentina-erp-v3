export interface Material {
    id?: number;
    sku: string;
    name: string;
    category: string;
    
    // ENUM estricto para coincidir con backend y evitar errores de dedo
    production_route: 'MATERIAL' | 'PROCESO' | 'CONSUMIBLE' | 'SERVICIO';
    
    purchase_unit: string;
    usage_unit: string;
    conversion_factor: number;
    current_cost: number;
    
    // Vinculación
    associated_element_sku?: string | null;
    provider_id?: number | null;

    // Stocks (Backend siempre los envía, aunque sean 0)
    physical_stock: number;
    committed_stock: number; 

    // Control
    is_active: boolean;
}

export interface Provider {
    id?: number;
    
    // Datos Generales
    business_name: string;
    legal_name?: string;
    rfc_tax_id?: string;
    email?: string;
    phone?: string;
    phone2?: string;           // <--- NUEVO
    
    // Datos del Contacto Principal
    contact_name?: string;
    contact_email?: string;    // <--- NUEVO
    contact_cellphone?: string;// <--- NUEVO
    
    // Comercial
    credit_days: number;
    is_active: boolean;
}

export interface Client {
    id?: number;
    full_name: string;
    email: string;
    phone: string;
    rfc_tax_id?: string;
    fiscal_address?: string;
    
    // Contacto 1
    contact_name?: string;
    contact_phone?: string;
    contact_dept?: string;     // <--- NUEVO
    contact_email?: string;    // <--- NUEVO
    
    // Contacto 2
    contact2_name?: string;    // <--- NUEVO
    contact2_phone?: string;   // <--- NUEVO
    contact2_dept?: string;    // <--- NUEVO
    contact2_email?: string;   // <--- NUEVO
    
    // Contacto 3
    contact3_name?: string;    // <--- NUEVO
    contact3_phone?: string;   // <--- NUEVO
    contact3_dept?: string;    // <--- NUEVO
    contact3_email?: string;   // <--- NUEVO
    
    // Contacto 4
    contact4_name?: string;    // <--- NUEVO
    contact4_phone?: string;   // <--- NUEVO
    contact4_dept?: string;    // <--- NUEVO
    contact4_email?: string;   // <--- NUEVO
    
    notes?: string;
    registration_date?: string;
    is_active: boolean;
}

export interface TaxRate {
    id: number; // Siempre existe al leer configuración
    name: string;
    rate: number;
    is_active: boolean;
}

export interface GlobalConfig {
    id?: number;
    
    // --- VARIABLES DE NEGOCIO ---
    target_profit_margin: number;
    cost_tolerance_percent: number;
    quote_validity_days: number;
    default_edgebanding_factor: number;
    default_tax_rate_id?: number | null;

    // --- METAS FINANCIERAS (Dashboard Directivo) ---
    annual_sales_target: number;
    last_year_sales: number;

    // --- NÓMINA A DESTAJO (Tabulador Global de Instaladores) ---
    default_leader_daily_rate: number;
    default_helper_daily_rate: number;

    // --- IDENTIDAD CORPORATIVA ---
    company_name: string;
    company_rfc?: string;
    company_address?: string;
    company_phone?: string;
    company_email?: string;
    company_website?: string;
    
    // Logo
    logo_path?: string | null; 
    updated_at?: string;
}