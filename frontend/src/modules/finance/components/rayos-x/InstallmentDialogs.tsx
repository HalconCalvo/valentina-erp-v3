import React, { useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VCurrencyInput } from '@/components/ui/VCurrencyInput';
import { VToggle } from '@/components/ui/VToggle';
import { toast } from '@/components/ui/VToast';
import { HouseInstancePicker, type UnlinkedHouseGroup } from './HouseInstancePicker';

const labelClass = 'text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1';
const todayYmd = () => new Date().toISOString().slice(0, 10);

export interface InstallmentPayload {
    amount: number;
    payment_date?: string | null;
    notes?: string | null;
    reference?: string | null;
    account_id?: number | null;
    instance_ids?: number[];
    is_advance?: boolean;
}

interface BankAccountOption {
    id: number;
    name: string;
    account_number: string;
    current_balance: number;
}

interface InstallmentFieldsProps {
    amount: number;
    setAmount: (v: number) => void;
    amountError?: string;
    date: string;
    setDate: (v: string) => void;
    reference: string;
    setReference: (v: string) => void;
    notes: string;
    setNotes: (v: string) => void;
    congruence: React.ReactNode;
    placeholders?: boolean;
}

const InstallmentFields: React.FC<InstallmentFieldsProps> = ({
    amount, setAmount, amountError, date, setDate, reference, setReference, notes, setNotes, congruence, placeholders,
}) => (
    <>
        <VCurrencyInput label="Importe del abono *" value={amount} onChange={setAmount} min={0.01} error={amountError} />
        {congruence}
        <div>
            <label className={labelClass}>Fecha *</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
            <label className={labelClass}>Referencia</label>
            <Input type="text" placeholder={placeholders ? 'Referencia bancaria o comprobante' : undefined} value={reference}
                onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
            <label className={labelClass}>Notas</label>
            <Input type="text" placeholder={placeholders ? 'Concepto del abono' : undefined} value={notes}
                onChange={(e) => setNotes(e.target.value)} />
        </div>
    </>
);

interface RegisterInstallmentDialogProps {
    cxc: { invoice_folio?: string | null; amount?: number | null; payment_type?: string | null };
    initialAmount: number;
    bankAccounts: BankAccountOption[];
    loadingBankAccounts: boolean;
    houses: UnlinkedHouseGroup[];
    formatCurrency: (value: number) => string;
    renderCongruence: (selectedIds: number[], amount: number) => React.ReactNode;
    /** Resolves true when registered (the dialog then closes). */
    onSubmit: (payload: InstallmentPayload) => Promise<boolean>;
    onClose: () => void;
}

