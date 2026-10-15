import { useEffect, useState } from 'react';
import { FilePlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/VToast';
import { salesService } from '@/api/sales-service';
import type { ProgressInvoicePreview } from '@/types/sales';
import { formatMoney } from '@/utils/format';

const CENT = 0.01;

interface Props {
  orderId: number;
  instanceIds: number[];
  onDone: () => void;
  onCancel: () => void;
}

const toNumber = (value: string): number => Number(value.replace(/,/g, '')) || 0;

/**
 * D36: a progress invoice bills the whole houses with IVA and amortizes the proportional advance.
 * The three figures are shown before saving; the invoice and the amortization are editable (amortization with a reason).
 */
export default function ProgressInvoiceForm({ orderId, instanceIds, onDone, onCancel }: Props) {
  const [preview, setPreview] = useState<ProgressInvoicePreview | null>(null);
  const [folio, setFolio] = useState('');
  const [amount, setAmount] = useState('');
  const [amortized, setAmortized] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const idsKey = [...instanceIds].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (instanceIds.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    salesService
      .getProgressPreview(orderId, instanceIds)
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        setAmount(data.amount.toFixed(2));
        setAmortized(data.amortized_advance.toFixed(2));
        setReason('');
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.response?.data?.detail || 'No se pudo calcular el avance.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, idsKey]);

  const amountValue = toNumber(amount);
  const amortizedValue = toNumber(amortized);
  const toCollect = Math.max(amountValue - amortizedValue, 0);
  const amortizationEdited = preview != null && Math.abs(amortizedValue - preview.amortized_advance) > CENT;
  const canSave = !saving && preview != null && instanceIds.length > 0 && folio.trim() !== ''
    && amountValue > 0 && (!amortizationEdited || reason.trim() !== '');

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await salesService.registerProgressPayment(orderId, {
        invoice_folio: folio.trim(),
        amount: amountValue,
        amortized_advance: amortizedValue,
        amortization_reason: amortizationEdited ? reason.trim() : null,
        instance_ids: instanceIds,
      });
      toast.success('Factura de avance registrada.');
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo registrar el avance.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-xs font-bold text-slate-600 uppercase tracking-wide';
  const field = 'border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400';

  return (
    <div className="px-6 pb-4 pt-2 bg-emerald-50/40 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className={label}>Folio de Factura *</label>
          <Input type="text" placeholder="Ej. F-2026-0042" value={folio} onChange={(e) => setFolio(e.target.value)}
            className={`${field} w-44`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Importe de la factura (con IVA)</label>
          <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)}
            className={`${field} w-40`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label}>Anticipo amortizado (con IVA)</label>
          <Input type="number" placeholder="0.00" value={amortized} onChange={(e) => setAmortized(e.target.value)}
            className={`${field} w-40`} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Por cobrar (con IVA)</span>
          <span className="py-2 text-lg font-black text-emerald-800 tabular-nums">{formatMoney(toCollect)}</span>
        </div>
      </div>
      {preview && (
        <p className="text-xs text-slate-600">
          Sugerido: factura {formatMoney(preview.amount)} · anticipo amortizado {formatMoney(preview.amortized_advance)}
          {preview.is_last
            ? ' (última casa: amortiza todo lo que queda del anticipo)'
            : ` (${preview.advance_percent}% de la factura)`}
          {' · '}queda del anticipo cobrado: {formatMoney(preview.advance_remaining)}.
        </p>
      )}
      {amortizationEdited && (
        <div className="flex flex-col gap-1 max-w-xl">
          <label className={label}>Motivo del cambio de amortización *</label>
          <Input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Por qué el anticipo amortizado es distinto al sugerido" className={field} />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button disabled={!canSave} onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700"
          title={!folio.trim() ? 'El folio de la factura es obligatorio' : undefined}>
          <FilePlus size={14} />
          {saving ? 'Procesando...' : `Confirmar Avance (${instanceIds.length})`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
