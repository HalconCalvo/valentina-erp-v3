import React, { useEffect, useState, useMemo } from 'react';
import { 
    FileDown, Calendar, User, FileText, Hash, 
    ClipboardList, Info, Plus
} from 'lucide-react';
import Modal from '../../../components/ui/Modal'; 
import Button from '../../../components/ui/Button';
import { SalesOrder } from '../../../types/sales';
import { salesService } from '../../../api/sales-service';

interface Props {
    orderId: number | null;
    onClose: () => void;
}

export const SalesOrderDetailModal: React.FC<Props> = ({ orderId, onClose }) => {
    const [order, setOrder] = useState<SalesOrder | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Estados de edición de texto
    const [notes, setNotes] = useState(""); 
    const [conditions, setConditions] = useState(""); 
    
    const [isSaving, setIsSaving] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        if (orderId) {
            setLoading(true);
            salesService.getOrderDetail(orderId)
                .then(data => {
                    setOrder(data);
                    setNotes(data.notes || "");
                    // @ts-ignore
                    setConditions(data.conditions || ""); 
                })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [orderId]);

    // --- CÁLCULO DE TOTALES PARA DESGLOSE ---
    const totals = useMemo(() => {
        if (!order || !order.items) return null;

        const itemsSum = order.items.reduce((acc, item) => acc + (item.subtotal_price || 0), 0);
        
        let rate = order.applied_commission_percent || 0;
        if (rate > 1) rate = rate / 100; // Normalizar porcentaje
        
        const commission = itemsSum * rate;
        const subtotal = itemsSum + commission; // Base Gravable
        const total = order.total_price || 0;
        const iva = total - subtotal;

        return { itemsSum, commission, rate, subtotal, iva, total };
    }, [order]);

    const handleSaveData = async () => {
        if (!orderId) return;
        setIsSaving(true);
        try {
            // @ts-ignore
            await salesService.updateOrder(orderId, { notes, conditions });
        } catch (error) {
            console.error(error);
            alert("Error al guardar textos.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!orderId || !order) return;
        setIsDownloading(true);
        try {
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

    // Helper formato moneda
    const fmt = (amount: number) => amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (!orderId) return null;

    return (
        <Modal 
            isOpen={!!orderId} 
            onClose={onClose} 
            title="Revisión de Formato y Redacción" 
            size="custom" 
            className="w-[95vw] max-w-[1400px] h-[90vh]" 
        >
            {loading || !order ? (
                <div className="h-full flex flex-col items-center justify-center p-20 text-slate-400">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                    Cargando información...
                </div>
            ) : (
                <div className="flex flex-col h-full gap-4">
                    
                    {/* AVISO INFORMATIVO */}
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg text-xs flex items-center gap-2">
                        <Info size={16} />
                        <span>
                            Estás en modo <b>Revisión de Formato</b>. Para autorizar financieramente esta cotización, ve al <b>Panel de Dirección</b>.
                        </span>
                    </div>

                    {/* 1. HEADER DATOS */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-6 shadow-sm shrink-0">
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Hash size={12}/> Proyecto</h3>
                            <div className="text-lg font-black text-slate-800 truncate">{order.project_name}</div>
                            <div className="text-xs text-slate-500 font-mono">Folio: #{order.id}</div>
                        </div>
                        <div className="border-l border-slate-200 pl-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><User size={12}/> Cliente</h3>
                            <div className="text-base font-bold text-slate-700">{order.client_id ? `Cliente ID: ${order.client_id}` : "General"}</div>
                            <div className="text-xs text-slate-500"><Calendar size={12} className="inline mr-1"/>Vence: {new Date(order.valid_until).toLocaleDateString()}</div>
                        </div>
                        
                        <div className="border-l border-slate-200 pl-4 text-right flex flex-col justify-center">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Venta</h3>
                            <div className="text-3xl font-black text-slate-700">${fmt(order.total_price)}</div>
                        </div>
                    </div>

                    {/* 2. CONTENIDO PRINCIPAL */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                        
                        {/* COLUMNA IZQUIERDA: LISTA DE PRODUCTOS + DESGLOSE */}
                        <div className="lg:col-span-1 flex flex-col h-full min-h-0 border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                            <div className="bg-slate-100 p-2 font-bold text-xs text-slate-600 flex justify-between shrink-0">
                                <span>Concepto</span>
                                <span>Importe</span>
                            </div>
                            
                            {/* LISTA SCROLLABLE */}
                            <div className="overflow-auto flex-1 p-2 space-y-2">
                                {order.items?.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center p-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 text-xs">
                                        <div>
                                            <div className="font-bold text-slate-700">{item.product_name}</div>
                                            <div className="text-slate-400">Qty: {item.quantity} | Unit: ${item.unit_price.toLocaleString()}</div>
                                        </div>
                                        <div className="text-right font-mono font-bold text-slate-800">
                                            ${item.subtotal_price.toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* --- AQUÍ ESTÁ EL DESGLOSE QUE PEDISTE --- */}
                            {totals && (
                                <div className="bg-slate-50 p-3 border-t border-slate-200 shrink-0 text-xs space-y-1">
                                    <div className="flex justify-between text-slate-500">
                                        <span>Suma Partidas:</span>
                                        <span className="font-mono">${fmt(totals.itemsSum)}</span>
                                    </div>
                                    
                                    {/* Comisión */}
                                    <div className="flex justify-between text-amber-600 font-medium">
                                        <span className="flex items-center gap-1">
                                            <Plus size={8}/> Comisión ({(totals.rate * 100).toFixed(1)}%):
                                        </span>
                                        <span className="font-mono">${fmt(totals.commission)}</span>
                                    </div>
                                    
                                    <div className="flex justify-between text-slate-600 font-bold border-t border-slate-200 pt-1 mt-1">
                                        <span>Subtotal:</span>
                                        <span className="font-mono">${fmt(totals.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500">
                                        <span>IVA:</span>
                                        <span className="font-mono">${fmt(totals.iva)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-800 font-black text-sm border-t border-slate-300 pt-1 mt-1">
                                        <span>TOTAL:</span>
                                        <span className="font-mono">${fmt(totals.total)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* COLUMNA DERECHA: EDITORES DE TEXTO (NOTAS Y CONDICIONES) */}
                        <div className="lg:col-span-2 flex flex-col gap-4 h-full min-h-0">
                            <div className="flex-1 flex flex-col">
                                <label className="text-xs font-bold text-slate-500 mb-1 flex gap-2"><FileText size={14}/> Saludo / Alcance (Visible en PDF)</label>
                                <textarea
                                    className="flex-1 w-full p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white resize-none"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onBlur={handleSaveData}
                                    placeholder="Escribe aquí el saludo inicial o alcance del proyecto..."
                                />
                            </div>
                            <div className="flex-1 flex flex-col">
                                <label className="text-xs font-bold text-slate-500 mb-1 flex gap-2"><ClipboardList size={14}/> Condiciones Comerciales (Visible en PDF)</label>
                                <textarea
                                    className="flex-1 w-full p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-emerald-50/30 resize-none"
                                    value={conditions}
                                    onChange={(e) => setConditions(e.target.value)}
                                    onBlur={handleSaveData}
                                    placeholder="Tiempos de entrega, anticipos, vigencia..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* 3. FOOTER DE ACCIONES */}
                    <div className="border-t border-slate-200 pt-4 mt-auto flex justify-between items-center shrink-0">
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                            {isSaving ? <span className="text-amber-600 font-bold animate-pulse">Guardando textos...</span> : <span className="text-emerald-600 font-bold">✓ Textos guardados</span>}
                        </div>
                        
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                            
                            {/* ÚNICA ACCIÓN PRINCIPAL: VER COMO QUEDÓ EL PDF */}
                            <Button onClick={handleDownloadPDF} disabled={isDownloading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                {isDownloading ? "Generando..." : <><FileDown size={18} className="mr-2"/> Previsualizar PDF</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};