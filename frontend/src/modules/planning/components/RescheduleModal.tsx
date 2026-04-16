import { CalendarPill } from '../../../api/planning-service';

interface Props {
  pill: CalendarPill | null;
  targetDate: string | null;
  onConfirmProportional: () => void;
  onConfirmFixed: () => void;
  onCancel: () => void;
  loading?: boolean;
  /** PATCH error message to surface when reschedule fails */
  error?: string | null;
}

const LANE_LABELS: Record<string, string> = {
  PM: 'Producción MDF',
  PP: 'Producción Piedra',
  IM: 'Instalación MDF',
  IP: 'Instalación Piedra',
};

export default function RescheduleModal({
  pill,
  targetDate,
  onConfirmProportional,
  onConfirmFixed,
  onCancel,
  loading,
  error,
}: Props) {
  if (!pill || !targetDate) return null;

  const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            Reprogramar Operación
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-medium text-slate-700">{LANE_LABELS[pill.lane] ?? pill.lane}</span>
            {' — '}
            <span className="font-medium text-slate-700">{pill.custom_name}</span>
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-600">
            Nueva fecha: <span className="font-semibold text-slate-800">{formattedDate}</span>
          </p>
          <p className="text-sm text-slate-500">
            ¿Deseas recalcular proporcionalmente las fechas siguientes de esta instancia
            o mantenerlas (solo mover esta operación)?
          </p>
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2">
          <button
            onClick={onConfirmProportional}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Recalcular cadena proporcionalmente
          </button>
          <button
            onClick={onConfirmFixed}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Solo mover esta operación (Horas Extra)
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
