import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle, FilePlus2, Link2, Plus, Send, Wrench } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import { TableActionCancelIcon, TableActionEditIcon, TABLE_ACTION_ICON_SIZE } from '@/lib/tableActionIcons';
import { changeOrderService } from '../../../api/change-order-service';
import { QUOTATION_STATUS_LABELS } from '../../../api/quotation-service';
import { salesService } from '../../../api/sales-service';
import { getErrorMessage } from '../../../hooks/useQuotations';
import type { CustomerCreditNote, OrderMoneySummary, SalesOrder } from '../../../types/sales';
import type { Quotation } from '../../../types/quotations';
import { ChangeOrderReviewModal } from '../../management/components/ChangeOrderReviewModal';
import { ChangeOrderModal } from './ChangeOrderModal';
import {
    canAuthorizeQuotations,
    canManageQuotations,
    QuotationActionDialogs,
    quotationStatusBadgeClass,
    type PendingQuotationAction,
} from './QuotationActions';

interface OrderChangesPanelProps {
    order: SalesOrder;
    /** Reloads the order after a change order is applied or money is captured. */
    onChanged: () => void | Promise<void>;
    readOnly?: boolean;
}

type MoneyDialog =
    | { kind: 'ADVANCE'; changeId: number; folio: string; amount: number }
    | { kind: 'CREDIT_NOTE'; amount: number }
    | { kind: 'APPLY_NOTE'; note: CustomerCreditNote }
    | { kind: 'CANCEL_NOTE'; note: CustomerCreditNote }
    | { kind: 'APPLY_CHANGE'; change: Quotation };

const OPEN = ['DRAFT', 'PENDING_AUTH', 'CHANGES_REQUESTED', 'AUTHORIZED'];
const CHANGEABLE_ORDER = ['WAITING_ADVANCE', 'SOLD', 'FINISHED'];
const FINANCE_ROLES = ['DIRECTOR', 'MANAGER', 'ADMIN'];
const todayYmd = () => new Date().toLocaleDateString('en-CA');
const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
const iconBtn = 'group p-1.5 rounded transition-colors hover:bg-indigo-50 disabled:opacity-50';

