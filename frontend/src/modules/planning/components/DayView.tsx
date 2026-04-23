import { CalendarPill, InstanceSchedule } from '../../../api/planning-service';
import { LANE_COLORS, matchesPillQuery } from '../hooks/usePlanning';

const FULL_DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function parseDateStr(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  return {
    dayName: FULL_DAY_NAMES[date.getDay()],
    day: d,
    month: MONTH_NAMES[m],
    year: y,
    isToday:
      today.getFullYear() === y &&
      today.getMonth() + 1 === m &&
      today.getDate() === d,
  };
}

const LANES: { code: 'PM' | 'PP' | 'IM' | 'IP'; label: string; sublabel: string; icon: string }[] = [
  { code: 'PM', label: 'Producción MDF',    sublabel: 'Carril PM', icon: '🪵' },
  { code: 'PP', label: 'Producción Piedra', sublabel: 'Carril PP', icon: '🪨' },
  { code: 'IM', label: 'Instalación MDF',   sublabel: 'Carril IM', icon: '🔧' },
  { code: 'IP', label: 'Instalación Piedra',sublabel: 'Carril IP', icon: '⚙️' },
];


interface Props {
  calendarData: Record<string, CalendarPill[]>;
  selectedDate: string;
  loading: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onRefresh: () => void;
  highlightInstanceId?: number | null;
  onPillClick?: (pill: CalendarPill) => void;
  /** Focus-mode: search query from HealthSidebar */
  searchQuery: string;
  /** Focus-mode: instance lookup built from health panel */
  instanceLookup: Record<number, InstanceSchedule>;
  /** When true, instance pills are non-draggable (Vendedor read-only view) */
  readOnly?: boolean;
}

function PillCard({
  pill,
  onClick,
  isHighlighted,
}: {
  pill: CalendarPill;
  onClick?: (pill: CalendarPill) => void;
  isHighlighted: boolean;
}) {
  const laneClass = LANE_COLORS[pill.lane] ?? 'bg-gray-200 text-gray-700 border-gray-300';
  const alias = pill.custom_name?.trim() || '—';

  return (
    <button
      onClick={() => onClick?.(pill)}
      className={`
        w-full text-left px-4 py-3 rounded-xl border transition-all
        hover:shadow-md active:scale-[0.99]
        ${isHighlighted
          ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/40 shadow-md'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'}
        ${pill.is_warranty_reopened ? 'ring-1 ring-orange-300' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Lane badge */}
        <span className={`mt-0.5 shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border ${laneClass}`}>
          {pill.lane}
        </span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {pill.is_warranty_reopened && (
              <span className="text-orange-500 text-xs">⚠️</span>
            )}
            <p className="text-sm font-bold text-slate-800 leading-snug">
              {alias}
            </p>
          </div>

          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-400 font-medium">
              {pill.lane_label}
            </span>
          </div>

          {/* Production status */}
          {pill.production_status && (
            <p className="mt-1 text-[10px] text-slate-400">
              Estado: <span className="font-medium text-slate-600">{pill.production_status}</span>
            </p>
          )}
        </div>

        {/* Click hint */}
        <span className="shrink-0 text-slate-300 text-xs mt-0.5">›</span>
      </div>
    </button>
  );
}

export default function DayView({
  calendarData,
  selectedDate,
  loading,
  onPrevDay,
  onNextDay,
  onRefresh,
  highlightInstanceId,
  onPillClick,
  searchQuery,
  instanceLookup,
  // readOnly accepted for API consistency with Month/Week views; DayView has no DnD
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readOnly: _readOnly = false,
}: Props) {
  const pills = calendarData[selectedDate] ?? [];
  const { dayName, day, month, year, isToday } = parseDateStr(selectedDate);
  const focusActive = searchQuery.trim().length > 0;

  const totalOps = pills.length;

  return (
    <div className="flex flex-col h-full">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <button
          onClick={onPrevDay}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          ‹
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold text-slate-800 capitalize">
            {dayName}, {day} de {month} {year}
          </h2>
          <p className="text-[10px] text-slate-400">
            {isToday ? '✦ Hoy · ' : ''}Vista Diaria
            {totalOps > 0 && (
              <span className="ml-1 text-slate-500">· {totalOps} operación{totalOps !== 1 ? 'es' : ''}</span>
            )}
          </p>
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
            onClick={onNextDay}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-600" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {pills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <span className="text-5xl mb-3">📅</span>
              <p className="text-sm font-semibold text-slate-500">Sin operaciones este día</p>
              <p className="text-xs text-slate-400 mt-1">No hay instancias programadas para esta fecha.</p>
            </div>
          ) : (
            LANES.map(lane => {
              const lanePills = pills.filter(p => p.lane === lane.code);
              if (lanePills.length === 0) return null;

              const laneClass = LANE_COLORS[lane.code] ?? 'bg-gray-200 text-gray-700 border-gray-300';

              return (
                <section key={lane.code}>
                  {/* Lane header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">{lane.icon}</span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{lane.label}</h3>
                      <p className="text-[10px] text-slate-400">{lane.sublabel} · {lanePills.length} operación{lanePills.length !== 1 ? 'es' : ''}</p>
                    </div>
                    <span className={`ml-auto text-[10px] font-black px-2 py-1 rounded-lg border ${laneClass}`}>
                      {lane.code}
                    </span>
                  </div>

                  {/* Pills list */}
                  <div className="space-y-2 pl-1">
                    {lanePills.map((pill, idx) => {
                      const isHighlighted = highlightInstanceId === pill.instance_id;
                      const matches       = matchesPillQuery(pill, searchQuery, instanceLookup);
                      const isActive = focusActive
                        ? matches
                        : (highlightInstanceId == null || isHighlighted);
                      return (
                        <div
                          key={`${pill.instance_id}-${idx}`}
                          className={`transition-all duration-150 ${isActive ? 'opacity-100' : 'opacity-25 grayscale'}`}
                        >
                          <PillCard
                            pill={pill}
                            onClick={onPillClick}
                            isHighlighted={isHighlighted && isActive}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}

          {/* Summary footer when there are pills */}
          {pills.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <div className="grid grid-cols-4 gap-2">
                {LANES.map(lane => {
                  const count = pills.filter(p => p.lane === lane.code).length;
                  const laneClass = LANE_COLORS[lane.code] ?? 'bg-gray-200 text-gray-700 border-gray-300';
                  return (
                    <div key={lane.code} className={`rounded-xl border p-2 text-center ${laneClass}`}>
                      <div className="text-lg font-black">{count}</div>
                      <div className="text-[9px] font-semibold opacity-80">{lane.code}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
