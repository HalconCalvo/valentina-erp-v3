import { InstanceSchedule } from '../../../api/planning-service';

interface ExternalDropPending {
  dayKey: string;
  instance: InstanceSchedule;
}

interface Props {
  pending: ExternalDropPending | null;
  onExternalDrop?: (dayKey: string, instance: InstanceSchedule) => void;
  onCancel: () => void;
}

const LANES = [
  { field: 'scheduled_prod_mdf',   code: 'PM', label: 'Producción MDF',     cls: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' },
  { field: 'scheduled_prod_stone', code: 'PP', label: 'Producción Piedra',   cls: 'bg-stone-50  text-stone-700  border-stone-200  hover:bg-stone-100'  },
  { field: 'scheduled_inst_mdf',   code: 'IM', label: 'Instalación MDF',    cls: 'bg-sky-50    text-sky-700    border-sky-200    hover:bg-sky-100'    },
  { field: 'scheduled_inst_stone', code: 'IP', label: 'Instalación Piedra',  cls: 'bg-cyan-50   text-cyan-700   border-cyan-200   hover:bg-cyan-100'   },
] as const;

export default function ExternalDropModal({ pending, onExternalDrop, onCancel }: Props) {
  if (!pending) return null;

  const friendlyDate = new Date(pending.dayKey + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="w-full max-w-sm shrink-0">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">¿En qué carril programar?</h2>
          <p className="text-xs text-slate-500 mt-1">
            <span className="font-medium">{pending.instance.custom_name}</span>
            {' → '}
            <span className="capitalize">{friendlyDate}</span>
          </p>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          {LANES.map(lane => (
            <button
              key={lane.field}
              onClick={() => {
                if (onExternalDrop) {
                  const updated: InstanceSchedule = {
                    ...pending.instance,
                    schedule: {
                      ...pending.instance.schedule,
                      [lane.code]: pending.dayKey + 'T09:00:00',
                    },
                  };
                  onExternalDrop(pending.dayKey, updated);
                }
                onCancel();
              }}
              className={`p-3 rounded-xl border text-sm font-semibold transition-all ${lane.cls}`}
            >
              <div className="text-lg font-black">{lane.code}</div>
              <div className="text-[10px] mt-0.5 font-medium">{lane.label}</div>
            </button>
          ))}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={onCancel}
            className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
