/**
 * InstanceEditModal
 * Modal para editar el custom_name y las 4 fechas programadas (Matriz de 4 Carriles)
 * de una instancia desde cualquier punto del módulo de planeación.
 */
import { useState, useEffect } from 'react';
import { planningService, InstanceSchedule } from '../../../api/planning-service';
import { getSemaphoreConfig } from '../hooks/usePlanning';

interface Installer {
  id: number;
  full_name: string;
  role: string;
}

interface Props {
  instance: InstanceSchedule | null;
  onClose: () => void;
  onSaved: () => void;
  /** When true, date/name fields are disabled and the Save button is hidden */
  readOnly?: boolean;
  /** Notificado al elegir un día en el mini calendario */
  onDateSelect?: (dateStr: string, laneCode: string) => void;
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

/** Encabezados de semana: Lunes → Domingo (mini calendario) */
const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Columna 0 = Lunes: cuántas celdas vacías antes del día 1 (month 1–12) */
function mondayFirstOffset(year: number, month: number) {
  const sundayFirst = new Date(year, month - 1, 1).getDay();
  return (sundayFirst + 6) % 7;
}

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

export default function InstanceEditModal({ instance, onClose, onSaved, readOnly = false, onDateSelect }: Props) {
  const [name, setName]   = useState('');
  const [dates, setDates] = useState<Record<LaneField, string>>({
    scheduled_prod_mdf:   '',
    scheduled_prod_stone: '',
    scheduled_inst_mdf:   '',
    scheduled_inst_stone: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  /** Mini calendario (Lunes primera columna) — reemplaza al picker nativo Sunday-first */
  const [pickerOpenField, setPickerOpenField] = useState<LaneField | null>(null);
  /** Panel reanclado arriba (top-4) mientras el mini calendario está abierto */
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth() + 1);

  const [installers, setInstallers] = useState<Installer[]>([]);
  const [imLeaderId, setImLeaderId] = useState<number | ''>('');
  const [imHelper1Id, setImHelper1Id] = useState<number | ''>('');
  const [imHelper2Id, setImHelper2Id] = useState<number | ''>('');
  const [imSaving, setImSaving] = useState(false);
  const [imError, setImError] = useState<string | null>(null);
  const [imSuccess, setImSuccess] = useState(false);
  const [ipLeaderId, setIpLeaderId] = useState<number | ''>('');
  const [ipHelper1Id, setIpHelper1Id] = useState<number | ''>('');
  const [ipHelper2Id, setIpHelper2Id] = useState<number | ''>('');
  const [ipSaving, setIpSaving] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);
  const [ipSuccess, setIpSuccess] = useState(false);

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
    setPickerOpenField(null);
    setCalendarOpen(false);
    setImLeaderId('');
    setImHelper1Id('');
    setImHelper2Id('');
    setImError(null);
    setImSuccess(false);
    setIpLeaderId('');
    setIpHelper1Id('');
    setIpHelper2Id('');
    setIpError(null);
    setIpSuccess(false);
  }, [instance]);

  useEffect(() => {
    if (!pickerOpenField) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-instance-date-picker]')) return;
      setPickerOpenField(null);
      setCalendarOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpenField]);

  useEffect(() => {
    const hasInstallation = dates.scheduled_inst_mdf || dates.scheduled_inst_stone;
    if (!instance || !hasInstallation) return;
    planningService
      .getInstallers()
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setInstallers(
          rows.filter((u: Installer) => String(u.role).toUpperCase() === 'LOGISTICS')
        );
      })
      .catch(() => setInstallers([]));
  }, [instance?.id, dates.scheduled_inst_mdf, dates.scheduled_inst_stone]);

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
    setPickerOpenField(null);
    setCalendarOpen(false);
  };

  const openDatePicker = (field: LaneField) => {
    const v = dates[field];
    if (v) {
      const [y, m] = v.split('-').map(Number);
      setPickerYear(y);
      setPickerMonth(m);
    } else {
      const n = new Date();
      setPickerYear(n.getFullYear());
      setPickerMonth(n.getMonth() + 1);
    }
    setPickerOpenField(field);
    setCalendarOpen(true);
  };

  const goPrevMonth = () => {
    setPickerMonth(m => {
      if (m <= 1) {
        setPickerYear(y => y - 1);
        return 12;
      }
      return m - 1;
    });
  };

  const goNextMonth = () => {
    setPickerMonth(m => {
      if (m >= 12) {
        setPickerYear(y => y + 1);
        return 1;
      }
      return m + 1;
    });
  };

  const selectPickerDay = (field: LaneField, day: number) => {
    const dayStr = `${pickerYear}-${String(pickerMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setDates(prev => ({ ...prev, [field]: dayStr }));
    const lane = LANE_META.find(l => l.field === field);
    if (lane) onDateSelect?.(dayStr, lane.code);
    setPickerOpenField(null);
    setCalendarOpen(false);
  };

  const handleSaveImTeam = async () => {
    if (!instance || !imLeaderId) return;
    setImSaving(true);
    setImError(null);
    setImSuccess(false);
    try {
      await planningService.assignTeam(instance.id, {
        leader_user_id: Number(imLeaderId),
        helper_1_user_id: imHelper1Id ? Number(imHelper1Id) : null,
        helper_2_user_id: imHelper2Id ? Number(imHelper2Id) : null,
        assignment_date: dates.scheduled_inst_mdf,
        lane: 'IM',
      });
      setImSuccess(true);
      setTimeout(() => setImSuccess(false), 3000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setImError(err?.response?.data?.detail ?? 'Error al asignar equipo IM.');
    } finally {
      setImSaving(false);
    }
  };

  const handleSaveIpTeam = async () => {
    if (!instance || !ipLeaderId) return;
    setIpSaving(true);
    setIpError(null);
    setIpSuccess(false);
    try {
      await planningService.assignTeam(instance.id, {
        leader_user_id: Number(ipLeaderId),
        helper_1_user_id: ipHelper1Id ? Number(ipHelper1Id) : null,
        helper_2_user_id: ipHelper2Id ? Number(ipHelper2Id) : null,
        assignment_date: dates.scheduled_inst_stone,
        lane: 'IP',
      });
      setIpSuccess(true);
      setTimeout(() => setIpSuccess(false), 3000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setIpError(err?.response?.data?.detail ?? 'Error al asignar equipo IP.');
    } finally {
      setIpSaving(false);
    }
  };

  return (
    <div className="fixed top-0 left-0 z-[55] h-screen overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-visible">

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

                    {/* Date display chip + mini calendario (semana Lunes–Domingo) */}
                    <div className="flex items-center gap-2 pl-0.5">
                      <div
                        className="relative flex-1"
                        data-instance-date-picker
                      >
                        {/* Visible styled chip */}
                        <div
                          role={readOnly ? undefined : 'button'}
                          tabIndex={readOnly ? undefined : 0}
                          onClick={() => !readOnly && openDatePicker(lane.field)}
                          onKeyDown={e => {
                            if (readOnly) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDatePicker(lane.field);
                            }
                          }}
                          className={`
                          flex items-center gap-2.5 px-3 py-2.5 rounded-xl border
                          select-none transition-all
                          ${readOnly ? 'cursor-default' : 'cursor-pointer'}
                          ${hasDate
                            ? `${lane.color} font-semibold`
                            : 'border-slate-200 bg-slate-50 text-slate-400'}
                        `}
                        >
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

                        {!readOnly && pickerOpenField === lane.field && (() => {
                          const daysInMonth = getDaysInMonth(pickerYear, pickerMonth);
                          const lead = mondayFirstOffset(pickerYear, pickerMonth);
                          const cells: (number | null)[] = [];
                          for (let i = 0; i < lead; i++) cells.push(null);
                          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                          while (cells.length % 7 !== 0) cells.push(null);
                          const ymd = (d: number) =>
                            `${pickerYear}-${String(pickerMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          return (
                            <div className="absolute left-0 top-full z-[60] mt-1 w-full max-w-[280px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                              <div className="mb-1 flex items-center justify-between gap-0.5">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); goPrevMonth(); }}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs text-slate-600 hover:bg-slate-100"
                                  aria-label="Mes anterior"
                                >
                                  ‹
                                </button>
                                <span className="min-w-0 flex-1 truncate text-center text-xs font-semibold text-slate-800">
                                  {MONTH_SHORT_ES[pickerMonth - 1]} {pickerYear}
                                </span>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); goNextMonth(); }}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs text-slate-600 hover:bg-slate-100"
                                  aria-label="Mes siguiente"
                                >
                                  ›
                                </button>
                              </div>
                              <div className="mb-0.5 grid grid-cols-7 gap-0.5 text-center text-xs font-semibold text-slate-400">
                                {WEEKDAY_HEADERS.map(h => (
                                  <div key={h} className="flex h-7 w-7 max-h-7 max-w-7 items-center justify-center">
                                    {h}
                                  </div>
                                ))}
                              </div>
                              <div className="grid grid-cols-7 gap-0.5">
                                {cells.map((d, idx) =>
                                  d === null ? (
                                    <div key={`e-${idx}`} className="h-7 w-7 max-h-7 max-w-7 shrink-0" />
                                  ) : (
                                    <button
                                      key={d}
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        selectPickerDay(lane.field, d);
                                      }}
                                      className={`
                                        flex h-7 w-7 max-h-7 max-w-7 shrink-0 items-center justify-center rounded-md text-xs font-medium transition-colors
                                        ${dates[lane.field] === ymd(d)
                                          ? 'bg-indigo-600 text-white'
                                          : 'text-slate-700 hover:bg-slate-100'}
                                      `}
                                    >
                                      {d}
                                    </button>
                                  ),
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Clear button — hidden for read-only */}
                      {hasDate && !readOnly && (
                        <button
                          type="button"
                          onClick={() => handleClearDate(lane.field)}
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm"
                          title="Quitar del calendario"
                        >
                          📅✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {dates.scheduled_inst_mdf && !readOnly && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">
                👷 Equipo — Instalación MDF (IM)
              </label>
              {installers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  No hay instaladores con rol LOGISTICS.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">
                      👷 Líder (obligatorio)
                    </label>
                    <select
                      value={imLeaderId}
                      onChange={(e) =>
                        setImLeaderId(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition"
                    >
                      <option value="">— Seleccionar líder —</option>
                      {installers.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">
                      🔧 Ayudante 1 (opcional)
                    </label>
                    <select
                      value={imHelper1Id}
                      onChange={(e) =>
                        setImHelper1Id(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition"
                    >
                      <option value="">— Sin ayudante 1 —</option>
                      {installers
                        .filter((i) => i.id !== Number(imLeaderId))
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">
                      🔧 Ayudante 2 (opcional)
                    </label>
                    <select
                      value={imHelper2Id}
                      onChange={(e) =>
                        setImHelper2Id(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 transition"
                    >
                      <option value="">— Sin ayudante 2 —</option>
                      {installers
                        .filter(
                          (i) =>
                            i.id !== Number(imLeaderId) &&
                            i.id !== Number(imHelper1Id)
                        )
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  {imError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {imError}
                    </p>
                  )}
                  {imSuccess && (
                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      ✅ Equipo IM asignado correctamente.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveImTeam()}
                    disabled={!imLeaderId || imSaving}
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white transition disabled:opacity-40"
                  >
                    {imSaving ? 'Guardando equipo...' : '👷 Guardar equipo instalador IM'}
                  </button>
                </div>
              )}
            </div>
          )}

          {dates.scheduled_inst_stone && !readOnly && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">
                👷 Equipo — Instalación Piedra (IP)
              </label>
              {installers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  No hay instaladores con rol LOGISTICS.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">
                      👷 Líder (obligatorio)
                    </label>
                    <select
                      value={ipLeaderId}
                      onChange={(e) =>
                        setIpLeaderId(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition"
                    >
                      <option value="">— Seleccionar líder —</option>
                      {installers.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">
                      🔧 Ayudante 1 (opcional)
                    </label>
                    <select
                      value={ipHelper1Id}
                      onChange={(e) =>
                        setIpHelper1Id(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition"
                    >
                      <option value="">— Sin ayudante 1 —</option>
                      {installers
                        .filter((i) => i.id !== Number(ipLeaderId))
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">
                      🔧 Ayudante 2 (opcional)
                    </label>
                    <select
                      value={ipHelper2Id}
                      onChange={(e) =>
                        setIpHelper2Id(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition"
                    >
                      <option value="">— Sin ayudante 2 —</option>
                      {installers
                        .filter(
                          (i) =>
                            i.id !== Number(ipLeaderId) &&
                            i.id !== Number(ipHelper1Id)
                        )
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  {ipError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {ipError}
                    </p>
                  )}
                  {ipSuccess && (
                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                      ✅ Equipo IP asignado correctamente.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveIpTeam()}
                    disabled={!ipLeaderId || ipSaving}
                    className="w-full py-2.5 rounded-xl text-sm font-bold bg-cyan-600 hover:bg-cyan-700 text-white transition disabled:opacity-40"
                  >
                    {ipSaving ? 'Guardando equipo...' : '👷 Guardar equipo instalador IP'}
                  </button>
                </div>
              )}
            </div>
          )}

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
