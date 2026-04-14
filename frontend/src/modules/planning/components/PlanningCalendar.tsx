import { useState, useCallback } from 'react';
import { CalendarPill, InstanceSchedule } from '../../../api/planning-service';
import InstancePill from './InstancePill';
import RescheduleModal from './RescheduleModal';
import { useInstanceActions } from '../hooks/usePlanning';

interface Props {
  year: number;
  month: number;
  calendarData: Record<string, CalendarPill[]>;
  loading: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onRefresh: () => void;
  highlightInstanceId?: number | null;
  onPillClick?: (pill: CalendarPill) => void;
  /** Instance being dragged from the Health Sidebar */
  externalDragInstance?: InstanceSchedule | null;
  /** Called when an external (sidebar) instance is dropped on a day */
  onExternalDrop?: (dayKey: string, instance: InstanceSchedule) => void;
}

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface DragState {
  pill: CalendarPill;
  sourceDate: string;
}

export default function PlanningCalendar({
  year,
  month,
  calendarData,
  loading,
  onPrevMonth,
  onNextMonth,
  onRefresh,
  highlightInstanceId,
  onPillClick,
  externalDragInstance,
  onExternalDrop,
}: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{
    pill: CalendarPill;
    targetDate: string;
  } | null>(null);

  // Lane-selector for external (sidebar) drops
  const [pendingExternalDrop, setPendingExternalDrop] = useState<{
    dayKey: string;
    instance: InstanceSchedule;
  } | null>(null);

  const { reschedule, loading: actionLoading } = useInstanceActions(onRefresh);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);
  const today = new Date();
  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate()
  );

  // ---- Drag handlers ----
  const handleDragStart = useCallback((e: React.DragEvent, pill: CalendarPill, dayKey: string) => {
    setDragState({ pill, sourceDate: dayKey });
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(dayKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    setDropTarget(null);

    // External drop (from Health Sidebar)
    if (externalDragInstance) {
      setPendingExternalDrop({ dayKey, instance: externalDragInstance });
      setDragState(null);
      return;
    }

    // Internal drop (pill → another day)
    if (!dragState || dragState.sourceDate === dayKey) {
      setDragState(null);
      return;
    }
    setPendingReschedule({ pill: dragState.pill, targetDate: dayKey });
    setDragState(null);
  }, [dragState, externalDragInstance]);

  const LANE_FIELD_MAP: Record<string, string> = {
    PM: 'scheduled_prod_mdf',
    PP: 'scheduled_prod_stone',
    IM: 'scheduled_inst_mdf',
    IP: 'scheduled_inst_stone',
  };

  const confirmReschedule = async (proportional: boolean) => {
    if (!pendingReschedule) return;
    const { pill, targetDate } = pendingReschedule;
    const field = LANE_FIELD_MAP[pill.lane];
    if (!field) return;
    const isoDate = targetDate + 'T09:00:00';
    await reschedule(pill.instance_id, field, isoDate, proportional);
    setPendingReschedule(null);
  };

  // Build grid cells: blanks + days
  const totalCells = firstDayOfWeek + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(rows * 7 - totalCells).fill(null),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button
          onClick={onPrevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          ‹
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold text-slate-800">
            {MONTH_NAMES[month]} {year}
          </h2>
          <p className="text-[10px] text-slate-400">Tablero de Planeación Maestro</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors disabled:opacity-40"
            title="Actualizar"
          >
            ↻
          </button>
          <button
            onClick={onNextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-4 py-2 border-b border-slate-100 overflow-x-auto">
        {[
          { code: 'PM', label: 'Prod. MDF',     color: 'bg-violet-200 text-violet-800' },
          { code: 'PP', label: 'Prod. Piedra',  color: 'bg-stone-200 text-stone-700'   },
          { code: 'IM', label: 'Inst. MDF',     color: 'bg-sky-200 text-sky-800'       },
          { code: 'IP', label: 'Inst. Piedra',  color: 'bg-cyan-200 text-cyan-800'     },
        ].map(item => (
          <div key={item.code} className="flex items-center gap-1 shrink-0">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.color}`}>
              {item.code}
            </span>
            <span className="text-[10px] text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-medium text-slate-400">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-600" />
          </div>
        ) : (
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 h-full">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`blank-${idx}`} className="min-h-[90px] bg-slate-50/50" />;
              }

              const dayKey = formatDateKey(year, month, day);
              const pills = calendarData[dayKey] ?? [];
              const isToday = dayKey === todayKey;
              const isDropTarget = dropTarget === dayKey;

              const filteredPills = highlightInstanceId
                ? pills.filter(p => p.instance_id === highlightInstanceId)
                : pills;
              const dimmed = highlightInstanceId != null;

              return (
                <div
                  key={dayKey}
                  className={`
                    min-h-[90px] p-1.5 flex flex-col gap-1 transition-colors
                    ${isToday ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'}
                    ${isDropTarget ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300' : ''}
                  `}
                  onDragOver={(e) => handleDragOver(e, dayKey)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dayKey)}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between">
                    <span className={`
                      text-xs font-medium
                      ${isToday
                        ? 'w-5 h-5 flex items-center justify-center rounded-full bg-slate-800 text-white text-[10px]'
                        : 'text-slate-400'}
                    `}>
                      {day}
                    </span>
                    {pills.length > 0 && (
                      <span className="text-[9px] text-slate-300">
                        {pills.length}
                      </span>
                    )}
                  </div>

                  {/* Pills */}
                  <div className={`flex flex-col gap-0.5 ${dimmed && filteredPills.length === 0 ? 'opacity-20' : ''}`}>
                    {(highlightInstanceId ? pills : pills).map((pill, pIdx) => {
                      const isHighlighted = highlightInstanceId === pill.instance_id;
                      return (
                        <div
                          key={`${pill.instance_id}-${pill.lane}-${pIdx}`}
                          className={`transition-opacity ${dimmed && !isHighlighted ? 'opacity-20' : 'opacity-100'}`}
                        >
                          <InstancePill
                            pill={pill}
                            onClick={onPillClick}
                            draggable
                            onDragStart={(e, p) => handleDragStart(e, p, dayKey)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Internal pill reschedule modal */}
      <RescheduleModal
        pill={pendingReschedule?.pill ?? null}
        targetDate={pendingReschedule?.targetDate ?? null}
        onConfirmProportional={() => confirmReschedule(true)}
        onConfirmFixed={() => confirmReschedule(false)}
        onCancel={() => setPendingReschedule(null)}
        loading={actionLoading}
      />

      {/* External (sidebar) drop — lane selector */}
      {pendingExternalDrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">¿En qué carril programar?</h2>
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-medium">{pendingExternalDrop.instance.custom_name}</span>
                {' → '}
                {new Date(pendingExternalDrop.dayKey + 'T12:00:00').toLocaleDateString('es-MX', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {[
                { field: 'scheduled_prod_mdf',   code: 'PM', label: 'Producción MDF',    cls: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' },
                { field: 'scheduled_prod_stone', code: 'PP', label: 'Producción Piedra',  cls: 'bg-stone-50  text-stone-700  border-stone-200  hover:bg-stone-100'  },
                { field: 'scheduled_inst_mdf',   code: 'IM', label: 'Instalación MDF',   cls: 'bg-sky-50    text-sky-700    border-sky-200    hover:bg-sky-100'    },
                { field: 'scheduled_inst_stone', code: 'IP', label: 'Instalación Piedra', cls: 'bg-cyan-50   text-cyan-700   border-cyan-200   hover:bg-cyan-100'   },
              ].map(lane => (
                <button
                  key={lane.field}
                  onClick={() => {
                    if (onExternalDrop) {
                      // Build modified instance with the chosen lane date set
                      const iso = pendingExternalDrop.dayKey + 'T09:00:00';
                      const updated: InstanceSchedule = {
                        ...pendingExternalDrop.instance,
                        schedule: {
                          ...pendingExternalDrop.instance.schedule,
                          [lane.code]: iso,
                        },
                      };
                      onExternalDrop(pendingExternalDrop.dayKey, updated);
                    }
                    setPendingExternalDrop(null);
                  }}
                  className={`p-3 rounded-xl border text-sm font-semibold transition-all ${lane.cls}`}
                >
                  <div className="text-lg font-black">{lane.code}</div>
                  <div className="text-[10px] mt-0.5">{lane.label}</div>
                </button>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => setPendingExternalDrop(null)}
                className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
