import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';

type VConfirmDialogVariant = 'danger' | 'warning' | 'default';

interface VConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  consequence?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: VConfirmDialogVariant;
}

const confirmVariantClasses: Record<VConfirmDialogVariant, string> = {
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white',
  default: 'bg-indigo-600 hover:bg-indigo-700 text-white',
};

export const VConfirmDialog: React.FC<VConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  consequence,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
}) => {
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!isOpen) setProcessing(false);
  }, [isOpen]);

  const handleClose = () => {
    if (processing) return;
    onCancel();
  };

  const handleConfirm = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      await onConfirm();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>

        {consequence && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {consequence}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={processing}
            className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing}
            className={`px-5 py-2 font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmVariantClasses[variant]}`}
          >
            {processing ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