/** Customer payment (abono) against an invoice: bank account, and the installed instances it covers. */
export const RegisterInstallmentDialog: React.FC<RegisterInstallmentDialogProps> = ({
    cxc, initialAmount, bankAccounts, loadingBankAccounts, houses, formatCurrency, renderCongruence, onSubmit, onClose,
}) => {
    const [amount, setAmount] = useState(initialAmount);
    const [date, setDate] = useState(todayYmd());
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [accountId, setAccountId] = useState('');
    const [instanceIds, setInstanceIds] = useState<number[]>([]);
    const [isAdvance, setIsAdvance] = useState(false);
    const [saving, setSaving] = useState(false);
    const canLinkInstances = cxc.payment_type !== 'ADVANCE' && houses.some((h) => h.instances.length > 0);

    const submit = async () => {
        if (amount <= 0) {
            toast.warning('El importe del abono debe ser mayor a cero.');
            return;
        }
        if (!accountId) {
            toast.warning('Selecciona la cuenta bancaria destino.');
            return;
        }
        const payload: InstallmentPayload = {
            amount,
            payment_date: date ? `${date}T12:00:00` : null,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
            account_id: Number(accountId),
            is_advance: isAdvance,
        };
        if (!isAdvance && cxc.payment_type !== 'ADVANCE' && instanceIds.length > 0) payload.instance_ids = instanceIds;
        setSaving(true);
        try {
            if (await onSubmit(payload)) onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={() => !saving && onClose()} title="Registrar Abono" size="md">
            <div className="flex flex-col gap-4">
                <p className="text-xs text-slate-500">Factura {cxc.invoice_folio || 'S/F'} — {formatCurrency(Number(cxc.amount || 0))}</p>
                <InstallmentFields amount={amount} setAmount={setAmount} amountError={amount <= 0 ? 'El importe debe ser mayor a cero' : undefined}
                    date={date} setDate={setDate} reference={reference} setReference={setReference} notes={notes} setNotes={setNotes}
                    congruence={renderCongruence(instanceIds, amount)} placeholders />
                <div>
                    <label className={labelClass}>Cuenta bancaria destino *</label>
                    {loadingBankAccounts ? (
                        <p className="text-xs text-slate-500 italic">Cargando cuentas…</p>
                    ) : (
                        <SearchableSelect items={bankAccounts} value={accountId} onChange={setAccountId}
                            getLabel={(a) => `${a.name} (${a.account_number}) — ${formatCurrency(a.current_balance)}`}
                            getValue={(a) => String(a.id)} placeholder="Buscar cuenta bancaria..." />
                    )}
                </div>
                {canLinkInstances && (
                    <VToggle label="¿Es anticipo?" checked={isAdvance}
                        onCheckedChange={(checked) => { setIsAdvance(checked); if (checked) setInstanceIds([]); }} />
                )}
                {canLinkInstances && !isAdvance && (
                    <div>
                        <label className={`${labelClass} mb-2`}>Instancias cubiertas por este abono</label>
                        <HouseInstancePicker houses={houses} paymentType={cxc.payment_type ?? undefined} selectedIds={instanceIds} onChange={setInstanceIds} />
                    </div>
                )}
                <div className="flex items-center justify-between gap-4 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={() => void submit()} disabled={saving || loadingBankAccounts}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                        {saving ? 'Registrando…' : 'Confirmar abono'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

interface EditInstallmentDialogProps {
    abono: { amount?: number | null; payment_date?: string | null; reference?: string | null; notes?: string | null; is_advance?: boolean | null };
    cxc: { payment_type?: string | null };
    /** Instances the invoice already covers: kept when saving. */
    preservedLinkedIds: number[];
    houses: UnlinkedHouseGroup[];
    renderCongruence: (selectedIds: number[], amount: number) => React.ReactNode;
    onSave: (payload: InstallmentPayload) => Promise<boolean>;
    onClose: () => void;
}

export const EditInstallmentDialog: React.FC<EditInstallmentDialogProps> = ({
    abono, cxc, preservedLinkedIds, houses, renderCongruence, onSave, onClose,
}) => {
    const [amount, setAmount] = useState(Number(abono.amount || 0));
    const [date, setDate] = useState(abono.payment_date ? abono.payment_date.slice(0, 10) : '');
    const [reference, setReference] = useState(abono.reference || '');
    const [notes, setNotes] = useState(abono.notes || '');
    const [instanceIds, setInstanceIds] = useState<number[]>([]);
    const [isAdvance, setIsAdvance] = useState(Boolean(abono.is_advance) || cxc.payment_type === 'ADVANCE');
    const [saving, setSaving] = useState(false);
    const canLinkInstances = cxc.payment_type !== 'ADVANCE' && houses.some((h) => h.instances.length > 0);

    const save = async () => {
        if (amount <= 0) {
            toast.warning('El importe del abono debe ser mayor a cero.');
            return;
        }
        const payload: InstallmentPayload = {
            amount,
            payment_date: date ? `${date}T12:00:00` : null,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
            is_advance: isAdvance,
        };
        if (cxc.payment_type !== 'ADVANCE') payload.instance_ids = isAdvance ? [] : [...new Set([...preservedLinkedIds, ...instanceIds])];
        setSaving(true);
        try {
            if (await onSave(payload)) onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={() => !saving && onClose()} title="Editar Abono" size="md">
            <div className="flex flex-col gap-4">
                <InstallmentFields amount={amount} setAmount={setAmount} date={date} setDate={setDate} reference={reference}
                    setReference={setReference} notes={notes} setNotes={setNotes} congruence={renderCongruence(instanceIds, amount)} />
                {canLinkInstances && (
                    <>
                        <VToggle label="¿Es anticipo?" checked={isAdvance}
                            onCheckedChange={(checked) => { setIsAdvance(checked); if (checked) setInstanceIds([]); }} />
                        {!isAdvance && (
                            <div>
                                <label className={`${labelClass} mb-2`}>Instancias adicionales sin vínculo</label>
                                <HouseInstancePicker houses={houses} paymentType={cxc.payment_type ?? undefined} selectedIds={instanceIds} onChange={setInstanceIds} />
                            </div>
                        )}
                    </>
                )}
                <div className="flex items-center justify-between gap-4 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={() => void save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
                </div>
            </div>
        </Modal>
    );
};
