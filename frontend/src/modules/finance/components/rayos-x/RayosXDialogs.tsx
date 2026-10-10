import React, { useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const labelClass = 'text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1';

/** Kept for Rayos X imports; the dialog lives in components/ui. */
export { VReasonDialog as TextConfirmDialog } from '@/components/ui/VReasonDialog';

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
