import React, { useState, useEffect, useMemo } from 'react';
import { X, FileText, CheckSquare, DollarSign, Calculator, AlertTriangle } from 'lucide-react';
import { SalesOrder, PaymentPayload, SalesOrderStatus } from '../../../types/sales';
import { salesService } from '../../../api/sales-service';

interface ReceivableChargeModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: SalesOrder;
    onSuccess: () => void;
}

export const ReceivableChargeModal: React.FC<ReceivableChargeModalProps> = ({ isOpen, onClose, order, onSuccess }) => {
    const isAdvance = order.status === 'WAITING_ADVANCE';
    
    const [invoiceFolio, setInvoiceFolio] = useState('');
    
    const [amount, setAmount] = useState<number>(0);
    const [amortizedAdvance, setAmortizedAdvance] = useState<number>(0);
    
    const [displayAmount, setDisplayAmount] = useState<string>('');
    const [displayAmortized, setDisplayAmortized] = useState<string>('');
    
    const [selectedInstances, setSelectedInstances] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const totalOrder = order.total_price || 0;
    const pct = order.advance_percent || 60;

    // ---> ESCOBA INVISIBLE: Limpiar la memoria al abrir <---
    useEffect(() => {
        if (isOpen) {
            setInvoiceFolio('');
            setSelectedInstances([]);
        }
    }, [isOpen]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
    };

    // ESCUDO 1: Deduplicar Items por si el backend los manda dobles
    const uniqueItems = useMemo(() => {
        if (!order.items) return [];
        return Array.from(new Map(order.items.map(item => [item.id, item])).values());
    }, [order.items]);

    // EL MULTIPLICADOR (Calculado con las piezas reales)
    const globalMultiplier = useMemo(() => {
        let rawSum = 0;
        uniqueItems.forEach((item: any) => {
            rawSum += (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
        });
        return rawSum > 0 ? totalOrder / rawSum : 1;
    }, [uniqueItems, totalOrder]);

    // LA LISTA LIMPIA DE INSTANCIAS
    const pendingInstances = useMemo(() => {
        if (isAdvance) return [];
        let instances: any[] = [];
        
        uniqueItems.forEach((item: any) => {
            // ESCUDO 2: Si el backend manda 16 instancias pero la cantidad es 8, cortamos la lista a 8.
            const realInstances = item.instances ? item.instances.slice(0, item.quantity || 1) : [];
            
            realInstances.forEach((inst: any) => {
                if (!inst.customer_payment_id) {
                    instances.push({ 
                        ...inst, 
                        unit_price: Number(item.unit_price) || 0, // <-- EL PRECIO REAL SIN DIVIDIR
                        item_name: item.product_name 
                    });
                }
            });
        });
        return instances;
    }, [uniqueItems, isAdvance]);

    // EL MOTOR FINANCIERO PERFECTO
    useEffect(() => {
        if (!isOpen) return; // Si la ventana está cerrada, no calcules nada

        if (isAdvance) {
            const calcAmount = totalOrder * (pct / 100);
            setAmount(Number(calcAmount.toFixed(2)));
            setDisplayAmount(new Intl.NumberFormat('en-US').format(Number(calcAmount.toFixed(2))));
            setAmortizedAdvance(0);
        } else {
            // 1. Suma base cruda de lo que palomeaste
            const rawValueOfSelected = pendingInstances
                .filter(inst => selectedInstances.includes(inst.id))
                .reduce((sum, inst) => sum + (Number(inst.unit_price) || 0), 0);
            
            // 2. Suma base cruda de TODA la orden
            let totalRawAllInstances = 0;
            uniqueItems.forEach((item: any) => {
                totalRawAllInstances += (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
            });

            // 3. Aplicar proporción al precio total (con IVA y Comisión)
            const ratio = totalRawAllInstances > 0 ? (rawValueOfSelected / totalRawAllInstances) : 1;
            const commercialValueOfSelected = totalOrder * ratio;

            // 4. Calcular Anticipo y Efectivo a cobrar
            const suggestedAmortization = commercialValueOfSelected * (pct / 100);
            const suggestedCash = commercialValueOfSelected - suggestedAmortization;

            setAmortizedAdvance(Number(suggestedAmortization.toFixed(2)));
            setDisplayAmortized(new Intl.NumberFormat('en-US').format(Number(suggestedAmortization.toFixed(2))));
            
            setAmount(Number(suggestedCash.toFixed(2)));
            setDisplayAmount(new Intl.NumberFormat('en-US').format(Number(suggestedCash.toFixed(2))));
        }
    }, [selectedInstances, isAdvance, pendingInstances, totalOrder, pct, uniqueItems, isOpen]);

    const handleCurrencyTyping = (
        e: React.ChangeEvent<HTMLInputElement>, 
        setMathValue: React.Dispatch<React.SetStateAction<number>>, 
        setDisplayValue: React.Dispatch<React.SetStateAction<string>>
    ) => {
        const rawValue = e.target.value;
        const cleanValue = rawValue.replace(/[^0-9.,]/g, '');
        const numericString = cleanValue.replace(/,/g, '');
        
        if (!isNaN(Number(numericString)) || numericString === '') {
            setMathValue(Number(numericString));
            if (numericString === '') {
                setDisplayValue('');
            } else if (numericString.endsWith('.')) {
                const formattedInt = new Intl.NumberFormat('en-US').format(Number(numericString.slice(0, -1)));
                setDisplayValue(`${formattedInt}.`);
            } else if (numericString.includes('.')) {
                const [intPart, decimalPart] = numericString.split('.');
                const formattedInt = new Intl.NumberFormat('en-US').format(Number(intPart));
                setDisplayValue(`${formattedInt}.${decimalPart.slice(0, 2)}`); 
            } else {
                setDisplayValue(new Intl.NumberFormat('en-US').format(Number(numericString)));
            }
        }
    };

    const handleSubmit = async () => {
        if (!isAdvance && selectedInstances.length === 0) {
            alert("Debes seleccionar al menos un producto para facturar el avance.");
            return;
        }

        setIsLoading(true);
        try {
            const payload: PaymentPayload = {
                invoice_folio: invoiceFolio.trim() === '' ? null : invoiceFolio.trim(),
                amount: Number(amount),
                amortized_advance: Number(amortizedAdvance),
                instance_ids: selectedInstances
            };

            if (isAdvance) {
                // 1. Guardamos el dinero
                await salesService.registerAdvancePayment(order.id!, payload);
                
                // 2. CANDADO: Empujamos la OV al siguiente estatus para que ya no pida anticipo
                await salesService.updateOrder(order.id!, { 
                    status: SalesOrderStatus.IN_PRODUCTION 
                });
            } else {
                await salesService.registerProgressPayment(order.id!, payload);
            }
            
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Error al registrar el cobro:", error);
            alert(error.response?.data?.detail || "Hubo un error al registrar el cobro. Revisa la consola.");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-lg font-black text-slate-800">
                            {isAdvance ? 'Registrar Cobro de Anticipo' : 'Registrar Factura por Avance'}
                        </h2>
                        <p className="text-xs text-slate-500 font-medium">Proyecto: {order.project_name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    
                    {!isAdvance && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <CheckSquare size={14}/> 1. Selecciona los Productos a Cobrar
                            </h3>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                                {pendingInstances.length === 0 ? (
                                    <p className="p-4 text-sm text-slate-500 text-center italic">No hay productos pendientes de cobro.</p>
                                ) : (
                                    pendingInstances.map(inst => (
                                        <label key={inst.id} className="flex items-center gap-3 p-3 hover:bg-white cursor-pointer transition-colors">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                                checked={selectedInstances.includes(inst.id)}
                                                onChange={() => {
                                                    setSelectedInstances(prev => 
                                                        prev.includes(inst.id) ? prev.filter(i => i !== inst.id) : [...prev, inst.id]
                                                    );
                                                }}
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-slate-700">{inst.custom_name || inst.item_name}</p>
                                            </div>
                                            <p className="text-sm font-black text-slate-600">{formatCurrency(inst.unit_price)}</p>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <DollarSign size={14}/> {isAdvance ? '1. Datos del Cobro' : '2. Configuración Financiera'}
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Folio de Factura (Opcional)</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <FileText size={16} className="text-slate-400" />
                                    </div>
                                    <input 
                                        type="text" 
                                        className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold"
                                        placeholder="Ej. F-023"
                                        value={invoiceFolio}
                                        onChange={(e) => setInvoiceFolio(e.target.value.toUpperCase())}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-emerald-600 uppercase">Efectivo a Cobrar MXN</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none font-black text-emerald-600">$</div>
                                    <input 
                                        type="text" 
                                        className="w-full pl-7 pr-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-black text-emerald-700"
                                        value={displayAmount}
                                        onChange={(e) => handleCurrencyTyping(e, setAmount, setDisplayAmount)}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {!isAdvance && (
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-[11px] font-bold text-amber-600 uppercase flex justify-between">
                                        <span>Descuento de la Bolsa de Anticipo (Amortización)</span>
                                        <span className="flex items-center gap-1"><Calculator size={12}/> Sugerido: {pct}%</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none font-black text-amber-600">$</div>
                                        <input 
                                            type="text" 
                                            className="w-full pl-7 pr-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-bold text-amber-700"
                                            value={displayAmortized}
                                            onChange={(e) => handleCurrencyTyping(e, setAmortizedAdvance, setDisplayAmortized)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                        <AlertTriangle size={10}/> Puedes editar este monto en acuerdos especiales.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                    <button onClick={handleSubmit} disabled={isLoading} className="px-6 py-2 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50">
                        {isLoading ? 'Procesando...' : 'Registrar en Sistema'}
                    </button>
                </div>
            </div>
        </div>
    );
};