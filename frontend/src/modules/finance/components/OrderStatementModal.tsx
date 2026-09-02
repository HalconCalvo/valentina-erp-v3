import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Receipt, CheckCircle, Clock, FileText, Package, AlertCircle, PieChart, Users, Coins, Pencil, Plus, PlusCircle, Trash2, Check, XCircle } from 'lucide-react';
import { SalesOrder } from '../../../types/sales';
import { salesService } from '../../../api/sales-service';
import axiosClient from '../../../api/axios-client';
import { AddItemsModal } from '../../sales/components/AddItemsModal';
import { toast } from '@/components/ui/VToast';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VCurrencyInput } from '@/components/ui/VCurrencyInput';
import { VToggle } from '@/components/ui/VToggle';
import { treasuryService } from '../../../api/treasury-service';
import type { BankAccount } from '../../../types/treasury';

type OrderStatementPendingConfirm =
    | { kind: 'CANCEL_OV' }
    | { kind: 'DELETE_INSTANCE'; itemId: number; inst: any }
    | { kind: 'DELETE_RESALE'; item: any }
    | { kind: 'ADD_INSTANCE'; item: any }
    | { kind: 'PAY_COMMISSION'; customerPaymentId: number };

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
    const savingRef = useRef(false);

    const initialFolio = String((order as any).client_po_folio ?? '');
    const rawDate = (order as any).client_po_date;
    const initialDate = rawDate ? String(rawDate).slice(0, 10) : '';
    const [folioDraft, setFolioDraft] = useState(initialFolio);
    const [dateDraft, setDateDraft] = useState(initialDate);

    useEffect(() => {
        setFolioDraft(initialFolio);
        setDateDraft(initialDate);
    }, [initialFolio, initialDate]);

    const maybeSave = async () => {
        if (disabled || savingRef.current) return;
        const folio = folioDraft.trim();
        const dateYmd = dateDraft;
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
                <Input
                    className="mt-1 border-teal-200 bg-white text-sm"
                    value={folioDraft}
                    onChange={(e) => setFolioDraft(e.target.value)}
                    onBlur={() => void maybeSave()}
                    disabled={disabled}
                />
            </div>
            <div>
                <label className="text-[10px] font-bold text-teal-700 uppercase">Fecha</label>
                <Input
                    type="date"
                    className="mt-1 border-teal-200 bg-white text-sm"
                    value={dateDraft || undefined}
                    onChange={(e) => setDateDraft(e.target.value)}
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

const INSTANCE_STATUS_META: Record<string, { label: string; cls: string }> = {
    PENDING:       { label: 'Pendiente',     cls: 'bg-slate-100 text-slate-600' },
    IN_PRODUCTION: { label: 'En Producción', cls: 'bg-blue-50 text-blue-700' },
    READY:         { label: 'Empacado',      cls: 'bg-cyan-50 text-cyan-700' },
    CARGADO:       { label: 'Cargado',       cls: 'bg-indigo-50 text-indigo-700' },
    INSTALLED:     { label: 'Instalado',     cls: 'bg-green-50 text-green-700' },
    CLOSED:        { label: 'Cerrado',       cls: 'bg-emerald-100 text-emerald-800' },
    WARRANTY:      { label: 'Garantía',      cls: 'bg-amber-50 text-amber-700' },
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
    const navigate = useNavigate();
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
    const hasAbsolutePower = ['ADMIN', 'ADMINISTRADOR', 'ADMINISTRACIÓN', 'ADMINISTRATION', 'FINANCE', 'FINANZAS', 'DIRECTOR', 'DIRECCION', 'DIRECTION', 'MANAGER'].includes(userRole);
    const canEditOcInRayos = !readOnly && ['ADMIN', 'ADMINISTRADOR', 'MANAGER', 'DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);
    const canEditProjectName = ['DIRECTOR', 'DIRECCION', 'DIRECTION', 'MANAGER', 'SALES', 'VENTAS'].includes(userRole);
    const canEditAdvance = ['DIRECTOR', 'DIRECCION', 'DIRECTION', 'MANAGER'].includes(userRole);
    const canRegisterInstallment = ['DIRECTOR', 'DIRECCION', 'DIRECTION', 'MANAGER'].includes(userRole);
    const canExpandOrder =
        ['DIRECTOR', 'DIRECCION', 'DIRECTION', 'MANAGER', 'SALES', 'VENTAS', 'ADMIN', 'ADMINISTRADOR'].includes(userRole)
        && ['ACCEPTED', 'WAITING_ADVANCE', 'SOLD', 'IN_PRODUCTION'].includes((order as any).status);
    const [showAddItems, setShowAddItems] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [editingResaleId, setEditingResaleId] = useState<number | null>(null);
    const [editQty, setEditQty] = useState<number>(1);
    const [editPrice, setEditPrice] = useState<number>(0);
    const [savingResale, setSavingResale] = useState(false);
    const [editingPriceItemId, setEditingPriceItemId] = useState<number | null>(null);
    const [editItemPrice, setEditItemPrice] = useState<number>(0);
    const [savingItemPrice, setSavingItemPrice] = useState(false);
    const [addingInstanceId, setAddingInstanceId] = useState<number | null>(null);
    const [localOrder, setLocalOrder] = useState<SalesOrder>(order);
    const [deliverablesTab, setDeliverablesTab] = useState<'instancia' | 'casa'>('instancia');
    useEffect(() => { setLocalOrder(order); }, [order]);
    const [editingAdvance, setEditingAdvance] = useState(false);
    const [advanceDraft, setAdvanceDraft] = useState<string>('');
    const [savingAdvance, setSavingAdvance] = useState(false);
    const [displayAdvance, setDisplayAdvance] = useState<number>(Number(order.advance_invoice_amount) || 0);

    const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);
    const [ocSaving, setOcSaving] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState<OrderStatementPendingConfirm | null>(null);

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

    const [editPaymentModal, setEditPaymentModal] = useState<{ open: boolean; cxc: any | null }>({ open: false, cxc: null });
    const [editPaymentForm, setEditPaymentForm] = useState<{ invoice_folio: string; invoice_date: string; amount: string; notes: string }>({
        invoice_folio: '', invoice_date: '', amount: '', notes: '',
    });
    const [cancelPaymentModal, setCancelPaymentModal] = useState<{ open: boolean; cxc: any | null }>({ open: false, cxc: null });
    const [cancelPaymentReason, setCancelPaymentReason] = useState<string>('');
    const [savingPaymentEdit, setSavingPaymentEdit] = useState(false);
    const [cancellingPayment, setCancellingPayment] = useState(false);

    const [installmentModal, setInstallmentModal] = useState<{ open: boolean; cxc: any | null }>({ open: false, cxc: null });
    const [installmentAmount, setInstallmentAmount] = useState<number>(0);
    const [installmentDate, setInstallmentDate] = useState('');
    const [installmentReference, setInstallmentReference] = useState('');
    const [installmentNotes, setInstallmentNotes] = useState('');
    const [installmentAccountId, setInstallmentAccountId] = useState('');
    const [installmentInstanceIds, setInstallmentInstanceIds] = useState<number[]>([]);
    const [installmentIsAdvance, setInstallmentIsAdvance] = useState(false);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);
    const [submittingInstallment, setSubmittingInstallment] = useState(false);

    // ESCUDO: Aniquilar clones en la lista visual de Rayos X
    const uniqueItems = useMemo(() => {
        if (!localOrder || !localOrder.items) return [];
        return Array.from(new Map(localOrder.items.map(item => [item.id, item])).values());
    }, [localOrder]);

    const unlinkedInstances = useMemo(() => {
        const list: { id: number; label: string }[] = [];
        uniqueItems.forEach((item: any) => {
            const realInstances = item.instances ? item.instances.slice(0, item.quantity || 1) : [];
            realInstances.forEach((inst: any) => {
                if (!inst.customer_payment_id) {
                    const house = [inst.street, inst.lot].filter(Boolean).join(' ');
                    list.push({
                        id: inst.id,
                        label: `${item.product_name} — ${inst.custom_name || 'Instancia'}${house ? ` (${house})` : ''}`,
                    });
                }
            });
        });
        return list;
    }, [uniqueItems]);

    const activeBankAccounts = useMemo(
        () => bankAccounts.filter((a) => a.is_active),
        [bankAccounts],
    );

    // Agrupa TODAS las instancias de la OV por casa (street + lot) para la vista "Por Casa".
    // Cada instancia lleva su product_name (partida), custom_name y estado.
    const housesInOrder = useMemo(() => {
        const map = new Map<string, { street: string; lot: string; key: string; items: any[] }>();
        const UNASSIGNED = '__unassigned__';
        uniqueItems.forEach((item: any) => {
            const realInstances = item.instances ? item.instances.slice(0, item.quantity || 1) : [];
            realInstances.forEach((inst: any) => {
                const hasCasa = inst.street || inst.lot;
                const key = hasCasa ? `${inst.street ?? ''}||${inst.lot ?? ''}` : UNASSIGNED;
                if (!map.has(key)) {
                    map.set(key, {
                        street: inst.street ?? '',
                        lot: inst.lot ?? '',
                        key,
                        items: [],
                    });
                }
                map.get(key)!.items.push({
                    id: inst.id,
                    product_name: item.product_name,
                    custom_name: inst.custom_name,
                    production_status: inst.production_status,
                    customer_payment_id: inst.customer_payment_id,
                });
            });
        });
        // Ordenar: casas con nombre primero (por street, luego lot), "Sin asignar" al final
        const groups = Array.from(map.values());
        groups.sort((a, b) => {
            if (a.key === UNASSIGNED) return 1;
            if (b.key === UNASSIGNED) return -1;
            return (a.street + a.lot).localeCompare(b.street + b.lot);
        });
        return groups;
    }, [uniqueItems]);

    const resaleItems = useMemo(() => {
        if (!localOrder || !localOrder.items) return [];
        return localOrder.items.filter((it: any) => it.is_resale);
    }, [localOrder]);

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
            } catch {
                /* ignore commission load errors */
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
            } catch {
                setInstallmentsByInvoice((prev) => ({ ...prev, [cxcId]: null }));
            } finally {
                setLoadingInstallments(null);
            }
        }
    };

    const handleOpenInstallmentModal = async (cxc: any) => {
        setInstallmentModal({ open: true, cxc });
        setInstallmentReference('');
        setInstallmentNotes('');
        setInstallmentAccountId('');
        setInstallmentInstanceIds([]);
        setInstallmentIsAdvance(false);
        setInstallmentDate(new Date().toISOString().slice(0, 10));

        let saldo = Number(cxc.amount || 0);
        try {
            const data = await salesService.getInstallments(cxc.id);
            saldo = Number(data.saldo ?? Math.max(Number(data.monto_factura ?? cxc.amount ?? 0) - Number(data.total_abonado ?? 0), 0));
            setInstallmentsByInvoice((prev) => ({ ...prev, [cxc.id]: data }));
        } catch {
            // keep saldo from invoice amount
        }
        setInstallmentAmount(saldo > 0 ? saldo : Number(cxc.amount || 0));

        setLoadingBankAccounts(true);
        try {
            const accounts = await treasuryService.getAccounts();
            setBankAccounts(accounts);
        } catch {
            toast.error('No se pudieron cargar las cuentas bancarias.');
            setBankAccounts([]);
        } finally {
            setLoadingBankAccounts(false);
        }
    };

    const toggleInstallmentInstance = (instanceId: number) => {
        setInstallmentInstanceIds((prev) =>
            prev.includes(instanceId) ? prev.filter((id) => id !== instanceId) : [...prev, instanceId],
        );
    };

    const handleSubmitInstallment = async () => {
        const cxc = installmentModal.cxc;
        if (!cxc?.id) return;
        if (installmentAmount <= 0) {
            toast.warning('El importe del abono debe ser mayor a cero.');
            return;
        }
        if (!installmentAccountId) {
            toast.warning('Selecciona la cuenta bancaria destino.');
            return;
        }

        setSubmittingInstallment(true);
        try {
            const payload: {
                amount: number;
                payment_date?: string | null;
                notes?: string | null;
                reference?: string | null;
                account_id?: number | null;
                instance_ids?: number[];
            } = {
                amount: installmentAmount,
                payment_date: installmentDate ? `${installmentDate}T12:00:00` : null,
                reference: installmentReference.trim() || null,
                notes: installmentNotes.trim() || null,
                account_id: Number(installmentAccountId),
            };
            if (!installmentIsAdvance && cxc.payment_type !== 'ADVANCE' && installmentInstanceIds.length > 0) {
                payload.instance_ids = installmentInstanceIds;
            }
            await salesService.registerInstallment(cxc.id, payload);
            toast.success('Abono registrado correctamente.');
            setInstallmentModal({ open: false, cxc: null });
            setInstallmentsByInvoice((prev) => {
                const next = { ...prev };
                delete next[cxc.id];
                return next;
            });
            await onSuccess();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'No se pudo registrar el abono.');
        } finally {
            setSubmittingInstallment(false);
        }
    };

    const handleOpenEditPayment = (cxc: any) => {
        setEditPaymentForm({
            invoice_folio: cxc.invoice_folio || '',
            invoice_date: cxc.invoice_date ? cxc.invoice_date.slice(0, 10) : '',
            amount: String(cxc.amount || ''),
            notes: cxc.notes || '',
        });
        setEditPaymentModal({ open: true, cxc });
    };

    const handleSaveEditPayment = async () => {
        if (!editPaymentModal.cxc || !order.id) return;
        const cxc = editPaymentModal.cxc;
        const notesOnly = cxc.status === 'PAID' || !!cxc.treasury_transaction_id;
        const body: Record<string, string | number> = {};

        if (notesOnly) {
            if (editPaymentForm.notes !== (cxc.notes || '')) {
                body.notes = editPaymentForm.notes;
            }
        } else {
            if (editPaymentForm.invoice_folio !== (cxc.invoice_folio || '')) {
                body.invoice_folio = editPaymentForm.invoice_folio;
            }
            const origDate = cxc.invoice_date ? cxc.invoice_date.slice(0, 10) : '';
            if (editPaymentForm.invoice_date !== origDate) {
                body.invoice_date = editPaymentForm.invoice_date
                    ? `${editPaymentForm.invoice_date}T12:00:00`
                    : '';
            }
            const newAmount = parseFloat(editPaymentForm.amount);
            const origAmount = Number(cxc.amount || 0);
            if (!isNaN(newAmount) && newAmount !== origAmount) {
                body.amount = newAmount;
            }
            if (editPaymentForm.notes !== (cxc.notes || '')) {
                body.notes = editPaymentForm.notes;
            }
        }

        if (Object.keys(body).length === 0) {
            setEditPaymentModal({ open: false, cxc: null });
            return;
        }

        setSavingPaymentEdit(true);
        try {
            await axiosClient.patch(`/sales/orders/${order.id}/payments/${cxc.id}`, body);
            setEditPaymentModal({ open: false, cxc: null });
            toast.success('Factura actualizada');
            await onSuccess();
        } catch (error: any) {
            if (error.response?.status === 422) {
                toast.error(error.response?.data?.detail || 'Error al actualizar la factura');
            } else {
                toast.error('Error al actualizar la factura');
            }
        } finally {
            setSavingPaymentEdit(false);
        }
    };

    const handleCancelPayment = async () => {
        if (!cancelPaymentModal.cxc || !order.id) return;
        if (!cancelPaymentReason.trim()) {
            toast.warning('Debes ingresar un motivo');
            return;
        }
        setCancellingPayment(true);
        try {
            await axiosClient.patch(
                `/sales/orders/${order.id}/payments/${cancelPaymentModal.cxc.id}/cancel`,
                { cancel_reason: cancelPaymentReason },
            );
            setCancelPaymentModal({ open: false, cxc: null });
            setCancelPaymentReason('');
            toast.success('Factura cancelada');
            await onSuccess();
        } catch (error: any) {
            if (error.response?.status === 422) {
                toast.error(error.response?.data?.detail || 'Error al cancelar la factura');
            } else {
                toast.error('Error al cancelar la factura');
            }
        } finally {
            setCancellingPayment(false);
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
        } catch {
            toast.error('No se pudo guardar la OC del cliente.');
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
                toast.error('No tienes permisos para editar el nombre del proyecto.');
            } else {
                toast.error('Error al guardar el nombre del proyecto.');
            }
        } finally {
            setSavingName(false);
        }
    };

    const handleSaveAdvance = async () => {
        const val = Number(advanceDraft);
        if (isNaN(val) || val < 0) { toast.warning('Importe inválido.'); return; }
        setSavingAdvance(true);
        try {
            await salesService.updateOrder(order.id, { advance_invoice_amount: Number(val.toFixed(2)) } as any);
            setDisplayAdvance(Number(val.toFixed(2)));
            setEditingAdvance(false);
            if (onOrderPatch) onOrderPatch({ advance_invoice_amount: Number(val.toFixed(2)) } as any);
        } catch (err: any) {
            toast.error(err?.response?.status === 403 ? 'No tienes permisos.' : 'Error al guardar el anticipo.');
        } finally {
            setSavingAdvance(false);
        }
    };

    const handleCancelOv = () => {
        setPendingConfirm({ kind: 'CANCEL_OV' });
    };

    const executeCancelOv = async () => {
        setCancelling(true);
        try {
            await salesService.cancelOv(order.id!);
            onSuccess();
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || 'No se pudo cancelar la OV.');
        } finally {
            setCancelling(false);
            setPendingConfirm(null);
        }
    };

    const refreshOrderInPlace = async () => {
        try {
            const fresh = await salesService.getOrderDetail((order as any).id);
            setLocalOrder(fresh as SalesOrder);
            if (onOrderPatch) onOrderPatch(fresh as Partial<SalesOrder>);
        } catch (e) {
            if (onOrderPatch) onOrderPatch({} as Partial<SalesOrder>);
        }
    };

    const handleDeleteInstance = (itemId: number, inst: any) => {
        if (inst.production_status !== 'PENDING' || inst.customer_payment_id) {
            return;
        }
        setPendingConfirm({ kind: 'DELETE_INSTANCE', itemId, inst });
    };

    const executeDeleteInstance = async (itemId: number, inst: any) => {
        try {
            setDeletingId(inst.id);
            await salesService.deleteInstance((order as any).id, itemId, inst.id);
            await refreshOrderInPlace();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'No se pudo eliminar la unidad.');
        } finally {
            setDeletingId(null);
            setPendingConfirm(null);
        }
    };

    const handleDeleteResale = (item: any) => {
        setPendingConfirm({ kind: 'DELETE_RESALE', item });
    };

    const executeDeleteResale = async (item: any) => {
        try {
            setDeletingId(item.id);
            await salesService.deleteResaleItem((order as any).id, item.id);
            await refreshOrderInPlace();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'No se pudo eliminar el accesorio.');
        } finally {
            setDeletingId(null);
            setPendingConfirm(null);
        }
    };

    const startEditResale = (item: any) => {
        setEditingResaleId(item.id);
        setEditQty(Number(item.quantity) || 1);
        setEditPrice(Number(item.unit_price) || 0);
    };
    const cancelEditResale = () => {
        setEditingResaleId(null);
    };
    const saveEditResale = async (item: any) => {
        if (editQty <= 0 || editPrice < 0) {
            toast.warning('Cantidad y precio deben ser válidos.');
            return;
        }
        try {
            setSavingResale(true);
            await salesService.patchResaleItem((order as any).id, item.id, {
                quantity: editQty,
                unit_price: editPrice,
            });
            setEditingResaleId(null);
            await refreshOrderInPlace();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'No se pudo editar el accesorio.');
        } finally {
            setSavingResale(false);
        }
    };

    const startEditItemPrice = (item: any) => {
        setEditingPriceItemId(item.id);
        setEditItemPrice(Number(item.unit_price) || 0);
    };
    const cancelEditItemPrice = () => setEditingPriceItemId(null);
    const saveEditItemPrice = async (item: any) => {
        if (editItemPrice < 0) { toast.warning('El precio no puede ser negativo.'); return; }
        try {
            setSavingItemPrice(true);
            await salesService.patchProductionPrice((order as any).id, item.id, editItemPrice);
            setEditingPriceItemId(null);
            await refreshOrderInPlace();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'No se pudo cambiar el precio.');
        } finally {
            setSavingItemPrice(false);
        }
    };
    const handleAddInstance = (item: any) => {
        setPendingConfirm({ kind: 'ADD_INSTANCE', item });
    };

    const executeAddInstance = async (item: any) => {
        try {
            setAddingInstanceId(item.id);
            await salesService.addInstance((order as any).id, item.id);
            await refreshOrderInPlace();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'No se pudo agregar la unidad.');
        } finally {
            setAddingInstanceId(null);
            setPendingConfirm(null);
        }
    };

    const handlePayCommission = (customerPaymentId: number) => {
        if (readOnly) return;
        const comm = commissionByPaymentId[customerPaymentId];
        if (!comm) {
            toast.warning('No hay registro de comisión para esta factura.');
            return;
        }
        if (comm.is_paid) return;
        setPendingConfirm({ kind: 'PAY_COMMISSION', customerPaymentId });
    };

    const executePayCommission = async (customerPaymentId: number) => {
        const comm = commissionByPaymentId[customerPaymentId];
        if (!comm) return;

        setIsUpdatingCommission(true);
        try {
            await salesService.markCommissionPayrollPaid(comm.id, true);
            setCommissionByPaymentId((prev) => ({
                ...prev,
                [customerPaymentId]: { ...comm, is_paid: true },
            }));
            onSuccess();
            onClose();
        } catch {
            toast.error('No se pudo registrar el pago de comisión.');
        } finally {
            setIsUpdatingCommission(false);
            setPendingConfirm(null);
        }
    };

    return (
        <>
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                
                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900 text-white">
                    <div>
                        <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                            <span className="text-indigo-400">OV-{order.id?.toString().padStart(4, '0')}</span>
                            <span>|</span>
                            {editingName ? (
                                <span className="flex items-center gap-2 flex-1 min-w-0">
                                    <Input
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
                        {canExpandOrder && (
                            <button
                                type="button"
                                onClick={() => setShowAddItems(true)}
                                className="flex items-center gap-1 px-3 py-1.5 mr-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                            >
                                <Plus size={14} /> Ampliar Orden
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => { onClose(); navigate(`/sales/edit/${order.id}`); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                        >
                            <Pencil size={14} /> Editar OV
                        </button>
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
                                    <Input
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
                        <div className="overflow-x-auto min-w-[720px]">
                            <VTable
                                columns={[
                                    {
                                        key: 'payment_type',
                                        label: 'Tipo',
                                        render: (cxc: any) => (
                                            <span
                                                className={`px-2 py-0.5 text-[10px] font-black rounded uppercase tracking-wider ${
                                                    cxc.payment_type === 'ADVANCE'
                                                        ? 'bg-orange-100 text-orange-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}
                                            >
                                                {cxc.payment_type === 'ADVANCE' ? 'ANTICIPO' : 'AVANCE'}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'invoice_folio',
                                        label: 'Folio',
                                        render: (cxc: any) => (
                                            <span className="font-bold text-slate-800">{cxc.invoice_folio || 'S/F'}</span>
                                        ),
                                    },
                                    {
                                        key: 'invoice_date',
                                        label: 'Fecha factura',
                                        render: (cxc: any) => (
                                            <span className="text-slate-600 whitespace-nowrap">
                                                {formatDate(cxc.invoice_date || cxc.created_at || new Date().toISOString())}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'amount',
                                        label: 'Importe',
                                        render: (cxc: any) => (
                                            <span className="block text-right font-black text-slate-800">
                                                {formatCurrency(Number(cxc.amount))}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'days_open',
                                        label: 'Días',
                                        render: (cxc: any) => {
                                            const daysOpen = daysOpenForCxc(cxc);
                                            return (
                                                <span className="block text-center font-bold text-slate-700">
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
                                                </span>
                                            );
                                        },
                                    },
                                    {
                                        key: 'cobro',
                                        label: 'Cobro',
                                        render: (cxc: any) => {
                                            const isFacturaPagada = cxc.status === 'PAID';
                                            const isFacturaCancelada = cxc.status === 'CANCELLED';
                                            return (
                                                <span className="block text-right">
                                                    {isFacturaPagada ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                                            <CheckCircle size={14} /> PAGADA
                                                        </span>
                                                    ) : isFacturaCancelada ? (
                                                        <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-bold bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                                            CANCELADA
                                                        </span>
                                                    ) : (
                                                        <div className="inline-flex items-center justify-end gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleInvoicePanel(cxc.id)}
                                                                title="Ver abonos"
                                                                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                                            >
                                                                <Receipt size={16} />
                                                            </button>
                                                            {canRegisterInstallment && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleOpenInstallmentModal(cxc)}
                                                                    title="Registrar Abono"
                                                                    className="p-1 rounded hover:bg-slate-100 text-emerald-500 hover:text-emerald-700 transition-colors"
                                                                >
                                                                    <PlusCircle size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </span>
                                            );
                                        },
                                    },
                                    {
                                        key: 'commission',
                                        label: 'Comisión',
                                        render: (cxc: any) => {
                                            const commRow = commissionByPaymentId[cxc.id];
                                            const isCommissionPaid = commRow
                                                ? commRow.is_paid
                                                : cxc.commission_paid === true;
                                            const isFacturaPagada = cxc.status === 'PAID';
                                            return (
                                                <span className="block text-right">
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
                                                </span>
                                            );
                                        },
                                    },
                                    {
                                        key: '_row_actions',
                                        label: '',
                                        width: '4rem',
                                        render: (cxc: any) => {
                                            const isFacturaPagada = cxc.status === 'PAID';
                                            const isFacturaCancelada = cxc.status === 'CANCELLED';
                                            const hasTreasuryPayment = !!cxc.treasury_transaction_id;
                                            const canEditRow =
                                                hasAbsolutePower
                                                && !isFacturaCancelada
                                                && (
                                                    (cxc.status === 'PENDING' && !hasTreasuryPayment)
                                                    || isFacturaPagada
                                                    || hasTreasuryPayment
                                                );
                                            const canCancelRow =
                                                hasAbsolutePower
                                                && cxc.status === 'PENDING'
                                                && !hasTreasuryPayment;
                                            if (!canEditRow) return null;
                                            return (
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEditPayment(cxc)}
                                                        className="text-slate-400 hover:text-indigo-600"
                                                        title={hasTreasuryPayment || isFacturaPagada ? 'Editar notas' : 'Editar factura'}
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    {canCancelRow && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setCancelPaymentReason('');
                                                                setCancelPaymentModal({ open: true, cxc });
                                                            }}
                                                            className="text-slate-400 hover:text-rose-600"
                                                            title="Cancelar factura"
                                                        >
                                                            <XCircle size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        },
                                    },
                                ]}
                                data={(order.payments ?? []) as unknown as Record<string, unknown>[]}
                                emptyState={{
                                    icon: <AlertCircle size={24} className="text-slate-300" />,
                                    title: 'No se ha emitido ninguna factura para este proyecto aún.',
                                }}
                                className="border-0 shadow-none rounded-none"
                            />
                            {expandedInvoiceId != null && (() => {
                                const cxc = order.payments?.find((p) => p.id === expandedInvoiceId);
                                if (!cxc) return null;
                                return (
                                    <div className="bg-slate-50/70 p-4 border-t border-slate-100">
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
                                                const abonoColumns: VTableColumn<any>[] = [
                                                    {
                                                        key: 'payment_date',
                                                        label: 'Fecha',
                                                        render: (ab) => (
                                                            <span className="text-slate-600 whitespace-nowrap">
                                                                {ab.payment_date ? formatDate(ab.payment_date) : '—'}
                                                            </span>
                                                        ),
                                                    },
                                                    {
                                                        key: 'amount',
                                                        label: 'Monto',
                                                        render: (ab) => (
                                                            <span className="block text-right font-bold text-slate-800">
                                                                {formatCurrency(Number(ab.amount || 0))}
                                                            </span>
                                                        ),
                                                    },
                                                    {
                                                        key: 'notes',
                                                        label: 'Concepto',
                                                        render: (ab) => (
                                                            <span className="text-slate-600">{ab.notes || '—'}</span>
                                                        ),
                                                    },
                                                    {
                                                        key: 'reference',
                                                        label: 'Referencia',
                                                        render: (ab) => (
                                                            <span className="text-slate-500 font-mono">{ab.reference || '—'}</span>
                                                        ),
                                                    },
                                                ];
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
                                                                Sin abonos registrados. Usa &quot;Registrar Abono&quot; para conciliar el ingreso.
                                                            </p>
                                                        ) : (
                                                            <VTable
                                                                columns={abonoColumns}
                                                                data={abonos}
                                                                className="border-0 shadow-none rounded-none text-xs"
                                                            />
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-sm font-black text-slate-700 flex items-center gap-2 mb-2">
                                <Package size={16} className="text-slate-400"/>
                                Desglose de Entregables
                            </h3>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => setDeliverablesTab('instancia')}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${deliverablesTab === 'instancia' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                                >
                                    Por Instancia
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeliverablesTab('casa')}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${deliverablesTab === 'casa' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                                >
                                    Por Casa
                                </button>
                            </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-3 space-y-3">
                          {deliverablesTab === 'instancia' && (
                            <>
                            {/* ESCUDO: Cortamos las instancias a la cantidad real que marca la OV */}
                            {uniqueItems.map((item: any) => {
                                const realInstances = item.instances ? item.instances.slice(0, item.quantity || 1) : [];
                                if (realInstances.length === 0) return null;
                                const allEditable = realInstances.every(
                                    (inst: any) => inst.production_status === 'PENDING' && !inst.customer_payment_id
                                );
                                return (
                                    <div key={item.id} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between" data-all-editable={allEditable}>
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-slate-700 truncate">{item.product_name}</p>
                                                <p className="text-[11px] text-slate-500">
                                                    {item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'} × {formatCurrency(item.unit_price || 0)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {editingPriceItemId === item.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min={0}
                                                            className="w-28 px-2 py-1 border border-slate-300 rounded text-sm text-right"
                                                            value={editItemPrice}
                                                            onChange={(e) => setEditItemPrice(Number(e.target.value))}
                                                            autoFocus
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => saveEditItemPrice(item)}
                                                            disabled={savingItemPrice}
                                                            className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                                                            title="Guardar precio"
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelEditItemPrice}
                                                            disabled={savingItemPrice}
                                                            className="p-1 text-slate-400 hover:text-slate-600"
                                                            title="Cancelar"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="text-sm font-black text-slate-700">
                                                            {formatCurrency((item.unit_price || 0) * (item.quantity || 1))}
                                                        </span>
                                                        {allEditable && (
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditItemPrice(item)}
                                                                className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                                                title="Editar precio de la partida"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddInstance(item)}
                                                            disabled={addingInstanceId === item.id}
                                                            className="p-1 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
                                                            title="Agregar una unidad"
                                                        >
                                                            <Plus size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="divide-y divide-slate-100 bg-white">
                                            {realInstances.map((inst: any) => (
                                                <div key={inst.id} className="py-2 pl-8 pr-4 flex justify-between items-center hover:bg-slate-50 text-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${inst.customer_payment_id ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                                        <span className="font-bold text-slate-700">{inst.custom_name || inst.item_name}</span>
                                                    </div>
                                                    <div className="text-right flex items-center justify-end">
                                                        <span className={`text-xs font-bold px-2 py-1 rounded ${
                                                            inst.customer_payment_id
                                                            ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                                            : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                            {inst.customer_payment_id ? 'FACTURADO' : 'PENDIENTE'}
                                                        </span>
                                                        {inst.production_status === 'PENDING' && !inst.customer_payment_id && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteInstance(item.id, inst)}
                                                                disabled={deletingId === inst.id}
                                                                className="ml-2 p-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                                                title="Eliminar esta unidad"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {resaleItems.length > 0 && (
                                <div className="mt-4 px-5 pb-3">
                                    <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                                        Accesorios de reventa
                                    </p>
                                    <div className="space-y-2">
                                        {resaleItems.map((item: any) => (
                                            <div key={item.id} className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2">
                                                {editingResaleId === item.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-bold text-slate-800 truncate">{item.product_name}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <label className="text-[10px] text-slate-500 uppercase">Cant.</label>
                                                                <Input
                                                                    type="number"
                                                                    min={1}
                                                                    className="w-16 px-2 py-1 border border-slate-300 rounded text-sm"
                                                                    value={editQty}
                                                                    onChange={(e) => setEditQty(Number(e.target.value))}
                                                                />
                                                                <label className="text-[10px] text-slate-500 uppercase">Precio</label>
                                                                <Input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min={0}
                                                                    className="w-24 px-2 py-1 border border-slate-300 rounded text-sm text-right"
                                                                    value={editPrice}
                                                                    onChange={(e) => setEditPrice(Number(e.target.value))}
                                                                />
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => saveEditResale(item)}
                                                            disabled={savingResale}
                                                            className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                                                            title="Guardar"
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelEditResale}
                                                            disabled={savingResale}
                                                            className="p-1 text-slate-400 hover:text-slate-600"
                                                            title="Cancelar"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-slate-800 truncate">{item.product_name}</p>
                                                            <p className="text-xs text-slate-500">
                                                                SKU {item.resale_sku ?? '—'} · Cant. {item.quantity}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center shrink-0">
                                                            <p className="text-sm font-black text-emerald-700">
                                                                {formatCurrency((item.unit_price || 0) * (item.quantity || 1))}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditResale(item)}
                                                                className="ml-3 p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                                                title="Editar accesorio"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteResale(item)}
                                                                disabled={deletingId === item.id}
                                                                className="ml-1 p-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                                                title="Eliminar accesorio"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            </>
                          )}

                          {deliverablesTab === 'casa' && (
                            <div className="space-y-3">
                              {housesInOrder.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">No hay instancias.</p>
                              ) : (
                                housesInOrder.map((house: any) => (
                                  <div key={house.key} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                    <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                                      <p className="text-sm font-black text-slate-700">
                                        {house.key === '__unassigned__'
                                          ? '⬜ Sin asignar'
                                          : `🏠 ${house.street}${house.street && house.lot ? ', ' : ''}${house.lot}`}
                                      </p>
                                      <span className="text-[11px] text-slate-500">{house.items.length} mueble{house.items.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="divide-y divide-slate-100 bg-white">
                                      {house.items.map((mueble: any) => {
                                        const meta = INSTANCE_STATUS_META[mueble.production_status] ?? { label: mueble.production_status, cls: 'bg-slate-100 text-slate-500' };
                                        return (
                                          <div key={mueble.id} className="py-2 px-4 flex justify-between items-center hover:bg-slate-50 text-sm">
                                            <span className="font-bold text-slate-700">{mueble.product_name}</span>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {mueble.customer_payment_id ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">FACTURADO</span>
                                              ) : (
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
        {showAddItems && (
            <AddItemsModal
                isOpen={showAddItems}
                onClose={() => setShowAddItems(false)}
                order={order}
                onSuccess={async () => {
                    setShowAddItems(false);
                    await refreshOrderInPlace();
                }}
            />
        )}
        {editPaymentModal.open && editPaymentModal.cxc && (
            <Modal
                isOpen={editPaymentModal.open}
                onClose={() => setEditPaymentModal({ open: false, cxc: null })}
                title={`Editar Factura ${editPaymentModal.cxc.invoice_folio || 'S/F'}`}
                size="sm"
            >
                <div className="flex flex-col gap-4">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Esta factura ya fue timbrada en Compaq. Los cambios en Valentina son internos y no modifican el CFDI fiscal.
                    </div>
                    {(() => {
                        const notesOnly =
                            editPaymentModal.cxc.status === 'PAID'
                            || !!editPaymentModal.cxc.treasury_transaction_id;
                        return (
                            <>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                        Folio de factura
                                    </label>
                                    <Input
                                        type="text"
                                        value={editPaymentForm.invoice_folio}
                                        onChange={(e) => setEditPaymentForm((f) => ({ ...f, invoice_folio: e.target.value }))}
                                        disabled={notesOnly}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                        Fecha de factura
                                    </label>
                                    <Input
                                        type="date"
                                        value={editPaymentForm.invoice_date}
                                        onChange={(e) => setEditPaymentForm((f) => ({ ...f, invoice_date: e.target.value }))}
                                        disabled={notesOnly}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                        Importe
                                    </label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={editPaymentForm.amount}
                                        onChange={(e) => setEditPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                                        disabled={notesOnly || !!editPaymentModal.cxc.treasury_transaction_id}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                        Notas
                                    </label>
                                    <Input
                                        type="text"
                                        value={editPaymentForm.notes}
                                        onChange={(e) => setEditPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                                    />
                                </div>
                            </>
                        );
                    })()}
                    <div className="flex items-center justify-between gap-4 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setEditPaymentModal({ open: false, cxc: null })}
                            disabled={savingPaymentEdit}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => void handleSaveEditPayment()}
                            disabled={savingPaymentEdit}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                        >
                            {savingPaymentEdit ? 'Guardando…' : 'Guardar cambios'}
                        </Button>
                    </div>
                </div>
            </Modal>
        )}
        {installmentModal.open && installmentModal.cxc && (
            <Modal
                isOpen={installmentModal.open}
                onClose={() => {
                    if (submittingInstallment) return;
                    setInstallmentModal({ open: false, cxc: null });
                }}
                title="Registrar Abono"
                size="md"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500">
                        Factura {installmentModal.cxc.invoice_folio || 'S/F'} — {formatCurrency(Number(installmentModal.cxc.amount || 0))}
                    </p>
                    <VCurrencyInput
                        label="Importe del abono *"
                        value={installmentAmount}
                        onChange={setInstallmentAmount}
                        min={0.01}
                        error={installmentAmount <= 0 ? 'El importe debe ser mayor a cero' : undefined}
                    />
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                            Fecha *
                        </label>
                        <Input
                            type="date"
                            value={installmentDate}
                            onChange={(e) => setInstallmentDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                            Referencia
                        </label>
                        <Input
                            type="text"
                            placeholder="Referencia bancaria o comprobante"
                            value={installmentReference}
                            onChange={(e) => setInstallmentReference(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                            Notas
                        </label>
                        <Input
                            type="text"
                            placeholder="Concepto del abono"
                            value={installmentNotes}
                            onChange={(e) => setInstallmentNotes(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                            Cuenta bancaria destino *
                        </label>
                        {loadingBankAccounts ? (
                            <p className="text-xs text-slate-500 italic">Cargando cuentas…</p>
                        ) : (
                            <SearchableSelect
                                items={activeBankAccounts}
                                value={installmentAccountId}
                                onChange={setInstallmentAccountId}
                                getLabel={(a) => `${a.name} (${a.account_number}) — ${formatCurrency(a.current_balance)}`}
                                getValue={(a) => String(a.id)}
                                placeholder="Buscar cuenta bancaria..."
                            />
                        )}
                    </div>
                    {installmentModal.cxc.payment_type !== 'ADVANCE' && unlinkedInstances.length > 0 && (
                        <VToggle
                            label="¿Es anticipo?"
                            checked={installmentIsAdvance}
                            onCheckedChange={(checked) => {
                                setInstallmentIsAdvance(checked);
                                if (checked) setInstallmentInstanceIds([]);
                            }}
                        />
                    )}
                    {!installmentIsAdvance && installmentModal.cxc.payment_type !== 'ADVANCE' && unlinkedInstances.length > 0 && (
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
                                Instancias cubiertas por este abono
                            </label>
                            <div className="max-h-40 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                                {unlinkedInstances.map((inst) => (
                                    <label
                                        key={inst.id}
                                        className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"
                                    >
                                        <Input
                                            type="checkbox"
                                            className="mt-1 w-4 h-4 rounded border-slate-300"
                                            checked={installmentInstanceIds.includes(inst.id)}
                                            onChange={() => toggleInstallmentInstance(inst.id)}
                                        />
                                        <span>{inst.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-4 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setInstallmentModal({ open: false, cxc: null })}
                            disabled={submittingInstallment}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => void handleSubmitInstallment()}
                            disabled={submittingInstallment || loadingBankAccounts}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                            {submittingInstallment ? 'Registrando…' : 'Confirmar abono'}
                        </Button>
                    </div>
                </div>
            </Modal>
        )}
        {cancelPaymentModal.open && cancelPaymentModal.cxc && (
            <Modal
                isOpen={cancelPaymentModal.open}
                onClose={() => {
                    if (cancellingPayment) return;
                    setCancelPaymentModal({ open: false, cxc: null });
                    setCancelPaymentReason('');
                }}
                title="Cancelar Factura"
                size="sm"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-slate-600 leading-relaxed">
                        Esta acción cancela la factura en Valentina y libera las instancias vinculadas.
                        Asegúrate de haber cancelado también el CFDI en Compaq antes de continuar.
                    </p>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                            Motivo de cancelación *
                        </label>
                        <Input
                            type="text"
                            autoFocus
                            placeholder="Describe el motivo..."
                            value={cancelPaymentReason}
                            onChange={(e) => setCancelPaymentReason(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-2">
                        <button
                            type="button"
                            onClick={() => {
                                setCancelPaymentModal({ open: false, cxc: null });
                                setCancelPaymentReason('');
                            }}
                            disabled={cancellingPayment}
                            className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleCancelPayment()}
                            disabled={cancellingPayment}
                            className="px-5 py-2 font-bold rounded-lg transition-colors disabled:opacity-50 bg-red-600 hover:bg-red-700 text-white"
                        >
                            {cancellingPayment ? 'Procesando…' : 'Confirmar cancelación'}
                        </button>
                    </div>
                </div>
            </Modal>
        )}
        {pendingConfirm && (
            <VConfirmDialog
                isOpen={pendingConfirm !== null}
                title={
                    pendingConfirm.kind === 'CANCEL_OV' ? 'Cancelar orden de venta'
                    : pendingConfirm.kind === 'DELETE_INSTANCE' ? 'Eliminar unidad'
                    : pendingConfirm.kind === 'DELETE_RESALE' ? 'Eliminar accesorio'
                    : pendingConfirm.kind === 'ADD_INSTANCE' ? 'Agregar unidad'
                    : 'Pagar comisión'
                }
                message={
                    pendingConfirm.kind === 'CANCEL_OV'
                        ? '¿Cancelar esta OV?'
                        : pendingConfirm.kind === 'DELETE_INSTANCE'
                        ? `¿Eliminar esta unidad (${pendingConfirm.inst.custom_name || 'instancia'})?`
                        : pendingConfirm.kind === 'DELETE_RESALE'
                        ? `¿Eliminar el accesorio "${pendingConfirm.item.product_name}"?`
                        : pendingConfirm.kind === 'ADD_INSTANCE'
                        ? `¿Agregar una unidad a "${pendingConfirm.item.product_name}"?`
                        : '¿Confirmar pago de comisión al vendedor?'
                }
                consequence={
                    pendingConfirm.kind === 'CANCEL_OV'
                        ? 'Las instancias se cancelarán y la OV no podrá reactivarse. Los productos cotizados se conservan.'
                        : pendingConfirm.kind === 'DELETE_INSTANCE' || pendingConfirm.kind === 'DELETE_RESALE'
                        ? 'Esta acción no se puede deshacer.'
                        : pendingConfirm.kind === 'ADD_INSTANCE'
                        ? 'Se agregará una nueva unidad al producto en la orden.'
                        : 'La comisión quedará marcada como pagada en nómina.'
                }
                variant={
                    pendingConfirm.kind === 'CANCEL_OV'
                    || pendingConfirm.kind === 'DELETE_INSTANCE'
                    || pendingConfirm.kind === 'DELETE_RESALE'
                        ? 'danger'
                        : 'default'
                }
                confirmLabel={
                    pendingConfirm.kind === 'CANCEL_OV' ? 'Sí, cancelar OV'
                    : pendingConfirm.kind === 'DELETE_INSTANCE' ? 'Sí, eliminar'
                    : pendingConfirm.kind === 'DELETE_RESALE' ? 'Sí, eliminar'
                    : pendingConfirm.kind === 'ADD_INSTANCE' ? 'Sí, agregar'
                    : 'Sí, confirmar pago'
                }
                onConfirm={async () => {
                    if (pendingConfirm.kind === 'CANCEL_OV') await executeCancelOv();
                    else if (pendingConfirm.kind === 'DELETE_INSTANCE') await executeDeleteInstance(pendingConfirm.itemId, pendingConfirm.inst);
                    else if (pendingConfirm.kind === 'DELETE_RESALE') await executeDeleteResale(pendingConfirm.item);
                    else if (pendingConfirm.kind === 'ADD_INSTANCE') await executeAddInstance(pendingConfirm.item);
                    else if (pendingConfirm.kind === 'PAY_COMMISSION') await executePayCommission(pendingConfirm.customerPaymentId);
                }}
                onCancel={() => setPendingConfirm(null)}
            />
        )}
        </>
    );
};