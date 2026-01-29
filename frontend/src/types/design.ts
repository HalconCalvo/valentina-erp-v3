// frontend/src/types/design.ts

// Estatus de la Versión (Igual que en Backend)
export enum VersionStatus {
    DRAFT = "DRAFT",      // Borrador (Solo Diseño ve esto)
    READY = "READY",      // Listo (Ventas ya puede cotizar esto)
    OBSOLETE = "OBSOLETE" // Histórico (No borrar, solo ocultar)
}

// Nivel 3: Ingrediente (Componente de la Receta)
export interface VersionComponent {
    id?: number;           // Opcional (undefined = nuevo item en memoria)
    material_id: number;
    quantity: number;
    
    // --- CAMPOS VISUALES (UI HELPERS) ---
    temp_material_sku?: string;        // Para mostrar "MDF-BLANCO-16"
    temp_material_name?: string;       // Para mostrar "MDF Blanco 16mm Dos Caras"
    temp_category?: string;            // CRÍTICO: Para saber si dispara cálculo de cubrecanto
    temp_associated_sku?: string;      // CRÍTICO: El SKU del cubrecanto que le toca
    
    temp_unit_cost?: number;           // Costo unitario actual (Referencia)
    temp_line_cost?: number;           // quantity * unit_cost (Subtotal visual)
    
    // Flag para la UI: ¿Este renglón fue calculado automáticamente?
    ui_is_calculated?: boolean; 
}

// Nivel 2: Versión (La Receta Específica)
export interface ProductVersion {
    id?: number;
    master_id: number;
    version_name: string;      // Ej: "V1.0 - Correderas Cierre Suave"
    status: VersionStatus;
    estimated_cost: number;    // Suma de los componentes al momento de guardar
    is_active: boolean;
    created_at?: string;
    
    // La lista de ingredientes
    components: VersionComponent[];
}

// Nivel 1: Maestro (La Familia del Producto)
export interface ProductMaster {
    id?: number;
    client_id: number;
    name: string;              // Ej: "Cocina Tipo A - Torre 1"
    category: string;          // Ej: "Cocinas", "Closets", "Vanities"
    is_active: boolean;
    created_at?: string;

    // --- NUEVO CAMPO PARA PLANOS ---
    blueprint_path?: string | null; 
    
    // Helper para mostrar el nombre del cliente en tablas sin hacer otro JOIN
    client_name?: string; 
    
    // El backend puede devolver las versiones anidadas para el árbol de navegación
    versions?: ProductVersion[];
}