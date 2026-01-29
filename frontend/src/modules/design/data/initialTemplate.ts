export interface TemplateItem {
    sku: string;
    name: string;
    group: string;        
    category: string;     
    unit: string;         
    default_quantity: number;
    cost: number;
}

export const MASTER_TEMPLATE: TemplateItem[] = [
    // --- GABINETES (MATERIALES) ---
    { sku: 'MDFBCO152C', name: 'MDF TECNOTABLA Blanco 15 mm 2 Caras 4x8', group: 'Gabinetes', category: 'Tablero', unit: 'Pz', default_quantity: 0, cost: 443.97 },
    { sku: 'MDFNEG152C', name: 'MDF TECNOTABLA Negro Bruno 15 mm 2 Caras 4x8', group: 'Gabinetes', category: 'Tablero', unit: 'Pz', default_quantity: 0, cost: 799.14 },
    { sku: 'CHPCTA1BCO', name: 'Tapacanto o chapacinta PVC 1 mm Bco', group: 'Gabinetes', category: 'Chapacinta', unit: 'm', default_quantity: 0, cost: 5.33 },
    { sku: 'CHPCTA1COL', name: 'Tapacanto o chapacinta PVC 1 mm Color', group: 'Gabinetes', category: 'Chapacinta', unit: 'm', default_quantity: 0, cost: 5.33 },
    
    // --- GABINETES (HERRAJES Y TORNILLERÍA) ---
    { sku: '0601-368', name: 'Bisagra eco 110º sobrepuesta cuello 00 48 x 6mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Jgo', default_quantity: 0, cost: 5.94 },
    { sku: '0303-086', name: 'Corredera extension Cerrajes zincada 500mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Jgo', default_quantity: 0, cost: 35.98 },
    { sku: '0402-540', name: 'Jaladera barra 256mm cc - 316mm 4045 H14 8-32x22mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 18.82 },
    { sku: '0502-019', name: 'Tornillo sinker PH plano ngr #12 x 3', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.04 },
    { sku: '0508-084', name: 'Taquete plastico blanco 5/16 (8mm)', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 3.00 },
    { sku: '0502-002', name: 'Tornillo sinker PH plano ngr #8 x 1', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.01 },
    { sku: '0501-057', name: 'Tornillo gripper PH plano cabeza 120° nip #6x5/8', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.08 },
    { sku: '0502-004', name: 'Tornillo sinker PH plano ngr #8 x 1 1/2', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.01 },
    { sku: '0506-018', name: 'Tornillo recortable p/jaladera M4 x 38mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.22 },
    { sku: '0507-185', name: 'Perno atorn largo total 44mm rosca enganche 33mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.38 },
    { sku: '0507-169', name: 'Excentrico metalico 12 mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.61 },
    { sku: '0204-022', name: 'Tope gota transparente (288) d=10 h=3 bs-10', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.36 },
    { sku: '0508-051', name: 'Cubierta p/tornillo sinker 13mm de diam blanca', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.17 },
    { sku: '1205-055', name: 'Mensula niquel 5mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.22 },
    { sku: '1208-003', name: 'Pata plastica h=145-165', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 4.19 },
    { sku: '1208-005', name: 'Clip de enganche para pata', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 0.50 },
    { sku: '1208-007', name: 'Zoclo de plastico h=150mm L=4000mm recubierto de aluminio', group: 'Gabinetes', category: 'Herrajes', unit: 'm', default_quantity: 0, cost: 48.74 },
    { sku: '1208-011', name: 'Esquina 90° p/zoclo h150mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 7.55 },
    { sku: '1208-012', name: 'Conector recto p/zoclo h150mm', group: 'Gabinetes', category: 'Herrajes', unit: 'Pz', default_quantity: 0, cost: 7.92 },

    // --- GABINETES (PROCESOS E INSTALACIÓN) - LO QUE FALTABA ---
    { sku: 'Produc', name: 'Proceso de Producción por Hoja', group: 'Gabinetes', category: 'Proceso', unit: 'Hoja', default_quantity: 0, cost: 1168.00 },
    { sku: 'InstalaCocina', name: 'Instalacion de Cocina o Clóset', group: 'Gabinetes', category: 'Proceso', unit: 'Día', default_quantity: 0, cost: 1600.00 },

    // --- PIEDRA ---
    { sku: 'GRASNGAB', name: 'Granito Negro San Gabriel', group: 'Piedra', category: 'Piedra', unit: 'Placa', default_quantity: 0, cost: 8450.00 },
    { sku: 'MaqGRANITO', name: 'Maquila Granito ml', group: 'Piedra', category: 'Proceso', unit: 'm', default_quantity: 0, cost: 321.41 },
    { sku: 'InstalaGranito', name: 'Instalacion de Granito ml', group: 'Piedra', category: 'Proceso', unit: 'Día', default_quantity: 0, cost: 1600.00 },

    // --- OTROS ---
    { sku: 'Viáticos', name: 'Viáticos', group: 'Otros', category: 'Especial', unit: 'Día', default_quantity: 0, cost: 2000.00 },
];