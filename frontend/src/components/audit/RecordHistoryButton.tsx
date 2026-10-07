import { useState } from 'react';
import { History } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from '@/components/ui/VToast';
import { auditService, type AuditFieldChange } from '@/api/audit-service';
import { FieldChangesTable, TABLE_LABELS, canReadChangeLog } from './FieldChangesTable';

interface RecordHistoryButtonProps {
  tableName: string;
  recordId: number | string | null | undefined;
  /** Text shown in the modal title, e.g. "OV-0012" or the material SKU. */
  label?: string;
}

/** Icon button that shows the change history of one record (DIRECTOR and MANAGER only). */
export function RecordHistoryButton({ tableName, recordId, label }: RecordHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditFieldChange[]>([]);
  const [loading, setLoading] = useState(false);

  if (!canReadChangeLog() || recordId == null) return null;

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    try {
      setRows(await auditService.getRecordHistory(tableName, recordId));
    } catch {
      toast.error('No se pudo cargar el historial de cambios.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        title="Historial de cambios"
        onClick={() => void handleOpen()}
        disabled={loading}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"
      >
        <History size={16} />
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Historial · ${label ?? `${TABLE_LABELS[tableName] ?? tableName} #${recordId}`}`}
        size="xl"
      >
        <FieldChangesTable rows={rows} loading={loading} showRecord={false} />
      </Modal>
    </>
  );
}
