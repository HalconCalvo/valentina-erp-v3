import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle, FileDown, Send, ThumbsDown, Unlock } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import {
    TableActionCancelIcon,
    TableActionEditIcon,
    TableActionViewIcon,
    TABLE_ACTION_ICON_SIZE,
} from '@/lib/tableActionIcons';
import { quotationService } from '../../../api/quotation-service';
import { getErrorMessage } from '../../../hooks/useQuotations';
import type { Quotation, QuotationStatus } from '../../../types/quotations';

export type QuotationActionKind =
    | 'REQUEST_AUTH'
    | 'REQUEST_CHANGES'
    | 'MARK_LOST'
    | 'CANCEL'
    | 'RENEW'
    | 'CONVERT';

export interface PendingQuotationAction {
    kind: QuotationActionKind;
    quotation: Quotation;
    /** Shown in the "Generar OV" dialog when the client already has an active OV with the same project name. */
    duplicateWarning?: string;
}

const currentRole = () => (localStorage.getItem('user_role') || '').toUpperCase().trim();
export const canAuthorizeQuotations = () => currentRole() === 'DIRECTOR';
export const canManageQuotations = () => ['DIRECTOR', 'MANAGER', 'SALES'].includes(currentRole());

export const quotationStatusBadgeClass = (status: QuotationStatus): string => {
  switch (status) {
    case 'DRAFT': return 'bg-slate-100 text-slate-700';
    case 'PENDING_AUTH': return 'bg-amber-100 text-amber-700';
    case 'CHANGES_REQUESTED': return 'bg-orange-100 text-orange-700';
    case 'AUTHORIZED': return 'bg-emerald-100 text-emerald-700';
    case 'CONVERTED': return 'bg-indigo-100 text-indigo-700';
    case 'LOST': return 'bg-rose-100 text-rose-700';
    case 'EXPIRED': return 'bg-amber-100 text-amber-800';
    case 'CANCELLED': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const todayYmd = () => new Date().toLocaleDateString('en-CA');

// --- Row buttons ---------------------------------------------------------------------------------

interface RowActionsProps {
    quotation: Quotation;
    onView: () => void;
    onEdit: () => void;
    onReview: () => void;
    onPdf: () => void;
    onAction: (kind: QuotationActionKind) => void;
    /** Hide the "view" button (e.g. when already on the quotation page). */
    hideView?: boolean;
}

const iconBtn = 'group p-1.5 rounded transition-colors hover:bg-indigo-50 disabled:opacity-50';

/** Icon-only actions available for a quotation in its current status (tooltip describes each one). */
export const QuotationRowActions: React.FC<RowActionsProps> = ({ quotation, onView, onEdit, onReview, onPdf, onAction, hideView = false }) => {
    const manage = canManageQuotations();
    const st = quotation.status;
    const button = (title: string, onClick: () => void, icon: React.ReactNode, extra = '') => (
        <button type="button" title={title} aria-label={title} onClick={onClick} className={`${iconBtn} ${extra}`}>{icon}</button>
    );
    return (
        <div className="flex items-center justify-center gap-1">
            {!hideView && button('Ver cotización', onView, <TableActionViewIcon />)}
            {button('Descargar PDF', onPdf, <FileDown size={TABLE_ACTION_ICON_SIZE} className="text-slate-500 group-hover:text-indigo-600" />)}
            {manage && ['DRAFT', 'CHANGES_REQUESTED'].includes(st) && (
                <>
                    {button('Editar', onEdit, <TableActionEditIcon />)}
                    {button('Solicitar autorización', () => onAction('REQUEST_AUTH'), <Send size={TABLE_ACTION_ICON_SIZE} className="text-amber-500" />, 'hover:bg-amber-50')}
                </>
            )}
            {st === 'PENDING_AUTH' && canAuthorizeQuotations() &&
                button('Revisar y autorizar', onReview, <CheckCircle size={TABLE_ACTION_ICON_SIZE} className="text-indigo-600" />)}
            {manage && st === 'AUTHORIZED' && (
                <>
                    {button('Desbloquear para editar', () => onAction('REQUEST_CHANGES'), <Unlock size={TABLE_ACTION_ICON_SIZE} className="text-slate-500 group-hover:text-indigo-600" />)}
                    {button('Marcar como perdida', () => onAction('MARK_LOST'), <ThumbsDown size={TABLE_ACTION_ICON_SIZE} className="text-slate-500 group-hover:text-rose-600" />, 'hover:bg-rose-50')}
                    {button('Generar OV (OC del cliente)', () => onAction('CONVERT'), <CheckCircle size={TABLE_ACTION_ICON_SIZE} className="text-emerald-600" />, 'hover:bg-emerald-50')}
                </>
            )}
            {manage && st === 'EXPIRED' && (
                <>
                    {button('Renovar vigencia', () => onAction('RENEW'), <CalendarClock size={TABLE_ACTION_ICON_SIZE} className="text-amber-600" />, 'hover:bg-amber-50')}
                    {button('Marcar como perdida', () => onAction('MARK_LOST'), <ThumbsDown size={TABLE_ACTION_ICON_SIZE} className="text-slate-500 group-hover:text-rose-600" />, 'hover:bg-rose-50')}
                </>
            )}
            {manage && ['DRAFT', 'CHANGES_REQUESTED', 'PENDING_AUTH', 'AUTHORIZED'].includes(st) &&
                button('Cancelar cotización', () => onAction('CANCEL'), <TableActionCancelIcon />, 'hover:bg-rose-50')}
        </div>
    );
};

// --- Dialogs -------------------------------------------------------------------------------------

const REASON_TEXTS: Record<'REQUEST_CHANGES' | 'MARK_LOST' | 'CANCEL', { title: string; message: string; consequence: string; confirm: string; success: string }> = {
    REQUEST_CHANGES: {
        title: 'Regresar para cambios',
        message: 'Indica qué se debe corregir.',
        consequence: 'La cotización vuelve a ser editable y deberá autorizarse de nuevo antes de enviarse al cliente.',
        confirm: 'Regresar',
        success: 'Cotización regresada para cambios.',
    },
    MARK_LOST: {
        title: 'Marcar como perdida',
        message: 'Indica por qué el cliente no aceptó.',
        consequence: 'La cotización se cierra como perdida. Queda en el histórico con el motivo y no podrá convertirse en OV.',
        confirm: 'Marcar perdida',
        success: 'Cotización marcada como perdida.',
    },
    CANCEL: {
        title: 'Cancelar cotización',
        message: 'Indica el motivo de la cancelación.',
        consequence: 'La cotización queda cancelada con fecha, usuario y motivo. No se elimina y no podrá reactivarse.',
        confirm: 'Cancelar cotización',
        success: 'Cotización cancelada.',
    },
};

interface DialogsProps {
    pending: PendingQuotationAction | null;
    onClose: () => void;
    /** Called after a successful action; receives the new sales order id when one was generated. */
    onDone: (salesOrderId?: number) => void | Promise<void>;
}

const actionButton = 'px-5 py-2 font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const closeButton = 'px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg disabled:opacity-50';

/** Every change of state of a quotation that needs a confirmation, a reason, a new date or the client PO. */
export const QuotationActionDialogs: React.FC<DialogsProps> = ({ pending, onClose, onDone }) => {
    const [text, setText] = useState('');
    const [date, setDate] = useState(todayYmd());
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        setText('');
        setDate(todayYmd());
        setProcessing(false);
    }, [pending]);

    if (!pending) return null;
    const { kind, quotation } = pending;

    const run = async (action: () => Promise<number | void>, success: string) => {
        setProcessing(true);
        try {
            const orderId = await action();
            toast.success(success);
            onClose();
            await onDone(orderId ?? undefined);
        } catch (error) {
            toast.error(getErrorMessage(error, 'No se pudo completar la acción.'));
            if ((error as { response?: { status?: number } })?.response?.status === 409) {
                onClose();
                await onDone();
            }
        } finally {
            setProcessing(false);
        }
    };

    if (kind === 'REQUEST_AUTH') {
        return (
            <VConfirmDialog
                isOpen
                title="Solicitar autorización"
                message={`¿Enviar ${quotation.folio} a Dirección para su autorización?`}
                consequence="Mientras Dirección la revisa no podrá editarse."
                confirmLabel="Enviar a Dirección"
                onConfirm={() => run(async () => { await quotationService.requestAuthorization(quotation.id); }, `${quotation.folio} enviada a Dirección.`)}
                onCancel={onClose}
            />
        );
    }

    const footer = (confirmLabel: string, enabled: boolean, onConfirm: () => void, tone = 'bg-red-600 hover:bg-red-700 text-white') => (
        <div className="flex items-center justify-between gap-4 pt-2">
            <button type="button" className={closeButton} disabled={processing} onClick={onClose}>Cerrar</button>
            <button type="button" className={`${actionButton} ${tone}`} disabled={processing || !enabled} onClick={onConfirm}>
                {processing ? 'Procesando...' : confirmLabel}
            </button>
        </div>
    );

    if (kind === 'RENEW') {
        return (
            <Modal isOpen onClose={() => !processing && onClose()} title={`Renovar vigencia · ${quotation.folio}`} size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">Nueva fecha de vigencia.</p>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        La cotización regresa a borrador: revisa los precios y vuelve a solicitar autorización.
                    </div>
                    <Input type="date" min={todayYmd()} value={date} onChange={(e) => setDate(e.target.value)} />
                    {footer('Renovar', Boolean(date) && date >= todayYmd(),
                        () => run(async () => { await quotationService.renew(quotation.id, `${date}T12:00:00`); }, 'Vigencia renovada.'),
                        'bg-amber-500 hover:bg-amber-600 text-white')}
                </div>
            </Modal>
        );
    }

    if (kind === 'CONVERT') {
        return (
            <Modal isOpen onClose={() => !processing && onClose()} title={`Generar OV · ${quotation.folio}`} size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">Captura la orden de compra del cliente.</p>
                    {pending.duplicateWarning && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{pending.duplicateWarning}</div>
                    )}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        Se creará la OV en «Esperando anticipo» con sus instancias. Si los costos subieron más de la tolerancia, la cotización regresará a cambios y no se creará la OV.
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Folio OC del cliente</label>
                        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej. OC-2026-145" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha OC</label>
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    {footer('Generar OV', Boolean(text.trim()) && Boolean(date), () => run(async () => {
                        const result = await quotationService.convertToOrder(quotation.id, {
                            client_po_folio: text.trim(),
                            client_po_date: `${date}T12:00:00`,
                        });
                        return result.sales_order_id;
                    }, 'OV generada. Quedó en espera de anticipo.'), 'bg-emerald-600 hover:bg-emerald-700 text-white')}
                </div>
            </Modal>
        );
    }

    const texts = REASON_TEXTS[kind];
    const submitReason = () => {
        const reason = text.trim();
        if (kind === 'REQUEST_CHANGES') return run(async () => { await quotationService.requestChanges(quotation.id, reason); }, texts.success);
        if (kind === 'MARK_LOST') return run(async () => { await quotationService.markLost(quotation.id, reason); }, texts.success);
        return run(async () => { await quotationService.cancelQuotation(quotation.id, reason); }, texts.success);
    };
    return (
        <Modal isOpen onClose={() => !processing && onClose()} title={`${texts.title} · ${quotation.folio}`} size="sm">
            <div className="space-y-4">
                <p className="text-sm text-slate-600">{texts.message}</p>
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{texts.consequence}</div>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Motivo obligatorio..." />
                {footer(texts.confirm, Boolean(text.trim()), () => void submitReason())}
            </div>
        </Modal>
    );
};
