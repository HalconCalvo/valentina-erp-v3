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
}

const LANE_META = [
  { field: 'scheduled_prod_mdf',   code: 'PM', label: 'Producción MDF',    color: 'text-violet-700 bg-violet-50 border-violet-200' },
  { field: 'scheduled_prod_stone', code: 'PP', label: 'Producción Piedra',  color: 'text-stone-700  bg-stone-50  border-stone-200'  },
  { field: 'scheduled_inst_mdf',   code: 'IM', label: 'Instalación MDF',   color: 'text-sky-700    bg-sky-50    border-sky-200'    },
  { field: 'scheduled_inst_stone', code: 'IP', label: 'Instalación Piedra', color: 'text-cyan-700   bg-cyan-50   border-cyan-200'   },
] as const;

type LaneField = typeof LANE_META[number]['field'];

/** Convert ISO datetime string to datetime-local input value */
function toInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

/** Convert datetime-local input value to ISO string */
function fromInputValue(val: string): string | null {
  if (!val) return null;
  return new Date(val).toISOString();
}

export default function InstanceEditModal({ instance, onClose, onSaved }: Props) {
  const [name, setName]   = useState('');
  const [dates, setDates] = useState<Record<LaneField, string>>({
    scheduled_prod_mdf:   '',
    scheduled_prod_stone: '',
    scheduled_inst_mdf:   '',
    scheduled_inst_stone: '',
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState<string | null>(null);

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

        {/* Header */}
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

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Alias / custom_name */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Alias / Nombre de Instancia
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Casa 123, Calle 98 – Cocina Integral"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
            />
          </div>

          {/* 4 Carriles */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
              Fechas Programadas — Matriz de 4 Carriles
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {LANE_META.map(lane => (
                <div key={lane.field} className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 w-10 text-center ${lane.color}`}>
                    {lane.code}
                  </span>
                  <span className="text-xs text-slate-500 w-32 shrink-0">{lane.label}</span>
                  <div className="flex-1 flex items-center gap-1.5">
                    <input
                      type="datetime-local"
                      value={dates[lane.field]}
                      onChange={e => setDates(prev => ({ ...prev, [lane.field]: e.target.value }))}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                    />
                    {dates[lane.field] && (
                      <button
                        onClick={() => handleClearDate(lane.field)}
                        className="text-slate-300 hover:text-red-500 transition-colors text-sm"
                        title="Limpiar fecha"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex justify-end gap-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