/** Change orders of an OV, the extra advance they require and the client credit notes they leave pending. */
export const OrderChangesPanel: React.FC<OrderChangesPanelProps> = ({ order, onChanged, readOnly = false }) => {
    const navigate = useNavigate();
    const orderId = order.id as number;
    const isFinance = FINANCE_ROLES.includes((localStorage.getItem('user_role') || '').toUpperCase());
    const manage = !readOnly && canManageQuotations();
    const [changes, setChanges] = useState<Quotation[]>([]);
    const [summary, setSummary] = useState<OrderMoneySummary | null>(null);
    const [editing, setEditing] = useState<{ change: Quotation | null } | null>(null);
    const [reviewId, setReviewId] = useState<number | null>(null);
    const [pendingAction, setPendingAction] = useState<PendingQuotationAction | null>(null);
    const [dialog, setDialog] = useState<MoneyDialog | null>(null);
    const [form, setForm] = useState({ folio: '', date: todayYmd(), amount: 0, reason: '', invoiceId: '' });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const [rows, money_] = await Promise.all([
                changeOrderService.list({ salesOrderId: orderId }),
                salesService.getMoneySummary(orderId),
            ]);
            setChanges(rows);
            setSummary(money_);
        } catch {
            toast.error('No se pudieron cargar las órdenes de cambio.');
        }
    }, [orderId]);

    useEffect(() => { void load(); }, [load]);

    const refresh = async () => {
        await load();
        await onChanged();
    };

    const hasOpenChange = changes.some((c) => OPEN.includes(c.status));
    const canCreate = manage && !hasOpenChange && CHANGEABLE_ORDER.includes(order.status);
    const lastApplied = changes.find((c) => c.status === 'APPLIED');
    const invoices = useMemo(
        () => (order.payments ?? []).filter((p) => p.status !== 'CANCELLED')
            .map((p) => ({ value: String(p.id), label: `${p.invoice_folio || 'S/F'} · ${p.payment_type} · ${money(Number(p.amount))}` })),
        [order.payments],
    );

    const openDialog = (next: MoneyDialog) => {
        const amount = 'amount' in next ? next.amount : 0;
        setForm({ folio: '', date: todayYmd(), amount, reason: '', invoiceId: '' });
        setDialog(next);
    };

    const runDialog = async () => {
        if (!dialog) return;
        setSaving(true);
        try {
            if (dialog.kind === 'ADVANCE') {
                await salesService.emitAdvanceInvoice(orderId, {
                    invoice_folio: form.folio.trim(), amount: form.amount, invoice_date: `${form.date}T12:00:00`,
                    change_quotation_id: dialog.changeId,
                });
            } else if (dialog.kind === 'CREDIT_NOTE') {
                await salesService.createCreditNote(orderId, {
                    folio: form.folio.trim(), note_date: `${form.date}T12:00:00`, amount: form.amount, reason: form.reason.trim(),
                    customer_payment_id: form.invoiceId ? Number(form.invoiceId) : null,
                    change_quotation_id: lastApplied?.id ?? null,
                });
            } else if (dialog.kind === 'APPLY_NOTE') {
                await salesService.applyCreditNote(dialog.note.id, Number(form.invoiceId));
            } else if (dialog.kind === 'CANCEL_NOTE') {
                await salesService.cancelCreditNote(dialog.note.id, form.reason.trim());
            } else {
                await changeOrderService.apply(dialog.change.id, {
                    client_po_folio: form.folio.trim() || null,
                    client_po_date: form.folio.trim() ? `${form.date}T12:00:00` : null,
                });
            }
            toast.success('Listo.');
            setDialog(null);
            await refresh();
        } catch (error) {
            toast.error(getErrorMessage(error, 'No se pudo completar la operación.'));
            if ((error as { response?: { status?: number } })?.response?.status === 409 && dialog.kind === 'APPLY_CHANGE') {
                setDialog(null);
                await load();
            }
        } finally {
            setSaving(false);
        }
    };

    const button = (title: string, onClick: () => void, icon: React.ReactNode) => (
        <button type="button" title={title} aria-label={title} onClick={onClick} className={iconBtn}>{icon}</button>
    );

    const columns: VTableColumn<Quotation>[] = [
        { key: 'folio', label: 'Folio', render: (c) => <span className="font-mono font-bold text-indigo-700">{c.folio}</span> },
        {
            key: 'status', label: 'Estado', render: (c) => (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${quotationStatusBadgeClass(c.status)}`}>{QUOTATION_STATUS_LABELS[c.status]}</span>
            ),
        },
        {
            key: 'change_reason', label: 'Motivo', render: (c) => (
                <div className="max-w-xs">
                    <p className="text-xs text-slate-700 truncate" title={c.change_reason ?? ''}>{c.change_reason}</p>
                    {c.status === 'CHANGES_REQUESTED' && c.changes_requested_reason && (
                        <p className="text-[10px] text-orange-600 truncate" title={c.changes_requested_reason}>Regresada: {c.changes_requested_reason}</p>
                    )}
                </div>
            ),
        },
        { key: 'total_price', label: 'Cambio (con IVA)', render: (c) => <span className={`font-bold ${c.total_price < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(c.total_price)}</span> },
        {
            key: 'actions', label: 'Acciones', render: (c) => (
                <div className="flex items-center gap-1">
                    {manage && ['DRAFT', 'CHANGES_REQUESTED'].includes(c.status) && (
                        <>
                            {button('Editar', () => setEditing({ change: c }), <TableActionEditIcon />)}
                            {button('Solicitar autorización', () => setPendingAction({ kind: 'REQUEST_AUTH', quotation: c }), <Send size={TABLE_ACTION_ICON_SIZE} className="text-amber-500" />)}
                        </>
                    )}
                    {c.status === 'PENDING_AUTH' && canAuthorizeQuotations() && !readOnly &&
                        button('Revisar y autorizar', () => setReviewId(c.id), <CheckCircle size={TABLE_ACTION_ICON_SIZE} className="text-indigo-600" />)}
                    {manage && c.status === 'AUTHORIZED' &&
                        button('Aplicar a la OV', () => openDialog({ kind: 'APPLY_CHANGE', change: c }), <Wrench size={TABLE_ACTION_ICON_SIZE} className="text-emerald-600" />)}
                    {manage && c.status === 'EXPIRED' &&
                        button('Renovar vigencia', () => setPendingAction({ kind: 'RENEW', quotation: c }), <CalendarClock size={TABLE_ACTION_ICON_SIZE} className="text-amber-600" />)}
                    {manage && OPEN.includes(c.status) &&
                        button('Cancelar orden de cambio', () => setPendingAction({ kind: 'CANCEL', quotation: c }), <TableActionCancelIcon />)}
                </div>
            ),
        },
    ];

    const noteColumns: VTableColumn<CustomerCreditNote>[] = [
        { key: 'folio', label: 'Folio', render: (n) => <span className={`font-mono font-bold ${n.status === 'CANCELLED' ? 'line-through text-slate-400' : ''}`}>{n.folio}</span> },
        { key: 'note_date', label: 'Fecha', render: (n) => n.note_date?.slice(0, 10) },
        { key: 'amount', label: 'Monto', render: (n) => money(n.amount) },
        { key: 'customer_payment_id', label: 'Factura', render: (n) => n.customer_payment_id ? (invoices.find((i) => i.value === String(n.customer_payment_id))?.label ?? `#${n.customer_payment_id}`) : 'Saldo a favor' },
        { key: 'reason', label: 'Motivo', render: (n) => <span className="text-xs" title={n.cancel_reason ?? n.reason}>{n.status === 'CANCELLED' ? `Cancelada: ${n.cancel_reason}` : n.reason}</span> },
        {
            key: 'actions', label: 'Acciones', render: (n) => n.status === 'ACTIVE' && isFinance && !readOnly ? (
                <div className="flex items-center gap-1">
                    {!n.customer_payment_id && button('Aplicar a una factura', () => openDialog({ kind: 'APPLY_NOTE', note: n }), <Link2 size={TABLE_ACTION_ICON_SIZE} className="text-indigo-600" />)}
                    {button('Cancelar nota de crédito', () => openDialog({ kind: 'CANCEL_NOTE', note: n }), <TableActionCancelIcon />)}
                </div>
            ) : null,
        },
    ];

    const dialogValid = (() => {
        if (!dialog) return false;
        if (dialog.kind === 'ADVANCE') return Boolean(form.folio.trim()) && form.amount > 0;
        if (dialog.kind === 'CREDIT_NOTE') return Boolean(form.folio.trim()) && form.amount > 0 && Boolean(form.reason.trim());
        if (dialog.kind === 'APPLY_NOTE') return Boolean(form.invoiceId);
        if (dialog.kind === 'CANCEL_NOTE') return Boolean(form.reason.trim());
        return true;
    })();

    const dialogTitle = !dialog ? '' : {
        ADVANCE: `Factura de anticipo complementario · ${'folio' in dialog ? dialog.folio : ''}`,
        CREDIT_NOTE: 'Capturar nota de crédito al cliente',
        APPLY_NOTE: 'Aplicar saldo a favor a una factura',
        CANCEL_NOTE: 'Cancelar nota de crédito',
        APPLY_CHANGE: `Aplicar ${dialog.kind === 'APPLY_CHANGE' ? dialog.change.folio : ''} a la OV`,
    }[dialog.kind];

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Órdenes de cambio</h3>
                <div className="flex items-center gap-2">
                    {manage && (
                        <button type="button" onClick={() => navigate(`/quotations/new?parent=${orderId}`)}
                            title="Cotización nueva ligada a esta OV (OV complementaria con anticipo y saldo propios)"
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg">
                            <FilePlus2 size={14} /> OV complementaria
                        </button>
                    )}
                    {canCreate && (
                        <button type="button" onClick={() => setEditing({ change: null })}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
                            <Plus size={14} /> Orden de cambio
                        </button>
                    )}
                </div>
            </div>
            <div className="p-4 space-y-3">
                {summary?.complementary_advances.map((adv) => (
                    <div key={adv.change_quotation_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                        <span><b>Anticipo complementario por {money(adv.amount - adv.invoiced)}</b> ({adv.folio}; facturado {money(adv.invoiced)}, cobrado {money(adv.paid)}). Las unidades nuevas no entran a producción hasta pagarlo.</span>
                        {isFinance && !readOnly && adv.amount - adv.invoiced > 0.01 && (
                            <button type="button" onClick={() => openDialog({ kind: 'ADVANCE', changeId: adv.change_quotation_id, folio: adv.folio, amount: Number((adv.amount - adv.invoiced).toFixed(2)) })}
                                className="px-3 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg">Registrar factura</button>
                        )}
                    </div>
                ))}
                {summary && summary.credit_note_pending > 0.01 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800">
                        <span><b>Nota de crédito por capturar: {money(summary.credit_note_pending)}</b>. Lo facturado supera el total nuevo de la OV; emítela en Compaq y captúrala aquí.</span>
                        {isFinance && !readOnly && (
                            <button type="button" onClick={() => openDialog({ kind: 'CREDIT_NOTE', amount: summary.credit_note_pending })}
                                className="px-3 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg">Capturar nota de crédito</button>
                        )}
                    </div>
                )}
                {summary && summary.unapplied_credit > 0.01 && (
                    <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-800">
                        <b>Saldo a favor del cliente: {money(summary.unapplied_credit)}</b>. Aplícalo a su siguiente factura.
                    </div>
                )}
                <VTable columns={columns} data={changes}
                    emptyState={{ title: 'Sin órdenes de cambio', description: 'Todo cambio de partidas o precios de esta OV pasa por una orden de cambio autorizada por Dirección.' }} />
                {(summary?.credit_notes.length ?? 0) > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Notas de crédito al cliente</h4>
                            {isFinance && !readOnly && summary!.credit_note_pending <= 0.01 && (
                                <button type="button" onClick={() => openDialog({ kind: 'CREDIT_NOTE', amount: 0 })} className="text-xs font-bold text-indigo-600 hover:underline">Capturar otra</button>
                            )}
                        </div>
                        <VTable columns={noteColumns} data={summary!.credit_notes} />
                    </div>
                )}
            </div>

            {editing && (
                <ChangeOrderModal isOpen order={order} change={editing.change} onClose={() => setEditing(null)} onSaved={refresh} />
            )}
            <ChangeOrderReviewModal changeId={reviewId} onClose={() => setReviewId(null)} onDone={refresh} />
            <QuotationActionDialogs pending={pendingAction} onClose={() => setPendingAction(null)} onDone={refresh} />

            <Modal isOpen={Boolean(dialog)} onClose={() => !saving && setDialog(null)} title={dialogTitle} size="sm" overlayZIndex={70}>
                {dialog && (
                    <div className="space-y-3">
                        {dialog.kind === 'APPLY_CHANGE' && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                Se aplicarán los cambios autorizados a la OV: partidas y unidades nuevas, cancelaciones con su motivo, totales, saldo y anticipo. Si la OV cambió desde la autorización, la orden regresa a cambios.
                            </div>
                        )}
                        {dialog.kind === 'CANCEL_NOTE' && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                La nota de crédito queda cancelada con fecha, usuario y motivo; el saldo de su factura vuelve a como estaba.
                            </div>
                        )}
                        {['ADVANCE', 'CREDIT_NOTE', 'APPLY_CHANGE'].includes(dialog.kind) && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{dialog.kind === 'APPLY_CHANGE' ? 'Folio OC del cliente (opcional)' : 'Folio'}</label>
                                    <Input value={form.folio} onChange={(e) => setForm({ ...form, folio: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
                                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                                </div>
                            </div>
                        )}
                        {['ADVANCE', 'CREDIT_NOTE'].includes(dialog.kind) && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto</label>
                                <Input type="number" step="0.01" min={0} className="text-right" value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
                            </div>
                        )}
                        {['CREDIT_NOTE', 'APPLY_NOTE'].includes(dialog.kind) && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{dialog.kind === 'CREDIT_NOTE' ? 'Factura que afecta (vacío = saldo a favor)' : 'Factura'}</label>
                                <SearchableSelect items={invoices} value={form.invoiceId} getLabel={(i) => i.label} getValue={(i) => i.value}
                                    onChange={(v) => setForm({ ...form, invoiceId: v })} placeholder="Buscar factura..." />
                            </div>
                        )}
                        {['CREDIT_NOTE', 'CANCEL_NOTE'].includes(dialog.kind) && (
                            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Motivo obligatorio..." />
                        )}
                        <div className="flex justify-between gap-3 pt-2">
                            <button type="button" disabled={saving} onClick={() => setDialog(null)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg disabled:opacity-50">Cerrar</button>
                            <button type="button" disabled={saving || !dialogValid} onClick={() => void runDialog()}
                                className="px-5 py-2 font-bold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                                {saving ? 'Procesando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default OrderChangesPanel;
