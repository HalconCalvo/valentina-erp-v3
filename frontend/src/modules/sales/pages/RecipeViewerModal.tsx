import React from 'react';
import { X, FileText, Package, DollarSign, Layers } from 'lucide-react';
import { SalesOrderItem } from '../../../types/sales';

interface RecipeViewerModalProps {
    item: SalesOrderItem | null;
    onClose: () => void;
}

export const RecipeViewerModal: React.FC<RecipeViewerModalProps> = ({ item, onClose }) => {
    if (!item) return null;

    const formatCurrency = (amount: number | any) => {
        const num = Number(amount);
        if (isNaN(num)) return '$ 0.00';
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
    };

    // Extraemos la caja fuerte de manera segura
    let recipeData: any = {};
    try {
        if (typeof item.cost_snapshot === 'string') {
            recipeData = JSON.parse(item.cost_snapshot);
        } else if (item.cost_snapshot) {
            recipeData = item.cost_snapshot;
        }
    } catch (e) {
        console.error("Error leyendo la receta", e);
    }

    const hasData = Object.keys(recipeData).length > 0;
    const margin = item.unit_price > 0 ? (((item.unit_price - (item.frozen_unit_cost || 0)) / item.unit_price) * 100) : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* HEADER */}
                <div className="bg-slate-800 p-5 flex justify-between items-center text-white">
                    <div>
                        <h2 className="text-xl font-black flex items-center gap-2">
                            <Layers className="text-indigo-400" /> Radiografía de Instancia
                        </h2>
                        <p className="text-slate-400 text-sm mt-1 font-medium">{item.product_name}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-700 p-2 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* RESUMEN FINANCIERO SUPERIOR */}
                <div className="bg-indigo-50 border-b border-indigo-100 p-4 grid grid-cols-3 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Costo Unitario (Congelado)</p>
                        <p className="text-xl font-black text-slate-700 font-mono">{formatCurrency(item.frozen_unit_cost)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Precio de Venta</p>
                        <p className="text-xl font-black text-indigo-700 font-mono">{formatCurrency(item.unit_price)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Margen Real</p>
                        <p className={`text-xl font-black font-mono ${margin >= 20 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {margin.toFixed(1)}%
                        </p>
                    </div>
                </div>

                {/* CONTENIDO DE LA RECETA */}
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                    {!hasData ? (
                        <div className="text-center py-12 flex flex-col items-center">
                            <FileText size={48} className="text-slate-300 mb-4 opacity-50"/>
                            <p className="text-slate-500 font-bold">No hay desglose guardado para este producto.</p>
                            <p className="text-slate-400 text-sm mt-2">Probablemente se agregó de forma manual o antes de implementar las recetas.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                <Package size={16} className="text-slate-400"/> Lista de Materiales (BOM)
                            </h3>
                            <pre className="bg-slate-800 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto shadow-inner border border-slate-700">
                                {JSON.stringify(recipeData, null, 2)}
                            </pre>
                            <p className="text-xs text-slate-400 text-center font-medium italic mt-4">
                                * Esta información es una fotografía exacta de los componentes en el momento en que se guardó la cotización.
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};