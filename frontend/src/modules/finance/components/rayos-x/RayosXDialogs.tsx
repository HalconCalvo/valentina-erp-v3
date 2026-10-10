import React, { useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/VToast';

const labelClass = 'text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1';

interface TextConfirmDialogProps {
    title: string;
    description: React.ReactNode;
    /** Red box with the consequence (cancellations, releases). */
    warning?: React.ReactNode;
    label: string;
    placeholder?: string;
    /** Shown when the text is empty. */
    requiredMessage: string;
    confirmLabel: string;
    danger?: boolean;
    /** Resolves true when the action succeeded (the dialog then closes). */
    onConfirm: (text: string) => Promise<boolean>;
    onClose: () => void;
}

/** One mandatory text (reason or folio) and a confirmation: cancel invoice, cancel installment, retention. */
export const TextConfirmDialog: React.FC<TextConfirmDialogProps> = ({
    title, description, warning, label, placeholder = 'Describe el motivo...', requiredMessage, confirmLabel, danger = false,
    onConfirm, onClose,
}) => {
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);

    const confirm = async () => {
        if (!text.trim()) {
            toast.warning(requiredMessage);
            return;
        }
        setSaving(true);
        try {
            if (await onConfirm(text.trim())) onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={() => !saving && onClose()} title={title} size="sm">
            <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
                {warning && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{warning}</div>}
                <div>
                    <label className={labelClass}>{label}</label>
                    <Input type="text" autoFocus placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
                </div>
                <div className="flex items-center justify-between gap-4 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Volver</Button>
                    <Button onClick={() => void confirm()} disabled={saving}
                        className={danger ? 'bg-red-600 hover:bg-red-700 text-white font-bold' : undefined}>
                        {saving ? 'Procesando…' : confirmLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export interface PaymentEditForm {
    invoice_folio: string;
    invoice_date: string;
    amount: string;
    notes: string;
}

interface EditPaymentDialogProps {
    cxc: { invoice_folio?: string | null; invoice_date?: string | null; amount?: number | null; notes?: string | null;
        status?: string | null; treasury_transaction_id?: number | null };
    /** Resolves true when saved (the dialog then closes). */
    onSave: (form: PaymentEditForm) => Promise<boolean>;
    onClose: () => void;
}

/** Internal edit of an invoice already stamped in Compaq (paid invoices: notes only). */
export const EditPaymentDialog: React.FC<EditPaymentDialogProps> = ({ cxc, onSave, onClose }) => {
    const [form, setForm] = useState<PaymentEditForm>({
        invoice_folio: cxc.invoice_folio || '',
        invoice_date: cxc.invoice_date ? cxc.invoice_date.slice(0, 10) : '',
        amount: String(cxc.amount || ''),
        notes: cxc.notes || '',
    });
    const [saving, setSaving] = useState(false);
    const notesOnly = cxc.status === 'PAID' || !!cxc.treasury_transaction_id;

    const save = async () => {
        setSaving(true);
        try {
            if (await onSave(form)) onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={() => !saving && onClose()} title={`Editar Factura ${cxc.invoice_folio || 'S/F'}`} size="sm">
            <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Esta factura ya fue timbrada en Compaq. Los cambios en Valentina son internos y no modifican el CFDI fiscal.
                </div>
                <div>
                    <label className={labelClass}>Folio de factura</label>
                    <Input type="text" value={form.invoice_folio} disabled={notesOnly}
                        onChange={(e) => setForm((f) => ({ ...f, invoice_folio: e.target.value }))} />
                </div>
                <div>
                    <label className={labelClass}>Fecha de factura</label>
                    <Input type="date" value={form.invoice_date} disabled={notesOnly}
                        onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))} />
                </div>
                <div>
                    <label className={labelClass}>Importe</label>
                    <Input type="number" min="0" step="0.01" value={form.amount} disabled={notesOnly}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                    <label className={labelClass}>Notas</label>
                    <Input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between gap-4 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={() => void save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
                </div>
            </div>
        </Modal>
    );
};
