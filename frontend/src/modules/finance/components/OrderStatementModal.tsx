import React, { useState, useMemo } from 'react';
import { X, Receipt, CheckCircle, Clock, FileText, DollarSign, Package, AlertCircle, PieChart, Users, Coins } from 'lucide-react';
import { SalesOrder } from '../../../types/sales';
import { salesService } from '../../../api/sales-service';
import client from '../../../api/axios-client';

interface OrderStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: SalesOrder;
    onSuccess: () => void;
    onOpenInvoiceModal?: (order: SalesOrder) => void; 
    readOnly?: boolean; 
}

export const OrderStatementModal: React.FC<OrderStatementModalProps> = ({ 
    isOpen, onClose, order, onSuccess, onOpenInvoiceModal, readOnly = false 
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);
    
    // ---> MEMORIA VISUAL INSTANTÁNEA (OPTIMISTIC UI) <---
    const [commissionStatuses, setCommissionStatuses] = useState<Record<number, boolean>>({});

    // ESCUDO: Aniquilar clones en la lista visual de Rayos X
    const uniqueItems = useMemo(() => {
        if (!order || !order.items) return [];
        return Array.from(new Map(order.items.map(item => [item.id, item])).values());
    }, [order]);

    if (!isOpen || !order) return null;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const clientName = (order as any).client_name || (order as any).client?.full_name || (order as any).client?.name || (order as any).customer?.name || 'Cliente por Defecto';

    const totalOrder = order.total_price || 0;
    const totalInvoiced = order.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const totalPaidInBank = order.payments?.filter(p => p.status === 'PAID').reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const pendingToCollect = order.payments?.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const pendingToInvoice = totalOrder - totalInvoiced;
    const pct = order.advance_percent || 60;
    const expectedAdvance = totalOrder * (pct / 100);
    const isWaitingAdvance = order.status === 'WAITING_ADVANCE';

    const handleConfirmPayment = async (cxcId: number) => {
        if (!window.confirm('¿Confirmas que este dinero ya se reflejó en la cuenta bancaria? Esta acción liquidará la factura.')) return;
        
        setIsLoading(true);
        try {
            await salesService.confirmCXCPayment(order.id!, cxcId);
            onSuccess(); 
            // Cerramos el modal para forzar la recarga visual limpia si se liquida una factura
            onClose();
        } catch (error) {
            console.error("Error al confirmar el pago:", error);
            alert("Hubo un error al conciliar el pago. Revisa la consola.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleCommissionPaid = async (paymentId: number, currentStatus: boolean) => {
        if (readOnly) return; 
        
        const actionText = currentStatus ? "marcar como PENDIENTE" : "MARCAR COMO PAGADA";
        if (!window.confirm(`¿Estás seguro de ${actionText} la comisión de esta factura al vendedor?`)) return;

        setIsUpdatingCommission(true);
        try {
            await client.patch(`/sales/payments/${paymentId}`, { commission_paid: !currentStatus });
            
            // ---> REFLEJO INSTANTÁNEO EN PANTALLA <---
            setCommissionStatuses(prev => ({ ...prev, [paymentId]: !currentStatus }));
            
            onSuccess(); // Le avisa al servidor por detrás
        } catch (error: any) {
            console.error("Error al actualizar comisión:", error);
            alert("Hubo un error al actualizar el estatus de la comisión. Verifica la conexión.");
        } finally {
            setIsUpdatingCommission(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                
                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900 text-white">
                    <div>
                        <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                            <span className="text-indigo-400">OV-{order.id?.toString().padStart(4, '0')}</span> | {order.project_name}
                        </h2>
                        <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                            <Users size={12} className="text-slate-500" /> Cliente: <span className="text-slate-300">{clientName}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
                    
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm border border-indigo-200">
                                <PieChart size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Condiciones Comerciales (Arranque)</p>
                                <p className="text-sm font-medium text-slate-700 mt-0.5 flex items-center gap-1">
                                    Anticipo pactado en cotización: <strong className="font-black text-indigo-900 text-base">{pct}%</strong> 
                                    <span className="mx-2 text-indigo-300">|</span> 
                                    Monto a facturar: <strong className="font-black text-indigo-900 text-base">{formatCurrency(expectedAdvance)}</strong>
                                    <span className="text-[10px] font-bold text-indigo-500 ml-1 uppercase tracking-widest bg-indigo-100/50 px-2 py-0.5 rounded-md">
                                        (C/IVA)
                                    </span>
                                </p>
                            </div>
                        </div>
                        {isWaitingAdvance && order.payments?.length === 0 && (
                            <div className="hidden md:block text-right bg-white px-3 py-2 rounded-lg border border-indigo-100 shadow-sm">
                                <span className="flex items-center gap-2">
                                    <span className="relative flex h-2.5 w-2.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                                    </span>
                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Requiere Factura</p>
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valor del Proyecto c/IVA</p>
                            <p className="text-lg font-black text-slate-800">{formatCurrency(totalOrder)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Total Facturado</p>
                            <p className="text-lg font-black text-blue-700">{formatCurrency(totalInvoiced)}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Falta Facturar: {formatCurrency(pendingToInvoice)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm bg-amber-50">
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1"><Clock size={12}/> Por Cobrar (Vivo)</p>
                            <p className="text-lg font-black text-amber-700">{formatCurrency(pendingToCollect)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm bg-emerald-50">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle size={12}/> Cobrado (En Banco)</p>
                            <p className="text-lg font-black text-emerald-700">{formatCurrency(totalPaidInBank)}</p>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                                <Receipt size={16} className="text-slate-400"/>
                                Facturas Emitidas (Cuentas por Cobrar)
                            </h3>
                            {pendingToInvoice > 0.1 && !readOnly && onOpenInvoiceModal && 
                             !(isWaitingAdvance && order.payments?.some(p => p.payment_type === 'ADVANCE')) && (
                                <button 
                                    onClick={() => onOpenInvoiceModal(order)}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                >
                                    <Receipt size={14}/> Emitir Factura
                                </button>
                            )}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {!order.payments || order.payments.length === 0 ? (
                                <p className="p-6 text-sm text-slate-500 text-center italic flex flex-col items-center gap-2">
                                    <AlertCircle size={24} className="text-slate-300"/>
                                    No se ha emitido ninguna factura para este proyecto aún.
                                </p>
                            ) : (
                                order.payments.map((cxc: any) => {
                                    // ---> LEEMOS DE LA MEMORIA VISUAL O DE LA BASE DE DATOS <---
                                    const isCommissionPaid = commissionStatuses[cxc.id] !== undefined 
                                        ? commissionStatuses[cxc.id] 
                                        : cxc.commission_paid === true;
                                        
                                    const isFacturaPagada = cxc.status === 'PAID';

                                    return (
                                    <div key={cxc.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50 transition-colors">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase tracking-wider ${
                                                    cxc.payment_type === 'ADVANCE' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {cxc.payment_type === 'ADVANCE' ? 'ANTICIPO' : 'AVANCE'}
                                                </span>
                                                <span className="text-sm font-bold text-slate-700">Folio: {cxc.invoice_folio || 'S/F'}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <Clock size={12}/> Emitida: {formatDate(cxc.invoice_date || cxc.payment_date || new Date().toISOString())}
                                            </p>
                                        </div>
                                        
                                        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">Importe Exigible</p>
                                                <p className="text-base font-black text-slate-800">{formatCurrency(Number(cxc.amount))}</p>
                                            </div>
                                            
                                            <div className="w-32 flex justify-end">
                                                {isFacturaPagada ? (
                                                    <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                                        <CheckCircle size={14}/> PAGADA
                                                    </span>
                                                ) : (
                                                    !readOnly ? (
                                                        <button 
                                                            onClick={() => handleConfirmPayment(cxc.id)}
                                                            disabled={isLoading}
                                                            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                                                        >
                                                            <DollarSign size={14}/> Registrar Pago
                                                        </button>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-amber-600 text-xs font-bold bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                                            <Clock size={14}/> PENDIENTE
                                                        </span>
                                                    )
                                                )}
                                            </div>

                                            {isFacturaPagada && (
                                                <div className="w-36 flex justify-end border-l border-slate-200 pl-4 ml-2">
                                                    {readOnly ? (
                                                        <div className="flex flex-col items-end">
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Tu Comisión</p>
                                                            <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md border ${isCommissionPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                                {isCommissionPaid ? <><CheckCircle size={12}/> Depositada</> : <><Clock size={12}/> Por Depositar</>}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-end">
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Comisión Vendedor</p>
                                                            <button
                                                                disabled={isUpdatingCommission}
                                                                onClick={() => handleToggleCommissionPaid(cxc.id, isCommissionPaid)}
                                                                className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md border transition-all shadow-sm ${
                                                                    isCommissionPaid 
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                                                    : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
                                                                }`}
                                                            >
                                                                {isCommissionPaid ? <><CheckCircle size={12}/> Pagada</> : <><Coins size={12}/> Pagar Comisión</>}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )})
                            )}
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
                                <Package size={16} className="text-slate-400"/>
                                Desglose de Entregables (Instancias)
                            </h3>
                        </div>
                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                            {/* ESCUDO: Cortamos las instancias a la cantidad real que marca la OV */}
                            {uniqueItems.map((item: any) => {
                                const realInstances = item.instances ? item.instances.slice(0, item.quantity || 1) : [];
                                return realInstances.map((inst: any) => (
                                    <div key={inst.id} className="p-3 px-5 flex justify-between items-center hover:bg-slate-50 text-sm">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${inst.customer_payment_id ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                            <span className="font-bold text-slate-700">{inst.custom_name || inst.item_name}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                                                inst.customer_payment_id 
                                                ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                                                : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {inst.customer_payment_id ? 'FACTURADO' : 'PENDIENTE'}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            })}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};