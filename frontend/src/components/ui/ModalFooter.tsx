import React from 'react';
import { Button } from '@/components/ui/Button';

/** Modal footer (guide v2 §10): secondary on the left, primary on the right; "Procesando..." while busy. */
interface ModalFooterProps {
  onCancel: () => void;
  cancelLabel?: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  /** 'success': pay or collect (green), as in the guide. */
  tone?: 'primary' | 'success';
  /** Submit a form by id instead of onConfirm. */
  form?: string;
  /** Extra content between the two buttons (e.g. a total). */
  children?: React.ReactNode;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  onCancel, cancelLabel = 'Cancelar', onConfirm, confirmLabel, disabled, busy, tone = 'primary', form, children,
}) => (
  <div className="flex items-center justify-between gap-4 pt-4 mt-2 border-t border-slate-100">
    <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
    {children}
    {confirmLabel && (
      <Button
        type={form ? 'submit' : 'button'}
        form={form}
        onClick={form ? undefined : onConfirm}
        disabled={disabled || busy}
        className={tone === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : undefined}
      >
        {busy ? 'Procesando...' : confirmLabel}
      </Button>
    )}
  </div>
);

export default ModalFooter;
