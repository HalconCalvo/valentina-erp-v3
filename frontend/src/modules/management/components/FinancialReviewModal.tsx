import React, { useEffect, useState, useMemo } from 'react';
import { 
    X, CheckCircle, XCircle, Calculator, 
    AlertTriangle, ChevronDown, ChevronRight, Layers, DollarSign, RefreshCcw, FileCheck, Lock, Percent, User 
} from 'lucide-react';

import { salesService } from '../../../api/sales-service'; 
import axiosClient from '../../../api/axios-client'; 
import { SalesOrder, SalesOrderStatus } from '../../../types/sales';
import { useFoundations } from '../../foundations/hooks/useFoundations';
import { Button } from '@/components/ui/Button';

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

    // Catálogo de tasas de impuesto (misma fuente que CreateQuotePage) para leer la tasa REAL
    // de la cotización y respetar tasa cero (sin fallback hardcodeado a 0.16).
    const foundationHook = useFoundations();
    const taxRates = foundationHook?.taxRates || [];

    // --- VARIABLES DE NEGOCIO ---
    const [globalMargin, setGlobalMargin] = useState<number>(0); 
    const [commissionPercent, setCommissionPercent] = useState<number>(0);
    const [itemMargins, setItemMargins] = useState<number[]>([]);
    // Precio exacto fijado por el usuario (override). Si no es null para un índice, ese precio
    // manda sobre el margen y NO se recalcula con Math.ceil.
    const [itemPriceOverrides, setItemPriceOverrides] = useState<(number | null)[]>([]);
    const [advancePercent, setAdvancePercent] = useState<number>(60);

    // --- UI STATE ---
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
    // Edición temporal SOLO del campo de precio enfocado, para que el input no "pelee" con
    // el value recalculado (Math.ceil) mientras se escribe. itemMargins sigue siendo la
    // fuente de verdad; al hacer blur el precio vuelve al valor canónico del useMemo.
    const [editingPrice, setEditingPrice] = useState<{ index: number; value: string } | null>(null);

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
                // El unit_price guardado YA incluye la comisión. Para obtener el margen REAL
                // primero le quitamos la comisión, luego derivamos el margen sobre el costo.
                // Así el slider de margen arranca en el margen puro (ej. 40%), no mezclado (54%).
                const commFraction = loadedCommission / 100; // loadedCommission ya está en %
                const priceSinComision = price / (1 + commFraction);
                const impliedMargin = cost > 0 ? ((priceSinComision / cost) - 1) * 100 : 40;
                return Number(impliedMargin.toFixed(2)) || 0;
            });

            setItemMargins(calculatedMargins);
            setItemPriceOverrides(new Array(itemsSeguros.length).fill(null));

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

        // Al editar el margen, el margen vuelve a dominar: limpiamos el override de precio
        // de ese índice para que el precio se recalcule desde el margen.
        const clearedOverrides = [...itemPriceOverrides];
        clearedOverrides[index] = null;
        setItemPriceOverrides(clearedOverrides);

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

    // Editar el PRECIO DE VENTA (con comisión incluida) de una instancia: se traduce a
    // MARGEN y se guarda en itemMargins[] (única fuente de verdad). Se le quita la comisión
    // antes de derivar el margen, para no duplicarla (la simulación la vuelve a aplicar).
    const handleItemPriceChange = (index: number, val: number) => {
        if (isReadOnly || !order || !order.items) return;
        const precio = isNaN(val) ? 0 : val;
        const item = order.items[index];
        const cost = Number(item.frozen_unit_cost) || 0;
        const commPercent = Number(commissionPercent) || 0;
        const precioSinComision = precio / (1 + commPercent / 100);
        const nuevoMargen = cost > 0 ? ((precioSinComision / cost) - 1) * 100 : 0;

        const newMargins = [...itemMargins];
        newMargins[index] = Number(nuevoMargen.toFixed(2));
        setItemMargins(newMargins);

        // Recalcular el margen global ponderado (igual que en handleItemMarginChange).
        let totalCost = 0;
        let totalBasePrice = 0;

        order.items.forEach((it, i) => {
            const qty = Number(it.quantity) || 1;
            const c = Number(it.frozen_unit_cost) || 0;
            const margin = Number(newMargins[i]) || 0;
            const price = c * (1 + (margin / 100));

            totalCost += (c * qty);
            totalBasePrice += (price * qty);
        });

        const weightedAvg = totalCost > 0 ? ((totalBasePrice - totalCost) / totalCost) * 100 : 0;
        setGlobalMargin(Number(weightedAvg.toFixed(2)) || 0);

        // El precio domina: guardamos el precio exacto fijado por el usuario para que la
        // simulación lo respete al centavo (sin recalcular desde el margen con Math.ceil).
        const newOverrides = [...itemPriceOverrides];
        newOverrides[index] = precio;
        setItemPriceOverrides(newOverrides);
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
            const commPercent = Number(commissionPercent) || 0;

            const marginMultiplier = 1 + (specificMargin / 100);
            const commissionMultiplier = 1 + (commPercent / 100);

            // Precio base (sin comisión) solo como referencia visual.
            const baseUnitPrice = cost * marginMultiplier;
            // Si el usuario fijó un precio exacto (override), ese precio manda al centavo.
            // Si no, se calcula desde el margen con Math.ceil (idéntico a CreateQuotePage).
            const override = itemPriceOverrides[index];
            const finalUnitPrice = (override != null && !isNaN(override))
                ? override
                : Math.ceil(cost * marginMultiplier * commissionMultiplier);

            // El subtotal suma el precio CON comisión incluida (no se vuelve a sumar aparte).
            sumOfItems += (finalUnitPrice * qty);

            return {
                ...item,
                usedMargin: specificMargin,
                baseUnitPrice: baseUnitPrice, 
                newUnitPrice: finalUnitPrice,
            };
        });

        // Regla de negocio: precio = costo × (1+margen) × (1+comisión). La comisión va
        // DENTRO del precio (ya sumada en finalUnitPrice/sumOfItems). Aquí solo se EXTRAE
        // de forma informativa; NO se vuelve a sumar (consistente con CreateQuotePage).
        const commPercent = Number(commissionPercent) || 0;
        const commissionAmount = sumOfItems > 0
            ? sumOfItems - (sumOfItems / (1 + commPercent / 100))
            : 0;
        const subtotal = sumOfItems; // la comisión NO se vuelve a sumar
        
        // Tasa REAL de la cotización desde el catálogo (rate es fracción: 0.16, 0, etc.).
        // Sin fallback a 0.16: si no se resuelve la tasa, es 0 (tasa cero → IVA $0).
        const selectedTaxRate = taxRates.find(t => t.id === order.tax_rate_id);
        const taxRate = selectedTaxRate ? Number(selectedTaxRate.rate) : 0;

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
    }, [order, itemMargins, itemPriceOverrides, commissionPercent, advancePercent, taxRates]);


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
        // No autorizar con la tasa de IVA sin resolver (catálogo aún no cargado).
        if (taxRates.length === 0) {
            alert("Aún se está cargando la configuración de impuestos. Intenta de nuevo en un momento.");
            return;
        }
        if (!window.confirm("¿Confirmar Autorización de Precios y Condiciones?")) return;

        setProcessing(true);
        try {
            const updatedItems = simulation.simulatedItems.map(i => ({
                product_name: i.product_name,
                origin_version_id: i.origin_version_id,
                quantity: Number(i.quantity) || 1,
                unit_price: Number(i.newUnitPrice.toFixed(2)), // precio CON comisión incluida
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

    if (loading || !order || !simulation || taxRates.length === 0) {
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
            <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl h-[88vh] max-h-[88vh] flex flex-col overflow-hidden relative border border-slate-700">
                
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

                                        <div className="flex flex-col items-center px-2 border-l border-slate-100 w-28">
                                            <label className="text-[9px] font-bold text-slate-400 mb-1 uppercase">P. Venta</label>
                                            <div className="relative w-24">
                                                <input
                                                    type="text"
                                                    disabled={isReadOnly || processing}
                                                    value={editingPrice?.index === index ? editingPrice.value : formatCurrency(item.newUnitPrice)}
                                                    onFocus={() => setEditingPrice({ index, value: String(item.newUnitPrice) })}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setEditingPrice({ index, value: raw });
                                                        const numeric = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
                                                        handleItemPriceChange(index, numeric);
                                                    }}
                                                    onBlur={() => setEditingPrice(null)}
                                                    className="w-full text-center font-mono font-bold text-sm border rounded py-1 outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 text-emerald-700 border-emerald-200"
                                                />
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
                    <div className="w-full lg:w-[380px] bg-slate-50 p-6 flex flex-col border-l border-slate-200 shadow-xl relative z-10 min-h-0">

                        {/* ZONA SCROLLEABLE: controles y totales (los botones quedan fijos abajo) */}
                        <div className="flex-1 overflow-y-auto min-h-0 -mr-3 pr-3">

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
                                        <label className="text-xs font-bold text-slate-600">Comisión Vendedor (incluida en precio)</label>
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
                            {/* Comisión INFORMATIVA: ya incluida en los precios, NO se suma aparte */}
                            <div className="flex justify-between items-start text-emerald-700 bg-emerald-50/60 rounded px-2 py-1.5">
                                <span className="flex flex-col">
                                    <span className="flex items-center gap-1 text-sm font-medium">
                                        <Percent size={10}/> Comisión Vendedor incluida ({(commissionPercent).toFixed(1)}%):
                                    </span>
                                    <span className="text-[10px] text-emerald-600/80 italic">Ya está dentro de los precios; no se suma al subtotal.</span>
                                </span>
                                <span className="font-mono font-bold">{formatCurrency(simulation.commissionAmount)}</span>
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

                        </div>
                        {/* fin ZONA SCROLLEABLE */}

                        {/* BOTONES E INDICADOR DE ESTADO (barra fija, fuera del scroll) */}
                        <div className="shrink-0 mt-4 pt-4 border-t border-slate-200 space-y-3">
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