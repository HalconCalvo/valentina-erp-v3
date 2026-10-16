import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatMoney } from '@/utils/format';

/** D37: money paid to people leaves through Banco (an account) or Efectivo (petty cash), never unspecified. */
export interface PayoutChoice {
  payment_method: 'BANK' | 'CASH';
  account_id: number | null;
}

interface PayoutAccount {
  id: number;
  name: string;
  account_number?: string;
  current_balance?: number;
  is_active?: boolean;
}

interface Props {
  title: string;
  /** Lines shown before paying (person, invoice or rows), as label → value. */
  details: Array<[string, string]>;
  amount: number;
  accounts: PayoutAccount[];
  confirmLabel?: string;
  /** Resolves true when paid (the dialog then closes). */
  onConfirm: (choice: PayoutChoice) => Promise<boolean>;
  onClose: () => void;
}

const CASH = 'CASH';
const labelClass = 'text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1';

export function PayoutDialog({ title, details, amount, accounts, confirmLabel = 'Confirmar pago', onConfirm, onClose }: Props) {
  const [method, setMethod] = useState('');
  const [saving, setSaving] = useState(false);
  const options = [
    { id: CASH, label: 'Efectivo (caja chica)' },
    ...accounts.filter((a) => a.is_active !== false).map((a) => ({
      id: String(a.id),
      label: `Banco · ${a.name}${a.account_number ? ` (${a.account_number})` : ''}${a.current_balance != null ? ` — ${formatMoney(a.current_balance)}` : ''}`,
    })),
  ];

  const confirm = async () => {
    if (!method || saving) return;
    setSaving(true);
    try {
      const choice: PayoutChoice = method === CASH
        ? { payment_method: 'CASH', account_id: null }
        : { payment_method: 'BANK', account_id: Number(method) };
      if (await onConfirm(choice)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title={title} size="md" overlayZIndex={70}>
      <div className="flex flex-col gap-4">
        <dl className="space-y-1 text-sm">
          {details.map(([label, value], i) => (
            <div key={`${label}-${i}`} className="flex justify-between gap-4">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-800">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2">
            <dt className="font-bold text-slate-700">Monto a pagar</dt>
            <dd className="text-lg font-black text-emerald-700 tabular-nums">{formatMoney(amount)}</dd>
          </div>
        </dl>
        <div>
          <label className={labelClass}>Medio de pago *</label>
          <SearchableSelect items={options} value={method} onChange={setMethod} getLabel={(o) => o.label}
            getValue={(o) => o.id} placeholder="Efectivo o cuenta bancaria..." />
        </div>
        <div className="flex items-center justify-between gap-4 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void confirm()} disabled={!method || saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
            {saving ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
