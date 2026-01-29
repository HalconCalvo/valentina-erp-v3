import React, { useEffect, useState } from 'react';
import { FileDown, Calendar, User, FileText, Hash, Building2, ClipboardList } from 'lucide-react';
import Modal from '../../../components/ui/Modal'; 
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { SalesOrder } from '../../../types/sales';
import { salesService } from '../../../api/sales-service';

interface Props {
    orderId: number | null;
    onClose: () => void;
}

export const SalesOrderDetailModal: React.FC<Props> = ({ orderId, onClose }) => {
    const [order, setOrder] = useState<SalesOrder | null>(null);
    const [loading, setLoading] = useState(false);
    
    // DOS ESTADOS DE TEXTO
    const [notes, setNotes] = useState(""); // Descripción (Arriba)
    const [conditions, setConditions] = useState(""); // Condiciones (Abajo)
    
    const [isSaving, setIsSaving] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        if (orderId) {
            setLoading(true);
            salesService.getOrderDetail(orderId)
                .then(data => {
                    setOrder(data);
                    setNotes(data.notes || "");
                    // @ts-ignore: Ignoramos error de tipo si TS aun no sabe que existe 'conditions'
                    setConditions(data.conditions || ""); 
                })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [orderId]);

    const handleSaveData = async () => {
        if (!orderId) return;
        setIsSaving(true);
        try {
            // @ts-ignore
            await salesService.updateOrder(orderId, { notes, conditions });
        } catch (error) {
            console.error(error);
            alert("Error al guardar.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!orderId || !order) return;
        setIsDownloading(true);
        try {
            // Guardado previo forzoso
            // @ts-ignore
            await salesService.updateOrder(orderId, { notes, conditions });
            
            const filename = `Cotizacion_${order.project_name.replace(/\s+/g, '_')}.pdf`;
            await salesService.downloadPDF(orderId, filename);
        } catch (error) {
            console.error(error);
            alert("Error al generar el PDF.");
        } finally {
            setIsDownloading(false);
        }
    };

    if (!orderId) return null;

    return (
        <Modal 
            isOpen={!!orderId} 
            onClose={onClose} 
            title="Editor de Cotización" 
            size="custom" 
            className="w-[95vw] max-w-[1800px] h-[90vh]" 
        >
            {loading || !order ? (
                <div className="h-full flex flex-col items-center justify-center p-20 text-slate-400">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                    Cargando...
                </div>
            ) : (
                <div className="flex flex-col h-full gap-6">
                    
                    {/* 1. HEADER DATOS */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-sm shrink-0">
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Hash size={12}/> Referencia</h3>
                            <div className="text-xl font-black text-slate-800 truncate">{order.project_name}</div>
                            <div className="text-sm text-slate-500 font-mono">Folio: #{order.id}</div>
                        </div>
                        <div className="border-l border-slate-200 pl-6">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><User size={12}/> Cliente</h3>
                            <div className="text-base font-bold text-slate-700">{order.client_id ? `Cliente ID: ${order.client_id}` : "General"}</div>
                            <div className="text-sm text-slate-500"><Calendar size={12} className="inline mr-1"/>Vence: {new Date(order.valid_until).toLocaleDateString()}</div>
                        </div>
                        <div className="border-l border-slate-200 pl-6 text-right">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total</h3>
                            <div className="text-3xl font-black text-emerald-600">${order.total_price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                        </div>
                    </div>

                    {/* 2. GRID PRINCIPAL (25% LISTA - 75% EDITORES) */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
                        
                        {/* COLUMNA IZQUIERDA: ITEMS (25%) */}
                        <div className="flex flex-col h-full min-h-0 lg:col-span-1">
                            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2 shrink-0">
                                <Building2 size={16} className="text-indigo-600"/> Productos
                            </h3>
                            <div className="border border-slate-200 rounded-lg overflow-auto flex-1 bg-white shadow-sm">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-100 text-slate-500 font-semibold sticky top-0 z-10">
                                        <tr>
                                            <th className="p-2 text-left">Concepto</th>
                                            <th className="p-2 text-right">Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {order.items?.map((item: any) => (
                                            <tr key={item.id} className="hover:bg-slate-50">
                                                <td className="p-2">
                                                    <div className="font-bold text-slate-700 truncate max-w-[150px]">{item.product_name}</div>
                                                    <div className="text-[10px] text-slate-400">Cant: {item.quantity}</div>
                                                </td>
                                                <td className="p-2 text-right font-mono text-slate-800">${item.subtotal_price.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: 2 EDITORES (75%) */}
                        <div className="flex flex-col h-full min-h-0 lg:col-span-3 gap-4">
                            
                            {/* EDITOR 1: DESCRIPCIÓN (50% altura) */}
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="flex justify-between items-center mb-1 shrink-0">
                                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <FileText size={16} className="text-indigo-600"/> 
                                        1. Saludo / Descripción / Alcance
                                    </h3>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">Aparece ANTES de los precios</span>
                                </div>
                                <textarea
                                    className="w-full flex-1 p-4 text-sm text-slate-700 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm resize-none leading-relaxed font-sans"
                                    placeholder="Ej. Por este medio te envío un cordial saludo... Cocinas fabricadas en panel MDF..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onBlur={handleSaveData}
                                />
                            </div>

                            {/* EDITOR 2: CONDICIONES (50% altura) */}
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="flex justify-between items-center mb-1 shrink-0">
                                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <ClipboardList size={16} className="text-emerald-600"/> 
                                        2. Condiciones Comerciales
                                    </h3>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">Aparece DESPUÉS de los precios</span>
                                </div>
                                <textarea
                                    className="w-full flex-1 p-4 text-sm text-slate-700 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-emerald-50/30 shadow-sm resize-none leading-relaxed font-sans"
                                    placeholder="Ej. Anticipo del 70%. Tiempo de entrega 60 días. Precios más IVA..."
                                    value={conditions}
                                    onChange={(e) => setConditions(e.target.value)}
                                    onBlur={handleSaveData}
                                />
                            </div>

                        </div>
                    </div>

                    {/* 3. FOOTER */}
                    <div className="border-t border-slate-200 pt-4 mt-auto flex justify-between items-center shrink-0">
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                            {isSaving ? <span className="text-amber-600 font-bold animate-pulse">Guardando cambios...</span> : <span className="text-emerald-600 font-bold">✓ Cambios guardados</span>}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                            <Button onClick={handleDownloadPDF} disabled={isDownloading} className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-100">
                                {isDownloading ? "Generando..." : <><FileDown size={18} className="mr-2"/> Descargar PDF Oficial</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};