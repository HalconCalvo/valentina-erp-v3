import React, { useEffect, useState, useMemo } from 'react';
import { 
    X, CheckCircle, XCircle, Calculator, 
    AlertTriangle, ChevronDown, ChevronRight, Layers, DollarSign, Plus, RefreshCcw, FileCheck, Lock, Percent, User 
} from 'lucide-react';

import { salesService } from '../../../api/sales-service'; 
import axiosClient from '../../../api/axios-client'; 
import { SalesOrder, SalesOrderStatus } from '../../../types/sales';
import { Button } from '../../../components/ui/button';

interface FinancialReviewModalProps {
    orderId: number | null;
    onClose: () => void;
    onOrderUpdated?: () => void;
    readOnly?: boolean; // <-- NUEVO: Forzar modo solo lectura desde afuera
}

export const FinancialReviewModal: React.FC<FinancialReviewModalProps> = ({ orderId, onClose, onOrderUpdated, readOnly = false }) => {
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [order, setOrder] = useState<SalesOrder | null>(null);

    // --- VARIABLES DE NEGOCIO ---
    const [globalMargin, setGlobalMargin] = useState<number>(0); 
    const [commissionPercent, setCommissionPercent] = useState<number>(0);
    const [itemMargins, setItemMargins] = useState<number[]>([]);
    const [advancePercent, setAdvancePercent] = useState<number>(60);

    // --- UI STATE ---
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

    // --- MODO SOLO LECTURA ---
    // Será true si se forzó desde afuera (readOnly === true) O si el estatus de la orden ya no es borrador/pendiente.
    const isReadOnly = useMemo(() => {
        if (readOnly) return true; // Forzado externamente
        if (!order || !order.status) return true;
        const currentStatus = String(order.status).trim().toUpperCase();
        return ['SOLD', 'FINISHED', 'CANCELLED', 'ACCEPTED', 'CLIENT_REJECTED'].includes(currentStatus);
    }, [order, readOnly]);

    // Extraer el nombre del asesor
    const sellerName = useMemo(() => {
        if (!order) return 'Sin Asignar';
        const oAny = order as any;
        return oAny.user?.full_name || oAny.user?.username || (order.user_id ? `Asesor #${order.user_id}` : 'Sin Asignar');
    }, [order]);

    useEffect(() => {
        if (orderId) loadOrderData(orderId);
    }, [orderId]);

    const loadOrderData = async (id: number) => {
        setLoading(true);
        try {
            const data = await salesService.getOrderDetail(id);
            setOrder(data);
            
            // Saneamiento de números para evitar que la UI se congele
            let loadedCommission = Number(data.applied_commission_percent) || 0;
            if (loadedCommission > 0 && loadedCommission < 1) {
                loadedCommission = loadedCommission * 100;
            }
            
            setCommissionPercent(Number(loadedCommission.toFixed(2)));
            setAdvancePercent(Number(data.advance_percent) || 60);

            const itemsSeguros = data.items || [];
            
            const calculatedMargins = itemsSeguros.map(item => {
                const cost = Number(item.frozen_unit_cost) || 0;
                const price = Number(item.unit_price) || 0;

                if (cost === 0 || price === 0) return 40; 
                const impliedMargin = ((price / cost) - 1) * 100;
                return Number(impliedMargin.toFixed(2)) || 0;
            });

            setItemMargins(calculatedMargins);

            let totalCost = 0;
            let totalBasePrice = 0;
            
            itemsSeguros.forEach((item, i) => {
                const qty = Number(item.quantity) || 1;
                const cost = Number(item.frozen_unit_cost) || 0;
                const margin = Number(calculatedMargins[i]) || 0;
                const price = cost * (1 + (margin / 100));

                totalCost += (cost * qty);
                totalBasePrice += (price * qty);
            });

            const initialWeightedMargin = totalCost > 0 
                ? ((totalBasePrice - totalCost) / totalCost) * 100
                : 0;

            setGlobalMargin(Number(initialWeightedMargin.toFixed(2)) || 0);

        } catch (error) {
            console.error("Error cargando orden:", error);
            alert("No se pudo cargar la información.");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLERS GLOBALES (Protegidos contra NaN) ---
    const handleGlobalMarginChange = (val: number) => {
        if (isReadOnly) return;
        const safeVal = isNaN(val) ? 0 : val;
        setGlobalMargin(safeVal);
        
        if (order && order.items) {
            const newMargins = new Array(order.items.length).fill(safeVal);
            setItemMargins(newMargins);
        }
    };

    const handleItemMarginChange = (index: number, val: number) => {
        if (isReadOnly || !order || !order.items) return;
        const safeVal = isNaN(val) ? 0 : val;
        const newMargins = [...itemMargins];
        newMargins[index] = safeVal;
        setItemMargins(newMargins);

        let totalCost = 0;
        let totalBasePrice = 0;

        order.items.forEach((item, i) => {
            const qty = Number(item.quantity) || 1;
            const cost = Number(item.frozen_unit_cost) || 0;
            const margin = Number(newMargins[i]) || 0; 
            const price = cost * (1 + (margin / 100));

            totalCost += (cost * qty);
            totalBasePrice += (price * qty);
        });

        const weightedAvg = totalCost > 0 ? ((totalBasePrice - totalCost) / totalCost) * 100 : 0;
        setGlobalMargin(Number(weightedAvg.toFixed(2)) || 0);
    };

    // --- MOTOR DE SIMULACIÓN (Protegido contra cálculos corruptos) ---
    const simulation = useMemo(() => {
        if (!order) return null;

        let totalBaseCost = 0;   
        let sumOfItems = 0;    
        
        const itemsToSimulate = order.items || [];

        const simulatedItems = itemsToSimulate.map((item, index) => {
            const qty = Number(item.quantity) || 1;
            const cost = Number(item.frozen_unit_cost) || 0;
            totalBaseCost += (cost * qty);
            
            const specificMargin = Number(itemMargins[index]) || 0;

            const marginMultiplier = 1 + (specificMargin / 100);
            const baseUnitPrice = cost * marginMultiplier;
            sumOfItems += (baseUnitPrice * qty);

            const commPercent = Number(commissionPercent) || 0;
            const commissionMultiplier = 1 + (commPercent / 100);
            const finalUnitPrice = baseUnitPrice * commissionMultiplier;
            
            return {
                ...item,
                usedMargin: specificMargin,
                baseUnitPrice: baseUnitPrice, 
                newUnitPrice: finalUnitPrice,
            };
        });

        const commPercent = Number(commissionPercent) || 0;
        const commissionAmount = sumOfItems * (commPercent / 100);
        const subtotal = sumOfItems + commissionAmount;
        
        const safeTaxAmountFromDB = Number(order.tax_amount) || 0;
        const safeSubtotalFromDB = Number(order.subtotal) || 1; 
        
        const taxRate = (safeSubtotalFromDB > 0 && safeTaxAmountFromDB > 0) 
            ? (safeTaxAmountFromDB / safeSubtotalFromDB) 
            : 0.16; 
            
        const taxAmount = subtotal * taxRate;
        const total = subtotal + taxAmount;

        const netUtility = subtotal - commissionAmount - totalBaseCost;
        const realWeightedMargin = totalBaseCost > 0 ? ((sumOfItems - totalBaseCost) / totalBaseCost) * 100 : 0;
        
        const advPercent = Number(advancePercent) || 0;
        const advanceAmount = total * (advPercent / 100);

        return {
            totalBaseCost, sumOfItems, commissionAmount, subtotal,
            taxAmount, total, netUtility, realWeightedMargin, advanceAmount, simulatedItems
        };
    }, [order, itemMargins, commissionPercent, advancePercent]);


    // --- ACCIONES PRINCIPALES ---
    const toggleExpand = (index: number) => {
        // Permitimos expandir la receta incluso si es modo Solo Lectura
        const newSet = new Set(expandedItems);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setExpandedItems(newSet);
    };

    const handleAuthorize = async () => {
        if (!order || !simulation || isReadOnly) return;
        if (!window.confirm("¿Confirmar Autorización de Precios y Condiciones?")) return;

        setProcessing(true);
        try {
            const updatedItems = simulation.simulatedItems.map(i => ({
                product_name: i.product_name,
                origin_version_id: i.origin_version_id,
                quantity: Number(i.quantity) || 1,
                unit_price: Number(i.baseUnitPrice.toFixed(2)), 
                frozen_unit_cost: Number(i.frozen_unit_cost) || 0,
                cost_snapshot: i.cost_snapshot
            }));

            await salesService.updateOrder(order.id, {
                applied_margin_percent: Number(simulation.realWeightedMargin.toFixed(2)), 
                applied_commission_percent: Number(commissionPercent) || 0,
                advance_percent: Number(advancePercent) || 0,
                items: updatedItems,
                subtotal: simulation.subtotal,
                tax_amount: simulation.taxAmount,
                total_price: simulation.total
            });

            await axiosClient.post(`/sales/orders/${order.id}/authorize`);

            if(onOrderUpdated) onOrderUpdated();
            onClose();
        } catch (error) {
            console.error(error);
            alert("Error al autorizar. Revisa la consola.");
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!order || isReadOnly) return;
        if (!window.confirm("¿Rechazar cotización y enviar a borrador?")) return;
        setProcessing(true);
        try {
            await axiosClient.post(`/sales/orders/${order.id}/request_changes`);
            if(onOrderUpdated) onOrderUpdated();
            onClose();
        } catch (error) { 
            console.error(error); 
            alert("Error al rechazar cotización."); 
        } finally { 
            setProcessing(false); 
        }
    };

    const formatCurrency = (amount: number) => {
        const safeAmount = Number(amount) || 0;
        return safeAmount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    };

    if (!orderId) return null;

    if (loading || !order || !simulation) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-opacity">
                <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-600 font-bold tracking-tight">Cargando mesa financiera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden relative border border-slate-700">
                
                {/* HEADER */}
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Calculator size={20} className="text-emerald-400"/> 
                            Ingeniería Financiera
                            {isReadOnly && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded ml-2 flex items-center gap-1"><Lock size={10}/> SOLO LECTURA</span>}
                        </h2>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                            <span>Folio #{order?.id} • Proyecto: <span className="text-white font-medium">{order?.project_name}</span></span>
                            <span className="text-slate-500">|</span>
                            <span className="flex items-center gap-1"><User size={12} className="text-indigo-400"/> Asesor: <span className="text-indigo-300 font-medium">{sellerName}</span></span>
                        </p>
                    </div>
                    <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    
                    {/* COLUMNA IZQUIERDA: DETALLE TÉCNICO */}
                    <div className="flex-1 overflow-y-auto p-4 border-r border-slate-200 bg-white">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <Layers size={14}/> Partidas ({order?.items?.length || 0})
                            </h3>
                        </div>
                        
                        <div className="space-y-3">
                            {simulation.simulatedItems.map((item, index) => (
                                <div key={index} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                    <div className={`flex items-center p-3 gap-2 ${expandedItems.has(index) ? 'bg-slate-50 border-b border-slate-200' : ''}`}>
                                        
                                        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                                            <button onClick={() => toggleExpand(index)} className="text-slate-400 hover:text-indigo-600">
                                                {expandedItems.has(index) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                            </button>
                                            <div>
                                                <div className="font-bold text-slate-700 text-sm truncate w-full max-w-[200px]" title={item.product_name}>
                                                    {item.product_name}
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                    Cant: {item.quantity}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center px-2 border-l border-slate-100">
                                            <label className="text-[9px] font-bold text-slate-400 mb-1">MARGEN %</label>
                                            <div className="relative w-20">
                                                <input 
                                                    type="number" 
                                                    step="0.01" 
                                                    disabled={isReadOnly || processing}
                                                    value={itemMargins[index] === undefined ? 0 : itemMargins[index]}
                                                    onChange={(e) => handleItemMarginChange(index, parseFloat(e.target.value))}
                                                    className={`w-full text-center font-bold text-sm border rounded py-1 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 ${
                                                        !isReadOnly && (itemMargins[index] || 0) < 30 ? 'text-red-600 bg-red-50 border-red-200' : 'text-indigo-700 border-indigo-200'
                                                    }`}
                                                />
                                            </div>
                                        </div>

                                        <div className="w-24 text-center hidden md:block border-l border-r border-slate-100 mx-2">
                                            <div className="text-[9px] text-slate-400 uppercase">Costo Unit.</div>
                                            <div className="font-mono font-bold text-slate-800 text-sm">
                                                {formatCurrency(item.frozen_unit_cost)}
                                            </div>
                                        </div>

                                        <div className="w-28 text-right pl-2">
                                            <div className="text-[9px] text-slate-400 uppercase">Precio Base</div>
                                            <div className="font-mono font-bold text-slate-600 text-sm">
                                                {formatCurrency(item.baseUnitPrice)}
                                            </div>
                                        </div>
                                    </div>

                                    {expandedItems.has(index) && (
                                        <div className="bg-slate-50 p-3 shadow-inner text-xs">
                                            {item.cost_snapshot?.ingredients ? (
                                                <div className="max-h-40 overflow-y-auto">
                                                    <table className="w-full">
                                                        <thead className="text-slate-400 text-left bg-slate-100 border-b border-slate-200">
                                                            <tr>
                                                                <th className="pb-1 pl-2 py-1 w-[40%]">Concepto</th>
                                                                <th className="pb-1 text-center py-1">Cant.</th>
                                                                <th className="pb-1 text-right py-1">Costo Unit.</th>
                                                                <th className="pb-1 text-right pr-2 py-1 bg-slate-200/50">Importe</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {item.cost_snapshot.ingredients.map((ing: any, i: number) => (
                                                                <tr key={i}>
                                                                    <td className="py-1 pl-2 text-slate-600 font-medium">{ing.name}</td>
                                                                    <td className="py-1 text-center text-slate-500">{ing.qty_recipe}</td>
                                                                    <td className="py-1 text-right font-mono text-slate-400">{formatCurrency(ing.frozen_unit_cost)}</td>
                                                                    <td className="py-1 text-right font-mono font-bold text-slate-700 pr-2 bg-slate-50">
                                                                        {formatCurrency(ing.frozen_unit_cost * ing.qty_recipe)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="text-amber-600 flex items-center gap-2"><AlertTriangle size={12}/> Sin receta vinculada.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COLUMNA DERECHA: VARIABLES GLOBALES Y TOTALES */}
                    <div className="w-full lg:w-[380px] bg-slate-50 p-6 flex flex-col border-l border-slate-200 shadow-xl relative z-10">
                        
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                                <DollarSign size={16} className="text-indigo-600"/> Control Maestro
                            </h3>

                            <div className="space-y-6">
                                <div className={isReadOnly ? 'opacity-60' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                            <RefreshCcw size={10} className="text-slate-400"/>
                                            Aplicar Margen a Todo (%)
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="range" min="0" max="100" 
                                            step="0.01" 
                                            disabled={isReadOnly || processing}
                                            value={globalMargin}
                                            onChange={(e) => handleGlobalMarginChange(parseFloat(e.target.value))}
                                            className="flex-1 h-2 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            disabled={isReadOnly || processing}
                                            value={globalMargin}
                                            onChange={(e) => handleGlobalMarginChange(parseFloat(e.target.value))}
                                            className="w-16 p-1 text-right text-xs font-bold border rounded border-indigo-200 text-indigo-700 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className={isReadOnly ? 'opacity-60' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600">Comisión Vendedor (Add-on)</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="range" min="0" max="50" step="0.5"
                                            disabled={isReadOnly || processing}
                                            value={commissionPercent}
                                            onChange={(e) => setCommissionPercent(Number(e.target.value))}
                                            className="flex-1 h-2 bg-amber-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                        <input 
                                            type="number" step="0.1"
                                            disabled={isReadOnly || processing}
                                            value={commissionPercent}
                                            onChange={(e) => setCommissionPercent(Number(e.target.value))}
                                            className="w-16 p-1 text-right text-xs font-bold border rounded border-amber-200 text-amber-700 outline-none"
                                        />
                                    </div>
                                </div>
                                
                                <div className={isReadOnly ? 'opacity-60' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                            <Percent size={12} className="text-blue-500"/>
                                            Anticipo a Solicitar
                                        </label>
                                        <span className="text-sm font-mono text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                            {formatCurrency(simulation.advanceAmount)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="range" min="0" max="100" step="5"
                                            disabled={isReadOnly || processing}
                                            value={advancePercent}
                                            onChange={(e) => setAdvancePercent(Number(e.target.value))}
                                            className="flex-1 h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                        <input 
                                            type="number" step="1"
                                            disabled={isReadOnly || processing}
                                            value={advancePercent}
                                            onChange={(e) => setAdvancePercent(Number(e.target.value))}
                                            className="w-16 p-1 text-right text-sm font-bold border rounded border-blue-200 text-blue-700 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RESULTADOS GLOBALES */}
                        <div className="flex-1 space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Suma Importes:</span>
                                <span className="font-mono text-slate-700">{formatCurrency(simulation.sumOfItems)}</span>
                            </div>
                            
                            <div className="flex justify-between text-sm">
                                <span className="text-amber-600 font-medium flex items-center gap-1"><Plus size={10}/> Comisión ({(commissionPercent).toFixed(1)}%):</span>
                                <span className="font-mono text-amber-600 font-bold">{formatCurrency(simulation.commissionAmount)}</span>
                            </div>

                            <div className="flex justify-between text-sm border-t border-dashed border-slate-200 pt-2">
                                <span className="text-slate-700 font-bold">Subtotal:</span>
                                <span className="font-mono font-bold text-slate-800">{formatCurrency(simulation.subtotal)}</span>
                            </div>

                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">IVA:</span>
                                <span className="font-mono text-slate-500">{formatCurrency(simulation.taxAmount)}</span>
                            </div>

                            <div className="flex justify-between text-lg border-t-2 border-slate-800 pt-2 mt-1">
                                <span className="text-slate-900 font-black">TOTAL:</span>
                                <span className="font-mono font-black text-emerald-600">{formatCurrency(simulation.total)}</span>
                            </div>

                            <div className="mt-4 pt-2 border-t border-slate-100">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 uppercase font-bold">Utilidad Neta Real:</span>
                                    <span className={`font-mono font-bold ${simulation.netUtility > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {formatCurrency(simulation.netUtility)} ({simulation.realWeightedMargin.toFixed(2)}%)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* BOTONES E INDICADOR DE ESTADO */}
                        <div className="mt-6 space-y-3">
                            {!isReadOnly ? (
                                <>
                                    <Button 
                                        onClick={handleAuthorize} 
                                        disabled={processing}
                                        className={`w-full py-3 shadow-md text-sm uppercase tracking-wide font-bold transition-all ${
                                            processing ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                                        }`}
                                    >
                                        <FileCheck size={18} className="mr-2"/> 
                                        {processing ? 'Procesando...' : 'AUTORIZAR COTIZACIÓN'}
                                    </Button>
                                    
                                    <Button 
                                        variant="secondary"
                                        onClick={handleReject} 
                                        disabled={processing}
                                        className="w-full bg-white border-red-200 text-red-600 hover:bg-red-50 text-xs"
                                    >
                                        <XCircle size={14} className="mr-2"/> Rechazar Cotización
                                    </Button>
                                </>
                            ) : (
                                <div className="bg-slate-100 p-4 rounded-lg text-center text-slate-500 text-sm font-medium border border-slate-300 shadow-inner">
                                    <Lock size={20} className="mx-auto mb-2 text-slate-400"/>
                                    {order?.status === SalesOrderStatus.ACCEPTED 
                                        ? 'Cotización autorizada y en calle.' 
                                        : order?.status === SalesOrderStatus.REJECTED 
                                        ? 'Cotización rechazada por la Dirección.'
                                        : 'Esta cotización se encuentra cerrada o inactiva.'}
                                    <br/><span className="text-xs font-normal">Modo de Auditoría (Solo Lectura).</span>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};