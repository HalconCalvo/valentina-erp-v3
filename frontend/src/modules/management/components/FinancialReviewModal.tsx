import React, { useEffect, useState, useMemo } from 'react';
import { 
    X, CheckCircle, XCircle, Calculator, 
    AlertTriangle, ChevronDown, ChevronRight, Layers, DollarSign, Plus, RefreshCcw, FileCheck, Lock 
} from 'lucide-react';

import { salesService } from '../../../api/sales-service'; 
import { SalesOrder, SalesOrderStatus } from '../../../types/sales';
import Button from '../../../components/ui/Button';

interface FinancialReviewModalProps {
    orderId: number | null;
    onClose: () => void;
    onOrderUpdated: () => void;
}

export const FinancialReviewModal: React.FC<FinancialReviewModalProps> = ({ orderId, onClose, onOrderUpdated }) => {
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [order, setOrder] = useState<SalesOrder | null>(null);

    // --- VARIABLES DE NEGOCIO ---
    const [globalMargin, setGlobalMargin] = useState<number>(0); 
    const [commissionPercent, setCommissionPercent] = useState<number>(0);
    const [itemMargins, setItemMargins] = useState<number[]>([]);

    // --- UI STATE ---
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

    // --- MODO SOLO LECTURA ---
    // Bloqueamos edición si la orden ya fue vendida, rechazada o cancelada.
    const isReadOnly = useMemo(() => {
        if (!order) return true;
        return [
            SalesOrderStatus.SOLD, 
            SalesOrderStatus.REJECTED, 
            SalesOrderStatus.CLIENT_REJECTED,
            SalesOrderStatus.CANCELLED
        ].includes(order.status);
    }, [order]);

    useEffect(() => {
        if (orderId) loadOrderData(orderId);
    }, [orderId]);

    const loadOrderData = async (id: number) => {
        setLoading(true);
        try {
            const data = await salesService.getOrderDetail(id);
            setOrder(data);
            
            // 1. Cargar Comisión
            let loadedCommission = data.applied_commission_percent || 0;
            if (loadedCommission > 0 && loadedCommission < 1) loadedCommission *= 100;
            setCommissionPercent(Number(loadedCommission.toFixed(2)));

            // 2. Cargar/Calcular Márgenes Individuales
            const calculatedMargins = data.items.map(item => {
                const cost = item.frozen_unit_cost || 0;
                const price = item.unit_price || 0;
                
                if (cost === 0 || price === 0) return 45; // Default de seguridad

                // Ingeniería inversa: (Precio / Costo) - 1
                const impliedMargin = ((price / cost) - 1) * 100;
                return Number(impliedMargin.toFixed(2));
            });

            setItemMargins(calculatedMargins);

            // Calcular promedio para el slider global inicial
            const avgMargin = calculatedMargins.reduce((a, b) => a + b, 0) / (calculatedMargins.length || 1);
            setGlobalMargin(Number(avgMargin.toFixed(2)));

        } catch (error) {
            console.error("Error cargando orden:", error);
            alert("No se pudo cargar la información.");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLERS ---
    const handleGlobalMarginChange = (val: number) => {
        if (isReadOnly) return; // Bloqueo
        setGlobalMargin(val);
        if (order) {
            const newMargins = new Array(order.items.length).fill(val);
            setItemMargins(newMargins);
        }
    };

    const handleItemMarginChange = (index: number, val: number) => {
        if (isReadOnly) return; // Bloqueo
        const newMargins = [...itemMargins];
        newMargins[index] = val;
        setItemMargins(newMargins);
    };

    // --- MOTOR DE SIMULACIÓN FINANCIERA ---
    const simulation = useMemo(() => {
        if (!order || itemMargins.length === 0) return null;

        let totalBaseCost = 0;   
        let subtotalBase = 0;    
        let finalSubtotal = 0;   

        const simulatedItems = order.items.map((item, index) => {
            const cost = item.frozen_unit_cost || 0;
            totalBaseCost += (cost * item.quantity);

            const specificMargin = itemMargins[index] || 0;

            // 1. Precio Base (Costo + Margen Individual)
            const marginMultiplier = 1 + (specificMargin / 100);
            const baseUnitPrice = cost * marginMultiplier;
            subtotalBase += (baseUnitPrice * item.quantity);

            // 2. Precio Final (+ Comisión Global como Add-on)
            const commissionMultiplier = 1 + (commissionPercent / 100);
            const finalUnitPrice = baseUnitPrice * commissionMultiplier;
            
            const lineTotal = finalUnitPrice * item.quantity;
            finalSubtotal += lineTotal;

            return {
                ...item,
                usedMargin: specificMargin,
                newUnitPrice: finalUnitPrice, 
                lineTotal
            };
        });

        const commissionAmount = finalSubtotal - subtotalBase;
        const netUtility = finalSubtotal - totalBaseCost - commissionAmount;

        const taxRate = order.subtotal > 0 ? (order.tax_amount / order.subtotal) : 0.16; 
        const newTaxAmount = finalSubtotal * taxRate;
        const newTotal = finalSubtotal + newTaxAmount;

        const realWeightedMargin = totalBaseCost > 0 
            ? ((subtotalBase - totalBaseCost) / totalBaseCost) * 100 
            : 0;

        return {
            totalBaseCost,
            finalSubtotal,
            newTaxAmount,
            newTotal,
            commissionAmount,
            netUtility,
            realWeightedMargin,
            simulatedItems
        };
    }, [order, itemMargins, commissionPercent]);


    // --- ACCIONES ---
    const toggleExpand = (index: number) => {
        const newSet = new Set(expandedItems);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setExpandedItems(newSet);
    };

    const handleAuthorize = async () => {
        if (!order || !simulation) return;
        if (!window.confirm("✅ ¿AUTORIZAR COTIZACIÓN?\n\nAl confirmar:\n1. Se guardarán los precios definidos.\n2. El estatus cambiará a 'AUTORIZADA'.\n3. El vendedor podrá enviarla al cliente.")) return;

        setProcessing(true);
        try {
            const updatedItems = simulation.simulatedItems.map(i => ({
                product_name: i.product_name,
                origin_version_id: i.origin_version_id,
                quantity: i.quantity,
                unit_price: Number(i.newUnitPrice.toFixed(2)), 
                frozen_unit_cost: i.frozen_unit_cost,
                cost_snapshot: i.cost_snapshot
            }));

            await salesService.updateOrder(order.id, {
                status: SalesOrderStatus.ACCEPTED, 
                applied_margin_percent: Number(simulation.realWeightedMargin.toFixed(2)), 
                applied_commission_percent: commissionPercent,
                items: updatedItems,
                subtotal: simulation.finalSubtotal,
                tax_amount: simulation.newTaxAmount,
                total_price: simulation.newTotal
            });

            onOrderUpdated();
            onClose();
        } catch (error) {
            console.error(error);
            alert("Error al autorizar.");
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!order) return;
        if (!window.confirm("❌ ¿RECHAZAR Cotización?\n\nSe devolverá a Ventas para correcciones.")) return;
        setProcessing(true);
        try {
            await salesService.rejectOrder(order.id);
            onOrderUpdated();
            onClose();
        } catch (error) { console.error(error); alert("Error"); } 
        finally { setProcessing(false); }
    };

    const formatCurrency = (amount: number) => 
        amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    if (!orderId || !simulation) return null;
    if (loading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white backdrop-blur-sm">Cargando...</div>;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden relative border border-slate-700">
                
                {/* HEADER */}
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Calculator size={20} className="text-emerald-400"/> 
                            Ingeniería Financiera (Auditoría)
                            {isReadOnly && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded ml-2 flex items-center gap-1"><Lock size={10}/> MODO SOLO LECTURA</span>}
                        </h2>
                        <p className="text-xs text-slate-400">
                             Folio #{order?.id} • Proyecto: <span className="text-white font-medium">{order?.project_name}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    
                    {/* COLUMNA IZQUIERDA: DETALLE TÉCNICO & MICROMANAGEMENT */}
                    <div className="flex-1 overflow-y-auto p-4 border-r border-slate-200 bg-white">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <Layers size={14}/> Gestión de Márgenes por Producto
                            </h3>
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">
                                {order?.items.length} Partidas
                            </span>
                        </div>
                        
                        <div className="space-y-3">
                            {simulation.simulatedItems.map((item, index) => (
                                <div key={index} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                    <div className={`flex items-center p-3 gap-2 ${expandedItems.has(index) ? 'bg-slate-50 border-b border-slate-200' : ''}`}>
                                        
                                        {/* 1. Toggle & Nombre */}
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

                                        {/* 2. MARGEN INDIVIDUAL */}
                                        <div className="flex flex-col items-center px-2 border-l border-slate-100">
                                            <label className="text-[9px] font-bold text-slate-400 mb-1">MARGEN %</label>
                                            <div className="relative w-20">
                                                <input 
                                                    type="number" 
                                                    step="0.5"
                                                    disabled={isReadOnly}
                                                    value={itemMargins[index]}
                                                    onChange={(e) => handleItemMarginChange(index, Number(e.target.value))}
                                                    className={`w-full text-center font-bold text-sm border rounded py-1 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 ${
                                                        !isReadOnly && itemMargins[index] < 30 ? 'text-red-600 bg-red-50 border-red-200' : 'text-indigo-700 border-indigo-200'
                                                    }`}
                                                />
                                            </div>
                                        </div>

                                        {/* 3. COSTO UNITARIO */}
                                        <div className="w-24 text-center hidden md:block border-l border-r border-slate-100 mx-2">
                                            <div className="text-[9px] text-slate-400 uppercase">Costo Unit.</div>
                                            <div className="font-mono font-bold text-slate-800 text-sm">
                                                {formatCurrency(item.frozen_unit_cost)}
                                            </div>
                                        </div>

                                        {/* 4. PRECIO FINAL */}
                                        <div className="w-28 text-right pl-2">
                                            <div className="text-[9px] text-slate-400 uppercase">Precio Venta</div>
                                            <div className="font-mono font-black text-emerald-700 text-sm">
                                                {formatCurrency(item.newUnitPrice)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Drill Down (Receta) */}
                                    {expandedItems.has(index) && (
                                        <div className="bg-slate-50 p-3 shadow-inner text-xs">
                                            {item.cost_snapshot?.ingredients ? (
                                                <div className="max-h-40 overflow-y-auto custom-scrollbar">
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
                                                        <tfoot className="border-t border-slate-300 bg-slate-100">
                                                            <tr>
                                                                <td colSpan={3} className="pt-2 pb-2 text-right font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                                                                    Costo Unitario Real:
                                                                </td>
                                                                <td className="pt-2 pb-2 text-right font-mono font-black text-slate-800 pr-2 text-sm bg-slate-200/30">
                                                                    {formatCurrency(item.frozen_unit_cost)}
                                                                </td>
                                                            </tr>
                                                        </tfoot>
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
                    <div className="w-full lg:w-[380px] bg-slate-50 p-6 flex flex-col border-l border-slate-200 shadow-xl z-10">
                        
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                                <DollarSign size={16} className="text-indigo-600"/> Control Maestro
                            </h3>

                            <div className="space-y-6">
                                {/* 1. APLICAR A TODOS */}
                                <div className={isReadOnly ? 'opacity-50 pointer-events-none' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                            <RefreshCcw size={10} className="text-slate-400"/>
                                            Aplicar Margen a Todo (%)
                                        </label>
                                        <span className="text-indigo-600 font-black text-xs">{globalMargin}%</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="range" min="0" max="100" step="0.5"
                                            disabled={isReadOnly}
                                            value={globalMargin}
                                            onChange={(e) => handleGlobalMarginChange(Number(e.target.value))}
                                            className="flex-1 h-2 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>
                                </div>

                                {/* 2. COMISIÓN (Global) */}
                                <div className={isReadOnly ? 'opacity-50 pointer-events-none' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600">Comisión Vendedor (Add-on)</label>
                                        <span className="text-amber-600 font-black text-xs">{commissionPercent}%</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="range" min="0" max="50" step="0.5"
                                            disabled={isReadOnly}
                                            value={commissionPercent}
                                            onChange={(e) => setCommissionPercent(Number(e.target.value))}
                                            className="flex-1 h-2 bg-amber-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                        <input 
                                            type="number" step="0.1"
                                            disabled={isReadOnly}
                                            value={commissionPercent}
                                            onChange={(e) => setCommissionPercent(Number(e.target.value))}
                                            className="w-16 p-1 text-right text-xs font-bold border rounded border-amber-200 text-amber-700 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RESULTADOS GLOBALES */}
                        <div className="flex-1 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Costo Producción:</span>
                                <span className="font-mono text-slate-700">{formatCurrency(simulation.totalBaseCost)}</span>
                            </div>
                            
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500 flex items-center gap-1"><Plus size={10}/> Comisión Total:</span>
                                <span className="font-mono text-amber-600">+{formatCurrency(simulation.commissionAmount)}</span>
                            </div>

                            <div className="flex justify-between text-sm border-t border-slate-300 pt-2">
                                <span className="text-slate-700 font-bold">Precio Final Cliente:</span>
                                <span className="font-mono font-black text-indigo-700 text-lg">{formatCurrency(simulation.finalSubtotal)}</span>
                            </div>
                            
                            <div className="bg-slate-800 p-4 rounded-lg text-white mt-4 shadow-lg border border-slate-600">
                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Utilidad Neta Real</div>
                                <div className={`text-3xl font-black font-mono mt-1 ${simulation.netUtility > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {formatCurrency(simulation.netUtility)}
                                </div>
                                <div className="flex justify-between items-center mt-2 border-t border-slate-700 pt-2">
                                    <span className="text-[10px] text-slate-400">Margen Ponderado:</span>
                                    <span className={`text-sm font-bold ${simulation.realWeightedMargin >= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {simulation.realWeightedMargin.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* BOTONES */}
                        <div className="mt-6 space-y-3">
                            {!isReadOnly ? (
                                <>
                                    <Button 
                                        onClick={handleAuthorize} 
                                        disabled={processing}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 py-3 shadow-md text-sm uppercase tracking-wide font-bold"
                                    >
                                        <FileCheck size={18} className="mr-2"/> AUTORIZAR COTIZACIÓN
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
                                <div className="bg-slate-200 p-4 rounded-lg text-center text-slate-500 text-sm font-medium border border-slate-300">
                                    <Lock size={20} className="mx-auto mb-2 text-slate-400"/>
                                    Esta cotización está cerrada y no puede modificarse.
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};