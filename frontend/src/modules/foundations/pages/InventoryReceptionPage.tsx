import React, { useState, useEffect } from 'react';
import { 
    Truck, Package, ArrowLeft, CheckCircle2, 
    Save, PackageCheck, Ban, AlertTriangle, XCircle, Loader2
} from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { Button } from "@/components/ui/Button"

// Utilidades seguras
const formatCurrency = (amount: any): string => {
    const num = Number(amount);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
};

const formatInitialAmount = (num: any): string => {
    const val = Number(num);
    if (isNaN(val)) return '';
    const [integerPart, decimalPart] = val.toFixed(2).split('.');
    return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`;
};

const InventoryReceptionPage: React.FC = () => {
    const [incomingPOs, setIncomingPOs] = useState<any[]>([]);
    const [isLoadingPOs, setIsLoadingPOs] = useState(false);
    
    const [selectedPO, setSelectedPO] = useState<any | null>(null);
    const [invoiceFolio, setInvoiceFolio] = useState('');
    const [invoiceTotal, setInvoiceTotal] = useState<number | ''>('');
    const [displayTotal, setDisplayTotal] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false); // NUEVO ESTADO
    const [declaringSatisfied, setDeclaringSatisfied] = useState(false);
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canDeclare = ['ADMIN', 'ADMINISTRACION', 'ADMINISTRADOR', 'GERENCIA', 'DIRECTOR'].includes(userRole);
    
    const [receivedItems, setReceivedItems] = useState<Record<number, string>>({});
    const [editedPrices, setEditedPrices] = useState<Record<number, string>>({});
    const [editedDescriptions, setEditedDescriptions] = useState<Record<number, string>>({});
    const [taxRate, setTaxRate] = useState<number>(0.16);

    const [advanceModal, setAdvanceModal] = useState<{open: boolean, po: any | null}>({open: false, po: null});
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceLoading, setAdvanceLoading] = useState(false);

    useEffect(() => {
        fetchIncomingPOs();
    }, []); 

    const fetchIncomingPOs = async () => {
        setIsLoadingPOs(true);
        try {
            const [resEnviada, resParcial] = await Promise.all([
                axiosClient.get('/purchases/orders/?status=ENVIADA'),
                axiosClient.get('/purchases/orders/?status=RECIBIDA_PARCIAL')
            ]);
            const allPOs = [...(resEnviada.data || []), ...(resParcial.data || [])];
            setIncomingPOs(allPOs);
        } catch (error) {
            console.error("Error al cargar OCs en tránsito", error);
            setIncomingPOs([]);
        } finally {
            setIsLoadingPOs(false);
        }
    };

    const handleRequestAdvance = async () => {
        if (!advanceModal.po) return;
        const amount = parseFloat(advanceAmount.replace(/,/g, ''));
        if (!amount || amount <= 0) {
            return alert("Ingresa un monto válido mayor a $0.");
        }
        setAdvanceLoading(true);
        try {
            await axiosClient.post(`/purchases/orders/${advanceModal.po.id}/request-advance`, { amount });
            alert(`✅ Anticipo de ${formatCurrency(amount)} registrado. Tesorería lo procesará.`);
            setAdvanceModal({ open: false, po: null });
            setAdvanceAmount('');
            fetchIncomingPOs();
        } catch (err: any) {
            alert(err.response?.data?.detail || "❌ Error al registrar el anticipo.");
        } finally {
            setAdvanceLoading(false);
        }
    };

    // Total RECIBIDO con IVA a partir de un mapa de cantidades (misma fórmula de price del archivo).
    const calcTotalRecibidoConIva = (po: any, received: Record<number, string>) => {
        const subtotal = (po?.items || []).reduce((sum: number, item: any, idx: number) => {
            const price = item.unit_price || item.expected_cost || item.price || 0;
            const qty = Number(received[idx]) || 0;
            return sum + (qty * price);
        }, 0);
        return subtotal * (1 + 0.16);
    };

    const handleSelectPO = (po: any) => {
        if (!po) return;
        setSelectedPO(po);
        setInvoiceFolio('');

        const initialReceived: Record<number, string> = {};
        (po.items || []).forEach((item: any, idx: number) => {
            const alreadyReceived = Number(item.quantity_received || 0);
            const pending = Math.max((item.qty || 0) - alreadyReceived, 0);
            initialReceived[idx] = String(pending);
        });
        setReceivedItems(initialReceived);

        // El total inicial refleja lo que se va a RECIBIR, no el total de la OC completa.
        const totalRecibido = calcTotalRecibidoConIva(po, initialReceived);
        setInvoiceTotal(totalRecibido);
        setDisplayTotal(formatInitialAmount(totalRecibido));
    };

    const handleAmountInput = (val: string) => {
        let cleanVal = val.replace(/[^0-9.]/g, '');
        if ((cleanVal.match(/\./g) || []).length > 1) cleanVal = cleanVal.substring(0, cleanVal.lastIndexOf('.'));
        if (cleanVal.includes('.')) {
            const parts = cleanVal.split('.');
            if (parts[1].length > 2) cleanVal = `${parts[0]}.${parts[1].substring(0, 2)}`;
        }
        if (cleanVal === '') {
            setDisplayTotal('');
            setInvoiceTotal('');
            return;
        }
        setInvoiceTotal(parseFloat(cleanVal));
        const parts = cleanVal.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        setDisplayTotal(parts.join('.'));
    };

    const handleBlur = () => {
        if (typeof invoiceTotal === 'number' && invoiceTotal > 0) {
            setDisplayTotal(formatInitialAmount(invoiceTotal));
        }
    };

    const handleReceivedQtyChange = (idx: number, val: string) => {
        setReceivedItems(prev => {
            const next = { ...prev, [idx]: val };
            const nuevoTotal = calcTotalRecibidoConIva(selectedPO, next);
            setInvoiceTotal(nuevoTotal);
            setDisplayTotal(formatInitialAmount(nuevoTotal));
            return next;
        });
    };

    const handlePriceChange = (idx: number, value: string) => {
        setEditedPrices(prev => ({ ...prev, [idx]: value }));
    };

    const handleDescriptionChange = (idx: number, value: string) => {
        setEditedDescriptions(prev => ({ ...prev, [idx]: value }));
    };

    const handleSubmit = async () => {
        if (!selectedPO) return;
        
        if (!invoiceFolio || invoiceTotal === '') {
            alert("Por favor ingresa el folio de la factura que trajo el chofer y el total exacto.");
            return;
        }

        // Validar discrepancia solo al confirmar
        if (hasFinancialWarning) {
            if (!window.confirm(`⚠️ El monto de la factura (${formatCurrency(Number(invoiceTotal))}) no coincide con el calculado (${formatCurrency(expectedTotal)}).\n\n¿Deseas confirmar el ingreso de todas formas? Administración revisará la diferencia.`)) {
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const payload = {
                invoice_folio: invoiceFolio,
                invoice_total: Number(invoiceTotal),
                tax_rate: taxRate,
                received_items: (selectedPO.items || []).map((item: any, idx: number) => ({
                    sku: item.sku,
                    expected_qty: item.qty,
                    received_qty: Number(receivedItems[idx]) || 0,
                    unit_cost: editedPrices[idx] !== undefined ? Number(editedPrices[idx]) : (item.unit_price || item.expected_cost || item.price || 0),
                    description: editedDescriptions[idx] !== undefined ? editedDescriptions[idx] : (item.name || ''),
                }))
            };

            await axiosClient.put(`/purchases/orders/${selectedPO.id}/receive`, payload);

            alert("✅ Recepción completada. Inventario actualizado.");
            setSelectedPO(null); 
            fetchIncomingPOs(); 
            
        } catch (error) {
            console.error(error);
            alert("❌ Error al procesar la recepción.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- NUEVA FUNCIÓN: CANCELAR ENTREGA ---
    const handleCancelOrder = async () => {
        if (!selectedPO) return;
        
        if (!window.confirm(`⚠️ ¿Estás seguro de RECHAZAR la entrega y CANCELAR la orden ${selectedPO.folio}?\n\nEsta acción no se puede deshacer. Los materiales regresarán a la mesa de compras para pedirse a otro proveedor.`)) {
            return;
        }

        setIsCancelling(true);
        try {
            await axiosClient.put(`/purchases/orders/${selectedPO.id}/cancel`);
            alert("🚫 Orden cancelada exitosamente. Los materiales están libres de nuevo.");
            setSelectedPO(null);
            fetchIncomingPOs();
        } catch (error) {
            console.error(error);
            alert("❌ Error al cancelar la orden.");
        } finally {
            setIsCancelling(false);
        }
    };

    const handleDeclareSatisfied = async () => {
        if (!selectedPO) return;
        if (!window.confirm(`¿Declarar la OC ${selectedPO.folio} como Satisfecha?\n\nEsto cerrará la orden aunque falten productos. Los faltantes deberán pedirse en una nueva OC.`)) return;
        setDeclaringSatisfied(true);
        try {
            await axiosClient.put(`/purchases/orders/${selectedPO.id}/declare-satisfied`);
            alert("✅ OC declarada como Satisfecha.");
            setSelectedPO(null);
            fetchIncomingPOs();
        } catch (err: any) {
            alert(err.response?.data?.detail || "❌ Error al declarar la OC como satisfecha.");
        } finally {
            setDeclaringSatisfied(false);
        }
    };

    if (!selectedPO) {
        return (
            <>
            <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fadeIn">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <Truck className="text-blue-600"/> Andén de Descarga
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Selecciona la Orden de Compra que acaba de llegar para verificarla.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {isLoadingPOs ? (
                        <p className="text-slate-400 font-bold text-center py-10 bg-slate-50 rounded-xl border border-slate-200">Buscando camiones en tránsito...</p>
                    ) : incomingPOs.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed shadow-sm">
                            <CheckCircle2 className="mx-auto text-emerald-300 mb-4" size={48}/>
                            <p className="text-emerald-600 font-black uppercase tracking-widest text-sm">Andén Despejado</p>
                            <p className="text-slate-400 text-xs mt-1">No hay Órdenes de Compra en tránsito en este momento.</p>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-between items-center px-6">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Folio y Proveedor</span>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-12">Total (c/IVA)</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {incomingPOs.map((po, index) => (
                                    <div 
                                        key={po.id || index} 
                                        onClick={() => handleSelectPO(po)} 
                                        className="p-4 px-6 cursor-pointer hover:bg-emerald-50/50 flex flex-col md:flex-row items-start md:items-center justify-between transition-colors group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-black uppercase rounded-md tracking-wider border border-emerald-100 min-w-[100px] text-center">
                                                {po.folio || 'S/F'}
                                            </span>
                                            <div>
                                                <h3 className="font-black text-slate-800 text-base">{po.provider_name || 'Proveedor Desconocido'}</h3>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    <p className="text-slate-500 text-xs flex items-center gap-1">
                                                        <Package size={12} className="text-slate-400"/> 
                                                        {(po.items || []).length} Partidas
                                                    </p>
                                                    {po.is_advance && (
                                                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 uppercase tracking-widest">Prepagada</span>
                                                    )}
                                                    {po.status === 'RECIBIDA_PARCIAL' && (
                                                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-widest">Entrega Parcial</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-4 mt-4 md:mt-0 w-full md:w-auto justify-end">
                                            <div className="text-right">
                                                <p className="font-black text-emerald-600 text-lg">{formatCurrency((po.total_estimated_amount || 0) * 1.16)}</p>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const subtotal = po.total_estimated_amount || 0;
                                                    setAdvanceAmount(formatInitialAmount(subtotal * 1.16));
                                                    setAdvanceModal({ open: true, po });
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors whitespace-nowrap"
                                                title="Registrar anticipo para esta OC"
                                            >
                                                <AlertTriangle size={12} /> Anticipo
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Mini-modal: Registrar Anticipo */}
            {advanceModal.open && advanceModal.po && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border-t-4 border-t-orange-400 animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-orange-100 text-orange-600">
                                    <AlertTriangle size={18} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Registrar Anticipo</p>
                                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">{advanceModal.po.folio} — {advanceModal.po.provider_name}</p>
                                </div>
                            </div>
                            <button onClick={() => setAdvanceModal({ open: false, po: null })} className="text-slate-400 hover:text-slate-600">
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-slate-500 font-bold">
                                Se generará una factura proforma <strong>ANT-{advanceModal.po.folio}</strong> en Cuentas por Pagar para que Tesorería ejecute el pago.
                            </p>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Monto del Anticipo (con IVA) *</label>
                                <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 focus-within:border-orange-400 transition-colors">
                                    <span className="text-sm font-bold text-slate-400 mr-1">$</span>
                                    <input
                                        type="text"
                                        value={advanceAmount}
                                        onChange={e => setAdvanceAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full text-sm font-black text-slate-800 outline-none bg-transparent"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold mt-1">
                                    Total OC c/IVA: {formatCurrency((advanceModal.po.total_estimated_amount || 0) * 1.16)}
                                </p>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => { setAdvanceModal({ open: false, po: null }); setAdvanceAmount(''); }}
                                className="px-4 py-2 text-xs font-black text-slate-500 uppercase border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRequestAdvance}
                                disabled={advanceLoading}
                                className="px-5 py-2 text-xs font-black text-white uppercase bg-orange-500 hover:bg-orange-600 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
                            >
                                {advanceLoading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                                Solicitar Anticipo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            </>
        );
    }

    // Calcular el total basado en las cantidades REALMENTE recibidas
    const subtotalRecibido = (selectedPO?.items || []).reduce((sum: number, item: any, idx: number) => {
        const basePrice = item.unit_price || item.expected_cost || item.price || 0;
        const price = editedPrices[idx] !== undefined ? Number(editedPrices[idx]) : basePrice;
        const received = Number(receivedItems[idx]) || 0;
        return sum + (received * price);
    }, 0);
    const subtotalCalc = subtotalRecibido;
    const ivaCalc = subtotalRecibido * taxRate;
    const expectedTotal = subtotalRecibido + ivaCalc;

    const diff = Math.abs(expectedTotal - Number(invoiceTotal));
    const tolerancia = Math.max(expectedTotal * 0.005, 1.00);
    // Permitir recibir más cantidad de la ordenada (ej. rollos de chapacinta)
    // Solo bloquear si el monto de la factura es MENOR al esperado (falta mercancía)
    // Si es mayor, solo advertir pero no bloquear
    const invoiceTotalNum = Number(invoiceTotal);
    const isFinancialBlocked = false;
    const hasFinancialWarning = invoiceTotal !== '' && invoiceTotalNum > 0 && diff > tolerancia;

    return (
        <div className="animate-in slide-in-from-right-4 duration-300 pb-10">
            <div className="bg-white rounded-3xl border border-emerald-200 shadow-md overflow-hidden border-t-8 border-t-emerald-500">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-emerald-50/30 gap-6">
                    <div className="flex items-center gap-5">
                        <Button 
                            onClick={() => setSelectedPO(null)} 
                            variant="outline" 
                            className="h-12 w-12 rounded-full border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white p-0 shadow-sm flex items-center justify-center transition-colors"
                            title="Regresar al Andén"
                        >
                            <ArrowLeft size={20} />
                        </Button>

                        <div className="p-3 rounded-2xl shadow-inner bg-emerald-100 text-emerald-600">
                            <PackageCheck size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 uppercase leading-none">{selectedPO.provider_name}</h3>
                            <p className="text-[9px] font-black uppercase text-emerald-600 mt-1 tracking-widest leading-none">FOLIO OC: {selectedPO.folio}</p>
                            <p className="text-[8px] font-black uppercase text-slate-400 mt-1 tracking-tighter leading-none">VALIDACIÓN FÍSICA</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-row items-center gap-3">
                        <div className="text-right">
                            <label className="block text-[8px] font-black text-emerald-700 uppercase tracking-widest mb-1 text-left">Factura Chofer *</label>
                            <input 
                                className="font-black text-[11px] px-3 py-1.5 w-32 bg-white border border-emerald-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-emerald-500 uppercase outline-none shadow-sm h-8" 
                                placeholder="Folio" 
                                value={invoiceFolio} 
                                onChange={(e) => setInvoiceFolio(e.target.value)}
                            />
                        </div>
                        <div className="text-right">
                            <label className="block text-[8px] font-black text-emerald-700 uppercase tracking-widest mb-1 text-left">Monto (c/IVA) *</label>
                            <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 font-black text-slate-400 text-[10px]">$</span>
                                <input 
                                    className={`font-black text-[11px] py-1.5 pl-5 pr-2 w-32 bg-white border rounded-lg focus:outline-none shadow-sm h-8 ${
                                        isFinancialBlocked 
                                        ? 'border-rose-400 text-rose-600 focus:ring-2 focus:ring-rose-500' 
                                        : 'border-emerald-200 text-emerald-700 focus:ring-2 focus:ring-emerald-500'
                                    }`}
                                    placeholder="0.00" 
                                    value={displayTotal} 
                                    onChange={(e) => handleAmountInput(e.target.value)}
                                    onBlur={handleBlur}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-8 py-4 text-left w-32">SKU</th>
                            <th className="px-4 py-4 text-left">Descripción</th>
                            <th className="px-4 py-4 text-center">Ordenadas</th>
                            <th className="px-4 py-4 text-center">Ya Recibidas</th>
                            <th className="px-4 py-4 text-center">Pendientes</th>
                            <th className="px-4 py-4 text-center w-32">Esta Entrega</th>
                            <th className="px-4 py-4 text-center w-32">P. Unit</th>
                            <th className="px-8 py-4 text-right">Proyecto</th>
                            <th className="px-8 py-4 text-right w-40">Importe</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {(selectedPO.items || []).map((item: any, idx: number) => {
                                    const price = item.unit_price || item.expected_cost || item.price || 0;
                                    const ordered = item.qty || 0;
                                    const alreadyReceived = Number(item.quantity_received || 0);
                                    const pending = Math.max(ordered - alreadyReceived, 0);
                                    const thisDelivery = Number(receivedItems[idx]) || 0;
                                    const effectivePrice = editedPrices[idx] !== undefined ? Number(editedPrices[idx]) : price;
                                    const total = (thisDelivery > 0 ? thisDelivery : ordered) * effectivePrice;
                                    const isComplete = alreadyReceived >= ordered;
                                    const hasDiscrepancy = thisDelivery > pending;

                            return (
                                <tr key={idx} className={`hover:bg-slate-50/30 transition-colors ${hasDiscrepancy ? 'bg-amber-50/20' : ''}`}>
                                    <td className="px-8 py-3 font-black text-indigo-600 text-[11px] uppercase">{item.sku || 'S/SKU'}</td>
                                    <td className="px-4 py-3">
                                        <input
                                            type="text"
                                            disabled={isComplete}
                                            className="w-full font-bold text-slate-700 text-xs uppercase bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none disabled:text-slate-400 disabled:cursor-not-allowed px-1 py-0.5"
                                            value={editedDescriptions[idx] !== undefined ? editedDescriptions[idx] : (item.name || '')}
                                            onChange={(e) => !isComplete && handleDescriptionChange(idx, e.target.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center text-xs font-black text-slate-600">{ordered}</td>
                                    <td className="px-4 py-3 text-center text-xs font-bold text-emerald-600">{alreadyReceived > 0 ? alreadyReceived : '—'}</td>
                                    <td className="px-4 py-3 text-center text-xs font-black text-slate-600">
                                        {isComplete 
                                            ? <span className="text-emerald-600 font-black">✓ Completo</span>
                                            : <span className="text-amber-600 font-black">{pending}</span>
                                        }
                                    </td>
                                    <td className="px-4 py-3 text-center align-middle">
                                        <div className="flex justify-center">
                                            <input 
                                                type="number"
                                                min="0"
                                                disabled={isComplete}
                                                className={`h-6 w-14 text-center font-black text-xs border rounded outline-none transition-colors ${
                                                    isComplete
                                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                                    : hasDiscrepancy 
                                                    ? 'bg-amber-100 border-amber-300 text-amber-800' 
                                                    : 'border-slate-200 text-emerald-600 bg-white focus:border-emerald-500'
                                                }`}
                                                value={receivedItems[idx]}
                                                onChange={(e) => !isComplete && handleReceivedQtyChange(idx, e.target.value)}
                                            />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center align-middle">
                                        <div className="flex justify-center">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                disabled={isComplete}
                                                className="h-6 w-20 text-center font-black text-xs border rounded outline-none border-slate-200 text-slate-700 bg-white focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                                                value={editedPrices[idx] !== undefined ? editedPrices[idx] : String(price)}
                                                onChange={(e) => !isComplete && handlePriceChange(idx, e.target.value)}
                                            />
                                        </div>
                                    </td>
                                    <td className="px-8 py-3 text-right">
                                        <span className="text-[10px] font-black text-rose-600 uppercase">{item.project_name || "GENERAL"}</span>
                                    </td>
                                    <td className="px-8 py-3 text-right text-xs font-black text-slate-800">${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>


                <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t border-slate-100 mt-6">
                    <div className="flex gap-4">
                        <Button 
                            onClick={handleSubmit} 
                            disabled={isSubmitting || isCancelling}
                            className="font-black uppercase text-xs h-12 px-10 shadow-sm transition-colors bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            <Save size={16} className="mr-3" /> {isSubmitting ? 'Guardando...' : 'Confirmar Ingreso'}
                        </Button>
                        
                        {/* EL NUEVO BOTÓN DE PÁNICO */}
                        <Button 
                            onClick={handleCancelOrder} 
                            disabled={isSubmitting || isCancelling} 
                            variant="outline"
                            className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 font-black uppercase text-[10px] h-12 px-6 shadow-sm transition-all"
                        >
                            <Ban size={14} className="mr-2" /> Rechazar y Cancelar OC
                        </Button>
                        {canDeclare && selectedPO?.status === 'RECIBIDA_PARCIAL' && (
                            <Button
                                onClick={handleDeclareSatisfied}
                                disabled={isSubmitting || declaringSatisfied}
                                variant="outline"
                                className="border-amber-300 text-amber-700 hover:bg-amber-50 font-black uppercase text-[10px] h-12 px-6 shadow-sm transition-all"
                            >
                                <CheckCircle2 size={14} className="mr-2" /> OC Satisfecha
                            </Button>
                        )}
                    </div>
                    <div className="w-80 space-y-1 pr-14">
                        <div className="flex justify-between items-center text-slate-500">
                            <span className="text-[10px] font-black uppercase">Subtotal</span>
                            <span className="text-sm font-bold">${subtotalCalc.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-500">
                            <span className="text-[10px] font-black uppercase">Tasa IVA</span>
                            <select
                                value={taxRate}
                                onChange={(e) => setTaxRate(Number(e.target.value))}
                                className="text-xs font-bold border border-slate-200 rounded px-2 py-1 outline-none focus:border-indigo-500"
                            >
                                <option value={0.16}>16%</option>
                                <option value={0.08}>8%</option>
                                <option value={0}>Exento (0%)</option>
                            </select>
                        </div>
                        <div className="flex justify-between items-center text-slate-500 border-b border-slate-200 pb-2">
                            <span className="text-[10px] font-black uppercase">IVA ({(taxRate * 100).toFixed(0)}%)</span>
                            <span className="text-sm font-bold">${ivaCalc.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-[11px] font-black text-emerald-600 uppercase">Total Esperado</span>
                            <span className="text-3xl font-black text-slate-900">${expectedTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InventoryReceptionPage;