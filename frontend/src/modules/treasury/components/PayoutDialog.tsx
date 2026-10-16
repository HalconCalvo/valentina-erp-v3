import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VCurrencyInput } from '@/components/ui/VCurrencyInput';
import { formatMoney } from '@/utils/format';

/** D37: money paid to people leaves through Banco (an account) or Efectivo (petty cash), never unspecified.
 *  D40: also Efectivo Dirección (the Director's own cash, no movement), and one payment may be split among them. */
export type PayoutMethod = 'BANK' | 'CASH' | 'DIRECTOR_CASH';

export interface PayoutPart {
  payment_method: PayoutMethod;
  account_id: number | null;
  amount: number;
}

export interface PayoutChoice {
  parts: PayoutPart[];
}

const METHOD_LABELS: Record<string, string> = {
  BANK: 'Banco',
  CASH: 'Efectivo',
  DIRECTOR_CASH: 'Efectivo Dirección',
  OUTSIDE: 'Pagada fuera de Valentina',
  SPLIT: 'Dividido',
};

export const payoutMethodLabel = (method: string) => METHOD_LABELS[method] ?? method;

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
const DIRECTOR_CASH = 'DIRECTOR_CASH';
const labelClass = 'text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1';
const cents = (n: number) => Math.round(n * 100);

type Line = { method: string; amount: number };

const toPart = (line: Line): PayoutPart =>
  line.method === CASH || line.method === DIRECTOR_CASH
    ? { payment_method: line.method, account_id: null, amount: line.amount }
    : { payment_method: 'BANK', account_id: Number(line.method), amount: line.amount };

const isBank = (method: string) => method !== '' && method !== CASH && method !== DIRECTOR_CASH;

export function PayoutDialog({ title, details, amount, accounts, confirmLabel = 'Confirmar pago', onConfirm, onClose }: Props) {
  // D40: Efectivo Dirección only for the DIRECTOR (the API checks it too)
  const isDirector = (localStorage.getItem('user_role') || '').toUpperCase().trim() === 'DIRECTOR';
  const [lines, setLines] = useState<Line[]>([{ method: '', amount }]);
  const [saving, setSaving] = useState(false);
  const options = [
    { id: CASH, label: 'Efectivo (caja chica)' },
    ...(isDirector ? [{ id: DIRECTOR_CASH, label: 'Efectivo Dirección (sin movimiento de banco ni caja)' }] : []),
    ...accounts.filter((a) => a.is_active !== false).map((a) => ({
      id: String(a.id),
      label: `Banco · ${a.name}${a.account_number ? ` (${a.account_number})` : ''}${a.current_balance != null ? ` — ${formatMoney(a.current_balance)}` : ''}`,
    })),
  ];
  const split = lines.length > 1;
  const missing = (cents(amount) - lines.reduce((sum, l) => sum + cents(l.amount), 0)) / 100;
  const kinds = lines.map((l) => (isBank(l.method) ? 'BANK' : l.method));
  const eachOnce = new Set(kinds).size === kinds.length;
  const valid = lines.every((l) => l.method && l.amount > 0) && cents(missing) === 0 && eachOnce;

  const update = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const addLine = () => setLines((prev) => [...prev, { method: '', amount: Math.max(0, missing) }]);

  const removeLine = (i: number) =>
    setLines((prev) => (prev.length === 2 ? [{ ...prev[1 - i], amount }] : prev.filter((_, j) => j !== i)));

  const confirm = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (await onConfirm({ parts: lines.map(toPart) })) onClose();
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
        {lines.map((line, i) => (
          <div key={i} className={split ? 'grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-2 items-end' : ''}>
            <div>
              <label className={labelClass}>{split ? `Medio ${i + 1} *` : 'Medio de pago *'}</label>
              <SearchableSelect items={options} value={line.method} onChange={(v) => update(i, { method: v })}
                getLabel={(o) => o.label} getValue={(o) => o.id} placeholder="Efectivo o cuenta bancaria..." />
            </div>
            {split && (
              <div className="flex items-end gap-1">
                <VCurrencyInput value={line.amount} onChange={(v) => update(i, { amount: v })} label="Monto" min={0} />
                <Button variant="outline" size="xs" onClick={() => removeLine(i)} disabled={saving}
                  title="Quitar este medio">Quitar</Button>
              </div>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 text-xs">
          {lines.length < 3 ? (
            <Button variant="outline" size="xs" onClick={addLine} disabled={saving}>
              {split ? 'Agregar otro medio' : 'Dividir pago'}
            </Button>
          ) : <span />}
          {split && (
            <span className={cents(missing) === 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
              {cents(missing) === 0
                ? 'La suma cuadra con el total'
                : missing > 0 ? `Faltan ${formatMoney(missing)}` : `Sobran ${formatMoney(-missing)}`}
            </span>
          )}
        </div>
        {split && !eachOnce && (
          <p className="text-xs text-rose-600">Cada medio va una sola vez (una sola cuenta de banco por pago).</p>
        )}
        <div className="flex items-center justify-between gap-4 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void confirm()} disabled={!valid || saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
            {saving ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
