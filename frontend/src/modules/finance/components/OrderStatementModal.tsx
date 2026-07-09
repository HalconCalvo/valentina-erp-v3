import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Receipt, CheckCircle, Clock, FileText, Package, AlertCircle, PieChart, Users, Coins, Pencil } from 'lucide-react';
import { SalesOrder } from '../../../types/sales';
import { salesService } from '../../../api/sales-service';

/** Días desde emisión hasta hoy; solo documentos sin pago registrado / no pagados. */
function daysOpenForCxc(cxc: {
    status?: string;
    invoice_date?: string;
    payment_date?: string | null;
    created_at?: string;
}): number | null {
    const paid = String(cxc.status ?? '').toUpperCase() === 'PAID';
    if (paid || cxc.payment_date) return null;
    const inv = cxc.invoice_date || cxc.created_at;
    if (!inv) return null;
    const d0 = new Date(inv);
    return Math.max(0, Math.ceil((Date.now() - d0.getTime()) / (1000 * 60 * 60 * 24)));
}

interface OrderStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: SalesOrder;
    onSuccess: () => void | Promise<void>;
    onOpenInvoiceModal?: (order: SalesOrder) => void;
    /** Si existe, al guardar OC solo se fusiona en el padre (sin refrescar tablas de tesorería/listados). */
    onOrderPatch?: (patch: Partial<SalesOrder>) => void;
    readOnly?: boolean;
}

/** Inputs no controlados por el modal padre: evita re-renders y pérdida de foco al teclear. */
const RayosXOcQuickEdit: React.FC<{
    order: SalesOrder;
    disabled: boolean;
    onQuickSave: (folio: string, dateYmd: string) => Promise<void>;
}> = ({ order, disabled, onQuickSave }) => {
    const folioRef = useRef<HTMLInputElement>(null);
    const dateRef = useRef<HTMLInputElement>(null);
    const savingRef = useRef(false);

    const initialFolio = String((order as any).client_po_folio ?? '');
    const rawDate = (order as any).client_po_date;
    const initialDate = rawDate ? String(rawDate).slice(0, 10) : '';

    const maybeSave = async () => {
        if (disabled || savingRef.current) return;
        const folio = folioRef.current?.value?.trim() ?? '';
        const dateYmd = dateRef.current?.value ?? '';
        const prevFolio = initialFolio.trim();
        const prevDate = initialDate;
        if (folio === prevFolio && dateYmd === prevDate) return;
        savingRef.current = true;
        try {
            await onQuickSave(folio, dateYmd);
        } finally {
            savingRef.current = false;
        }
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
                <label className="text-[10px] font-bold text-teal-700 uppercase">Folio</label>
                <input
                    ref={folioRef}
                    className="w-full mt-1 border border-teal-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                    defaultValue={initialFolio}
                    onBlur={() => void maybeSave()}
                    disabled={disabled}
                />
            </div>
            <div>
                <label className="text-[10px] font-bold text-teal-700 uppercase">Fecha</label>
                <input
                    ref={dateRef}
                    type="date"
                    className="w-full mt-1 border border-teal-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                    defaultValue={initialDate || undefined}
                    onBlur={() => void maybeSave()}
                    disabled={disabled}
                />
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void maybeSave()}
                    disabled={disabled}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                >
                    Guardar OC
                </button>
                <span className="text-[10px] text-teal-700 self-center">También guarda al salir del campo (blur).</span>
            </div>
        </div>
    );
};

