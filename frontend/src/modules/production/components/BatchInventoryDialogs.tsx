import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import type { ReversalDisposition, StockShortage } from '@/api/production-service';

const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

const DISPOSITIONS: { value: ReversalDisposition; label: string }[] = [
  { value: 'RETURN_TO_STOCK', label: 'Regresa al almacén (movimiento inverso)' },
  { value: 'WASTE', label: 'Merma (el material no se recupera)' },
];

const shortageColumns: VTableColumn<StockShortage>[] = [
  { key: 'sku', label: 'SKU', render: (r) => r.sku },
  { key: 'name', label: 'Material', render: (r) => r.name },
  { key: 'required', label: 'Requerido', render: (r) => `${qty.format(r.required)} ${r.usage_unit}` },
  { key: 'available', label: 'Disponible', render: (r) => `${qty.format(r.available)} ${r.usage_unit}` },
  {
    key: 'missing',
    label: 'Faltante',
    render: (r) => <span className="font-bold text-red-700">{`${qty.format(r.missing)} ${r.usage_unit}`}</span>,
  },
];

interface ShortageDialogProps {
  isOpen: boolean;
  batchFolio: string;
  shortages: StockShortage[];
  canAuthorize: boolean;
  onAuthorize: (reason: string) => Promise<void>;
  onClose: () => void;
}

export function ShortageDialog({ isOpen, batchFolio, shortages, canAuthorize, onAuthorize, onClose }: ShortageDialogProps) {
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  const handleAuthorize = async () => {
    setProcessing(true);
    try {
      await onAuthorize(reason.trim());
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={processing ? () => undefined : onClose} title={`Material insuficiente · ${batchFolio}`} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          El lote no puede entrar a producción: estos materiales de la receta no alcanzan en el almacén.
        </p>
        <div className="overflow-x-auto">
          <VTable columns={shortageColumns} data={shortages} />
        </div>
        {canAuthorize ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
            <p className="text-sm text-red-700">
              Si autorizas, se descuenta la receta completa y estos materiales quedan en negativo.
              Queda registrado quién autorizó y por qué, y aparece en el reporte de existencias negativas.
            </p>
            <Input
              placeholder="Motivo de la autorización (obligatorio)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Compra o ajusta el material, o pide a Dirección o Gerencia que autorice.</p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={processing} onClick={onClose}>Cerrar</Button>
          {canAuthorize && (
            <Button variant="destructive" disabled={processing || !reason.trim()} onClick={() => void handleAuthorize()}>
              {processing ? 'Autorizando…' : 'Autorizar en negativo'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export interface ReversalInput {
  reason: string;
  disposition: ReversalDisposition | null;
}

interface ReversalDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  requireDisposition: boolean;
  confirmLabel: string;
  onConfirm: (input: ReversalInput) => Promise<void>;
  onClose: () => void;
}

export function ReversalDialog({ isOpen, title, message, requireDisposition, confirmLabel, onConfirm, onClose }: ReversalDialogProps) {
  const [reason, setReason] = useState('');
  const [disposition, setDisposition] = useState<string>('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setDisposition('');
    }
  }, [isOpen]);

  const ready = reason.trim() !== '' && (!requireDisposition || disposition !== '');

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      await onConfirm({ reason: reason.trim(), disposition: (disposition || null) as ReversalDisposition | null });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={processing ? () => undefined : onClose} title={title} size="md">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">{message}</p>
        {requireDisposition && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            El material ya salió del almacén. Elige si regresa al almacén o se registra como merma.
            Esta decisión queda registrada con tu usuario y el motivo.
          </div>
        )}
        <Input placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {requireDisposition && (
          <SearchableSelect
            items={DISPOSITIONS}
            value={disposition}
            onChange={setDisposition}
            getLabel={(d) => d.label}
            getValue={(d) => d.value}
            placeholder="¿Qué pasa con el material?"
          />
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={processing} onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={processing || !ready} onClick={() => void handleConfirm()}>
            {processing ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
