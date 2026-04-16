/**
 * InstanceEditModal
 * Modal para editar el custom_name y las 4 fechas programadas (Matriz de 4 Carriles)
 * de una instancia desde cualquier punto del módulo de planeación.
 */
import { useState, useEffect } from 'react';
import { planningService, InstanceSchedule } from '../../../api/planning-service';
import { getSemaphoreConfig } from '../hooks/usePlanning';

interface Props {
  instance: InstanceSchedule | null;
  onClose: () => void;
  onSaved: () => void;
  /** When true, date/name fields are disabled and the Save button is hidden */
  readOnly?: boolean;
}

const LANE_META = [
  { field: 'scheduled_prod_mdf',   code: 'PM', label: 'Producción MDF',    color: 'text-violet-700 bg-violet-50 border-violet-200', ring: 'focus-within:ring-violet-300' },
  { field: 'scheduled_prod_stone', code: 'PP', label: 'Producción Piedra',  color: 'text-stone-700  bg-stone-50  border-stone-200',  ring: 'focus-within:ring-stone-300'  },
  { field: 'scheduled_inst_mdf',   code: 'IM', label: 'Instalación MDF',   color: 'text-sky-700    bg-sky-50    border-sky-200',    ring: 'focus-within:ring-sky-300'    },
  { field: 'scheduled_inst_stone', code: 'IP', label: 'Instalación Piedra', color: 'text-cyan-700   bg-cyan-50   border-cyan-200',   ring: 'focus-within:ring-cyan-300'   },
] as const;

type LaneField = typeof LANE_META[number]['field'];

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DAY_NAMES_ES   = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_SHORT_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** ISO → "YYYY-MM-DD" for <input type="date"> */
function toInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** "YYYY-MM-DD" → ISO string at 09:00 local time (avoids UTC midnight timezone shift) */
function fromInputValue(val: string): string | null {
  if (!val) return null;
  return new Date(val + 'T09:00:00').toISOString();
}

/**
 * "YYYY-MM-DD" → "Lunes 15/Abr/2026"
 * Uses local Date construction to avoid UTC-offset day-shift.
 */
function formatDisplayDate(dateValue: string): string {
  if (!dateValue) return '';
  const [y, m, d] = dateValue.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayName    = DAY_NAMES_ES[date.getDay()];
  const monthShort = MONTH_SHORT_ES[m - 1];
  return `${dayName} ${d}/${monthShort}/${y}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InstanceEditModal({ instance, onClose, onSaved, readOnly = false }: Props) {
  const [name, setName]   = useState('');
  const [dates, setDates] = useState<Record<LaneField, string>>({
    scheduled_prod_mdf:   '',
    scheduled_prod_stone: '',
    scheduled_inst_mdf:   '',
    scheduled_inst_stone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!instance) return;
    setName(instance.custom_name);
    setDates({
      scheduled_prod_mdf:   toInputValue(instance.schedule.PM),
      scheduled_prod_stone: toInputValue(instance.schedule.PP),
      scheduled_inst_mdf:   toInputValue(instance.schedule.IM),
      scheduled_inst_stone: toInputValue(instance.schedule.IP),
    });
    setError(null);
  }, [instance]);

  if (!instance) return null;

  const cfg = getSemaphoreConfig(instance.semaphore);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await planningService.updateInstance(instance.id, {
        custom_name:          name.trim() || instance.custom_name,
        scheduled_prod_mdf:   fromInputValue(dates.scheduled_prod_mdf),
        scheduled_prod_stone: fromInputValue(dates.scheduled_prod_stone),
        scheduled_inst_mdf:   fromInputValue(dates.scheduled_inst_mdf),
        scheduled_inst_stone: fromInputValue(dates.scheduled_inst_stone),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearDate = (field: LaneField) => {
    setDates(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">

        {/* ── Header ── */}
        <div className={`px-6 pt-5 pb-4 border-b border-slate-100 ${cfg.bg}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                {cfg.dot} {cfg.label}
              </p>
              <h2 className="text-base font-bold text-slate-800">
                Editar Instancia #{instance.id}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5">

          {/* Alias / custom_name */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Alias / Nombre de Instancia
            </label>
            <input
              type="text"
              value={name}
              onChange={e => !readOnly && setName(e.target.value)}
              readOnly={readOnly}
              placeholder="Ej: Casa 123, Calle 98 – Cocina Integral"
              className={`w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition ${readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* 4 Carriles */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">
              Fechas Programadas — Matriz de 4 Carriles
            </label>

            <div className="space-y-3">
              {LANE_META.map(lane => {
                const hasDate     = !!dates[lane.field];
                const displayText = hasDate
                  ? `${lane.code}, ${formatDisplayDate(dates[lane.field])}`
                  : 'Sin fecha — clic para programar';

                return (
                  <div key={lane.field} className="space-y-1.5">
                    {/* Lane name label */}
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ${lane.color}`}>
                        {lane.code}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {lane.code} — {lane.label}
                      </span>
                    </div>

                    {/* Date display chip + invisible overlay input */}
                    <div className="flex items-center gap-2 pl-0.5">
                      <div className="relative flex-1">
                        {/* Visible styled chip */}
                        <div className={`
                          flex items-center gap-2.5 px-3 py-2.5 rounded-xl border
                          cursor-pointer select-none transition-all
                          ${hasDate
                            ? `${lane.color} font-semibold`
                            : 'border-slate-200 bg-slate-50 text-slate-400'}
                        `}>
                          <span className="shrink-0 text-base leading-none">
                            {hasDate ? '📅' : '○'}
                          </span>
                          <span className={`flex-1 text-sm ${hasDate ? '' : 'italic'}`}>
                            {displayText}
                          </span>
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide
                            ${hasDate ? 'opacity-50' : 'text-slate-400'}`}>
                            editar
                          </span>
                        </div>

                        {/* Invisible <input type="date"> overlaid — opens native picker on click */}
                        {!readOnly && (
                          <input
                            type="date"
                            value={dates[lane.field]}
                            onChange={e =>
                              setDates(prev => ({ ...prev, [lane.field]: e.target.value }))
                            }
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            tabIndex={0}
                          />
                        )}
                      </div>

                      {/* Clear button — hidden for read-only */}
                      {hasDate && !readOnly && (
                        <button
                          onClick={() => handleClearDate(lane.field)}
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Limpiar fecha"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-6 pt-2 flex justify-between items-center gap-3 border-t border-slate-100">
          {readOnly ? (
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
              👁 Solo Lectura
            </span>
          ) : <span />}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
            >
              {readOnly ? 'Cerrar' : 'Cancelar'}
            </button>
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