export const OrderStatementModal: React.FC<OrderStatementModalProps> = ({
    isOpen,
    onClose,
    order,
    onSuccess,
    onOpenInvoiceModal,
    onOrderPatch,
    readOnly = false,
}) => {
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
    const canEditOcInRayos = !readOnly && ['ADMIN', 'ADMINISTRADOR', 'GERENCIA', 'DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);
    const canEditProjectName = ['DIRECTOR', 'DIRECCION', 'DIRECTION', 'GERENCIA', 'SALES', 'VENTAS'].includes(userRole);
    const canEditAdvance = ['DIRECTOR', 'DIRECCION', 'DIRECTION', 'GERENCIA'].includes(userRole);
    const [editingAdvance, setEditingAdvance] = useState(false);
    const [advanceDraft, setAdvanceDraft] = useState<string>('');
    const [savingAdvance, setSavingAdvance] = useState(false);
    const [displayAdvance, setDisplayAdvance] = useState<number>(Number(order.advance_invoice_amount) || 0);

    const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);
    const [ocSaving, setOcSaving] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [displayName, setDisplayName] = useState(order.project_name);

    // --- Camino A: panel de solo-lectura de abonos por factura (los abonos nacen en Tesorería) ---
    const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
    const [installmentsByInvoice, setInstallmentsByInvoice] = useState<Record<number, any>>({});
    const [loadingInstallments, setLoadingInstallments] = useState<number | null>(null);
    /** Remount de inputs OC (defaultValue) tras guardado puntual sin refrescar listados. */
    const [ocEditorEpoch, setOcEditorEpoch] = useState(0);
    /** customer_payment_id → comisión (tabla sales_commissions) */
    const [commissionByPaymentId, setCommissionByPaymentId] = useState<
        Record<number, { id: number; is_paid: boolean }>
    >({});

    // ESCUDO: Aniquilar clones en la lista visual de Rayos X
    const uniqueItems = useMemo(() => {
        if (!order || !order.items) return [];
        return Array.from(new Map(order.items.map(item => [item.id, item])).values());
    }, [order]);

    useEffect(() => {
        setOcEditorEpoch(0);
    }, [order?.id]);

    useEffect(() => {
        setDisplayName(order.project_name);
        setEditingName(false);
    }, [order?.id, order.project_name]);

    useEffect(() => {
        setDisplayAdvance(Number(order.advance_invoice_amount) || 0);
    }, [order.advance_invoice_amount, order.id]);

    useEffect(() => {
        if (!isOpen || !order?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const list = await salesService.getCommissions();
                if (cancelled) return;
                const m: Record<number, { id: number; is_paid: boolean }> = {};
                list.forEach((c) => {
                    if (c.sales_order_id === order.id) {
                        m[c.customer_payment_id] = { id: c.id, is_paid: c.is_paid };
                    }
                });
                setCommissionByPaymentId(m);
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, order?.id]);

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
    const advanceInvoiced = order.payments
        ?.filter(p => p.payment_type === 'ADVANCE')
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const advancePending = displayAdvance - advanceInvoiced;
    const pct = order.advance_percent || 60;
    const expectedAdvance = totalOrder * (pct / 100);
    const isWaitingAdvance = order.status === 'WAITING_ADVANCE';

    const toggleInvoicePanel = async (cxcId: number) => {
        const willExpand = expandedInvoiceId !== cxcId;
        setExpandedInvoiceId(willExpand ? cxcId : null);
        if (willExpand && installmentsByInvoice[cxcId] === undefined) {
            setLoadingInstallments(cxcId);
            try {
                const data = await salesService.getInstallments(cxcId);
                setInstallmentsByInvoice((prev) => ({ ...prev, [cxcId]: data }));
            } catch (e) {
                console.error(e);
                setInstallmentsByInvoice((prev) => ({ ...prev, [cxcId]: null }));
            } finally {
                setLoadingInstallments(null);
            }
        }
    };

    const handleQuickSaveOc = async (folio: string, dateYmd: string) => {
        if (!canEditOcInRayos || !order.id) return;
        setOcSaving(true);
        try {
            await salesService.updateOrder(order.id, {
                client_po_folio: folio || null,
                client_po_date: dateYmd ? `${dateYmd}T12:00:00` : null,
            } as any);
            if (onOrderPatch) {
                onOrderPatch({
                    client_po_folio: folio || null,
                    client_po_date: dateYmd ? `${dateYmd}T12:00:00` : null,
                } as Partial<SalesOrder>);
                setOcEditorEpoch((e) => e + 1);
            } else {
                onSuccess();
            }
        } catch (e) {
            console.error(e);
            alert('No se pudo guardar la OC del cliente.');
        } finally {
            setOcSaving(false);
        }
    };

    const handleSaveName = async () => {
        if (!nameDraft.trim()) return;
        setSavingName(true);
        try {
            await salesService.updateOrder(order.id, { project_name: nameDraft.trim() } as any);
            const trimmed = nameDraft.trim();
            setDisplayName(trimmed);
            setEditingName(false);
            if (onOrderPatch) {
                onOrderPatch({ project_name: trimmed });
            }
        } catch (err: any) {
            if (err?.response?.status === 403) {
                alert('No tienes permisos para editar el nombre del proyecto.');
            } else {
                alert('Error al guardar el nombre del proyecto.');
            }
        } finally {
            setSavingName(false);
        }
    };

    const handleSaveAdvance = async () => {
        const val = Number(advanceDraft);
        if (isNaN(val) || val < 0) { alert('Importe inválido.'); return; }
        setSavingAdvance(true);
        try {
            await salesService.updateOrder(order.id, { advance_invoice_amount: Number(val.toFixed(2)) } as any);
            setDisplayAdvance(Number(val.toFixed(2)));
            setEditingAdvance(false);
            if (onOrderPatch) onOrderPatch({ advance_invoice_amount: Number(val.toFixed(2)) } as any);
        } catch (err: any) {
            alert(err?.response?.status === 403 ? 'No tienes permisos.' : 'Error al guardar el anticipo.');
        } finally {
            setSavingAdvance(false);
        }
    };

    const handleCancelOv = async () => {
        const ok = window.confirm(
            "¿Cancelar esta OV?\n\n" +
            "Las instancias (Productos Vendidos) se cancelarán y la OV NO podrá " +
            "reactivarse. Si el cliente reaparece, deberás generar una OV nueva.\n\n" +
            "Los productos cotizados se conservan."
        );
        if (!ok) return;
        setCancelling(true);
        try {
            await salesService.cancelOv(order.id!);
            onSuccess();   // el padre refresca (await loadData) y luego cierra el modal
        } catch (err: any) {
            alert(err?.response?.data?.detail || "No se pudo cancelar la OV.");
        } finally {
            setCancelling(false);
        }
    };

    const handlePayCommission = async (customerPaymentId: number) => {
        if (readOnly) return;
        const comm = commissionByPaymentId[customerPaymentId];
        if (!comm) {
            alert('No hay registro de comisión para esta factura.');
            return;
        }
        if (comm.is_paid) return;
        if (!window.confirm('¿Confirmar pago de comisión al vendedor?')) return;

        setIsUpdatingCommission(true);
        try {
            await salesService.markCommissionPayrollPaid(comm.id, true);
            setCommissionByPaymentId((prev) => ({
                ...prev,
                [customerPaymentId]: { ...comm, is_paid: true },
            }));
            onSuccess();
            onClose();
        } catch (error: unknown) {
            console.error('Error al marcar comisión pagada:', error);
            alert('No se pudo registrar el pago de comisión.');
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
                            <span className="text-indigo-400">OV-{order.id?.toString().padStart(4, '0')}</span>
                            <span>|</span>
                            {editingName ? (
                                <span className="flex items-center gap-2 flex-1 min-w-0">
                                    <input
                                        className="bg-transparent border-b-2 border-indigo-400 outline-none text-white flex-1 min-w-0"
                                        value={nameDraft}
                                        onChange={e => setNameDraft(e.target.value)}
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveName()}
                                        disabled={savingName}
                                        className="text-xs font-bold text-emerald-400 hover:text-emerald-300 disabled:opacity-50 shrink-0"
                                    >
                                        {savingName ? '...' : 'Guardar'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingName(false)}
                                        className="text-xs font-bold text-slate-400 hover:text-slate-200 shrink-0"
                                    >
                                        Cancelar
                                    </button>
                                </span>
                            ) : (
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className="truncate">{displayName}</span>
                                    {canEditProjectName && (
                                        <button
                                            type="button"
                                            onClick={() => { setNameDraft(displayName || ''); setEditingName(true); }}
                                            className="text-slate-400 hover:text-indigo-300 shrink-0"
                                            title="Editar nombre del proyecto"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                    )}
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                            <Users size={12} className="text-slate-500" /> Cliente: <span className="text-slate-300">{clientName}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isWaitingAdvance && (
                            <button
                                type="button"
                                onClick={handleCancelOv}
                                disabled={cancelling}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-xs font-black rounded-lg shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <AlertCircle size={14} />
                                {cancelling ? "Cancelando..." : "Cancelar OV"}
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">

                    {!canEditOcInRayos && (
                        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 space-y-2">
                            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">OC del cliente (solo lectura)</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Folio</span>
                                    <p className="font-mono text-slate-900 mt-0.5">{(order as any).client_po_folio || '—'}</p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Fecha</span>
                                    <p className="text-slate-900 mt-0.5">
                                        {(order as any).client_po_date
                                            ? new Date((order as any).client_po_date).toLocaleDateString('es-MX')
                                            : '—'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {canEditOcInRayos && (
                        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-black text-teal-800 uppercase tracking-wider">OC del cliente (KPI vendedor / mes)</p>
                            <RayosXOcQuickEdit
                                key={`${order.id}-oc-${ocEditorEpoch}`}
                                order={order}
                                disabled={ocSaving}
                                onQuickSave={handleQuickSaveOc}
                            />
                            {ocSaving && <p className="text-[10px] text-teal-700 font-medium">Guardando…</p>}
                        </div>
                    )}
                    
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

                    <div className="bg-white border border-indigo-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Importe objetivo del anticipo</p>
                            {editingAdvance ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="number"
                                        className="border-b-2 border-indigo-400 outline-none text-lg font-black text-slate-800 w-40"
                                        value={advanceDraft}
                                        onChange={e => setAdvanceDraft(e.target.value)}
                                        autoFocus
                                    />
                                    <button type="button" onClick={() => void handleSaveAdvance()} disabled={savingAdvance}
                                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                                        {savingAdvance ? 'Guardando…' : 'Guardar'}
                                    </button>
                                    <button type="button" onClick={() => setEditingAdvance(false)}
                                        className="text-xs font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-lg font-black text-slate-800">{formatCurrency(displayAdvance)}</p>
                                    {canEditAdvance && (
                                        <button type="button"
                                            onClick={() => { setAdvanceDraft(String(displayAdvance)); setEditingAdvance(true); }}
                                            className="text-slate-400 hover:text-indigo-600"
                                            title="Editar importe del anticipo">
                                            <Pencil size={14} />
                                        </button>
                                    )}
                                </div>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">Facturado de anticipo: {formatCurrency(advanceInvoiced)} · Falta: {formatCurrency(Math.max(displayAdvance - advanceInvoiced, 0))}</p>
                        </div>
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
                             !(isWaitingAdvance && displayAdvance > 0 && advancePending <= 0.1) && (
                                <button 
                                    onClick={() => onOpenInvoiceModal(order)}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                >
                                    <Receipt size={14}/> Emitir Factura
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            {!order.payments || order.payments.length === 0 ? (
                                <p className="p-6 text-sm text-slate-500 text-center italic flex flex-col items-center gap-2">
                                    <AlertCircle size={24} className="text-slate-300"/>
                                    No se ha emitido ninguna factura para este proyecto aún.
                                </p>
                            ) : (
                                <table className="w-full text-sm border-collapse min-w-[720px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                            <th className="p-3 text-left">Tipo</th>
                                            <th className="p-3 text-left">Folio</th>
                                            <th className="p-3 text-left">Fecha factura</th>
                                            <th className="p-3 text-right">Importe</th>
                                            <th className="p-3 text-center">Días</th>
                                            <th className="p-3 text-right">Cobro</th>
                                            <th className="p-3 text-right">Comisión</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {order.payments.map((cxc: any) => {
                                            const commRow = commissionByPaymentId[cxc.id];
                                            const isCommissionPaid = commRow
                                                ? commRow.is_paid
                                                : cxc.commission_paid === true;
                                            const isFacturaPagada = cxc.status === 'PAID';
                                            const isFacturaCancelada = cxc.status === 'CANCELLED';
                                            const isExpanded = expandedInvoiceId === cxc.id;
                                            const daysOpen = daysOpenForCxc(cxc);

                                            return (
                                                <React.Fragment key={cxc.id}>
                                                <tr className="hover:bg-slate-50">
                                                    <td className="p-3">
                                                        <span
                                                            className={`px-2 py-0.5 text-[10px] font-black rounded uppercase tracking-wider ${
                                                                cxc.payment_type === 'ADVANCE'
                                                                    ? 'bg-orange-100 text-orange-700'
                                                                    : 'bg-blue-100 text-blue-700'
                                                            }`}
                                                        >
                                                            {cxc.payment_type === 'ADVANCE' ? 'ANTICIPO' : 'AVANCE'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 font-bold text-slate-800">{cxc.invoice_folio || 'S/F'}</td>
                                                    <td className="p-3 text-slate-600 whitespace-nowrap">
                                                        {formatDate(cxc.invoice_date || cxc.created_at || new Date().toISOString())}
                                                    </td>
                                                    <td className="p-3 text-right font-black text-slate-800">{formatCurrency(Number(cxc.amount))}</td>
                                                    <td className="p-3 text-center font-bold text-slate-700">
                                                        {daysOpen != null ? (
                                                            <span
                                                                className={
                                                                    daysOpen > 30
                                                                        ? 'text-red-600'
                                                                        : daysOpen > 15
                                                                          ? 'text-amber-600'
                                                                          : 'text-emerald-600'
                                                                }
                                                            >
                                                                {daysOpen}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 font-medium">—</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        {isFacturaPagada ? (
                                                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                                                <CheckCircle size={14} /> PAGADA
                                                            </span>
                                                        ) : isFacturaCancelada ? (
                                                            <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-bold bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                                                CANCELADA
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleInvoicePanel(cxc.id)}
                                                                className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm ${
                                                                    isExpanded
                                                                        ? 'bg-slate-600 hover:bg-slate-700 text-white'
                                                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                                                                }`}
                                                            >
                                                                <Receipt size={14} /> {isExpanded ? 'Cerrar' : 'Ver abonos'}
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        {isFacturaPagada ? (
                                                            <>
                                                                <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">
                                                                    {readOnly ? 'Tu Comisión' : 'Vendedor'}
                                                                </p>
                                                                {isCommissionPaid ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                        <CheckCircle size={12} /> Pagada
                                                                    </span>
                                                                ) : readOnly ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md border bg-slate-50 text-slate-500 border-slate-200">
                                                                        <Clock size={12} /> Pendiente
                                                                    </span>
                                                                ) : commRow ? (
                                                                    <button
                                                                        type="button"
                                                                        disabled={isUpdatingCommission}
                                                                        onClick={() => handlePayCommission(cxc.id)}
                                                                        className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md border bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-all shadow-sm disabled:opacity-50"
                                                                    >
                                                                        <Coins size={12} /> Pagar
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-[10px] text-amber-700 font-bold">Sin registro</span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-slate-300 text-xs">—</span>
                                                        )}
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="bg-slate-50/70">
                                                        <td colSpan={7} className="p-4">
                                                            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                                                                {loadingInstallments === cxc.id ? (
                                                                    <p className="text-xs text-slate-500 italic flex items-center gap-2">
                                                                        <Clock size={14} className="text-slate-400" /> Cargando abonos…
                                                                    </p>
                                                                ) : (() => {
                                                                    const data = installmentsByInvoice[cxc.id];
                                                                    if (!data) {
                                                                        return (
                                                                            <p className="text-xs text-slate-500 italic flex items-center gap-2">
                                                                                <AlertCircle size={14} className="text-slate-400" /> No se pudieron cargar los abonos.
                                                                            </p>
                                                                        );
                                                                    }
                                                                    const abonos: any[] = Array.isArray(data.abonos) ? data.abonos : [];
                                                                    const montoFactura = Number(data.monto_factura ?? cxc.amount ?? 0);
                                                                    const totalAbonado = Number(data.total_abonado ?? 0);
                                                                    const saldo = Number(data.saldo ?? Math.max(montoFactura - totalAbonado, 0));
                                                                    return (
                                                                        <>
                                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                                <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                                                                    <Receipt size={14} className="text-slate-400" /> Abonos de la factura {data.invoice_folio || cxc.invoice_folio || 'S/F'}
                                                                                </p>
                                                                                <span className="text-[11px] font-bold text-slate-600">
                                                                                    Abonado <strong className="text-emerald-700">{formatCurrency(totalAbonado)}</strong> de <strong className="text-slate-800">{formatCurrency(montoFactura)}</strong> — Saldo <strong className="text-amber-700">{formatCurrency(saldo)}</strong>
                                                                                </span>
                                                                            </div>

                                                                            {abonos.length === 0 ? (
                                                                                <p className="text-[11px] text-slate-500 italic">
                                                                                    Sin abonos registrados. Los abonos se registran desde Tesorería al conciliar el ingreso.
                                                                                </p>
                                                                            ) : (
                                                                                <div className="overflow-x-auto">
                                                                                    <table className="w-full text-xs border-collapse">
                                                                                        <thead>
                                                                                            <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                                                                                                <th className="py-2 pr-3 text-left">Fecha</th>
                                                                                                <th className="py-2 px-3 text-right">Monto</th>
                                                                                                <th className="py-2 px-3 text-left">Concepto</th>
                                                                                                <th className="py-2 pl-3 text-left">Referencia</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody className="divide-y divide-slate-50">
                                                                                            {abonos.map((ab: any) => (
                                                                                                <tr key={ab.id}>
                                                                                                    <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                                                                                                        {ab.payment_date ? formatDate(ab.payment_date) : '—'}
                                                                                                    </td>
                                                                                                    <td className="py-2 px-3 text-right font-bold text-slate-800">{formatCurrency(Number(ab.amount || 0))}</td>
                                                                                                    <td className="py-2 px-3 text-slate-600">{ab.notes || '—'}</td>
                                                                                                    <td className="py-2 pl-3 text-slate-500 font-mono">{ab.reference || '—'}</td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
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