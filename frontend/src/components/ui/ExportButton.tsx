import React from 'react';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import Button from './Button';

interface ExportButtonProps {
    data: any[];           // Los datos a exportar (ej. materials, clients)
    fileName?: string;     // Nombre del archivo (ej. "Materiales_2024")
    mapping?: (item: any) => any; // Opcional: Función para limpiar/formatear datos
    label?: string;        // Texto del botón
}

const ExportButton: React.FC<ExportButtonProps> = ({ 
    data, 
    fileName = 'Reporte', 
    mapping,
    label = "Exportar Excel"
}) => {

    const handleExport = () => {
        if (!data || data.length === 0) {
            alert("No hay datos para exportar.");
            return;
        }

        // 1. Preparar los datos
        // Si hay función de mapeo, la usamos para dar formato bonito a las columnas
        const dataToExport = mapping ? data.map(mapping) : data;

        // 2. Crear hoja de cálculo
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Datos");

        // 3. Generar archivo y descargar
        // Agregamos fecha al nombre para que no se sobrescriba
        const dateStr = new Date().toISOString().split('T')[0];
        const finalName = `${fileName}_${dateStr}.xlsx`;
        
        XLSX.writeFile(workbook, finalName);
    };

    return (
        <Button 
            variant="secondary" 
            onClick={handleExport} 
            className="flex items-center gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            title="Descargar reporte en Excel"
        >
            <Download size={16} />
            <span className="hidden md:inline">{label}</span>
        </Button>
    );
};

export default ExportButton;