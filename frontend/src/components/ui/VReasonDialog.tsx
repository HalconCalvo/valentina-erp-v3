import React, { useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/VToast';

const labelClass = 'text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1';

export interface VReasonDialogProps {
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
export const VReasonDialog: React.FC<VReasonDialogProps> = ({
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

export default VReasonDialog;
