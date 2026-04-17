import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarPill, InstanceSchedule } from '../../../api/planning-service';
import InstancePill from './InstancePill';
import RescheduleModal from './RescheduleModal';
import { useInstanceActions, matchesPillQuery, LANE_FIELD_MAP, formatDateKey } from '../hooks/usePlanning';
import ExternalDropModal from './ExternalDropModal';

// ─── Constants ───────────────────────────────────────────────────────────────

const PILLS_COLLAPSE_THRESHOLD = 3;
const SATURATION_WARNING_COUNT = 5;

// Monday-first column headers: cols 0-4 = Mon-Fri, col 5 = Sat, col 6 = Sun
const DAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Monday-based first-day offset (Mon=0 … Sun=6) */
function getMondayFirstOffset(year: number, month: number) {
  const sundayFirst = new Date(year, month - 1, 1).getDay(); // 0=Sun…6=Sat
  return (sundayFirst + 6) % 7;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** One slot in the Monday-first calendar grid. May belong to an adjacent month. */
interface GridCell {
  day: number;
  year: number;
  month: number;
  isCurrentMonth: boolean;
}

interface DragState {
  pill: CalendarPill;
  sourceDate: string;
}

interface Props {
  year: number;
  month: number;
  calendarData: Record<string, CalendarPill[]>;
  loading: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onRefresh: () => void;
  highlightInstanceId?: number | null;
  /** fecha YYYY-MM-DD → sigla de carril al elegir fechas en InstanceEditModal */
  highlightDays?: Record<string, string>;
  onPillClick?: (pill: CalendarPill) => void;
  externalDragInstance?: InstanceSchedule | null;
  onExternalDrop?: (dayKey: string, instance: InstanceSchedule) => void;
  onDayClick?: (dayKey: string) => void;
  /** Shared weekend visibility state (controlled from PlanningPage) */
  weekendExpanded: boolean;
  onWeekendToggle: (expanded: boolean) => void;
  /** Focus-mode: search query from HealthSidebar */
  searchQuery: string;
  /** Focus-mode: instance lookup built from health panel for rich matching */
  instanceLookup: Record<number, InstanceSchedule>;
  /** When true, all drag-and-drop is disabled (Vendedor read-only view) */
  readOnly?: boolean;
}

// ─── Collapsed strip for one grid row ────────────────────────────────────────

interface MonthWeekendStripProps {
  satDay: number;
  sunDay: number;
  satKey: string;
  sunKey: string;
  todayKey: string;
  pillCount: number;
  onExpand: () => void;
  isDragging: boolean;
}

function MonthWeekendStrip({
  satDay,
  sunDay,
  satKey,
  sunKey,
  todayKey,
  pillCount,
  onExpand,
  isDragging,
}: MonthWeekendStripProps) {
  const satIsToday = satKey === todayKey;
  const sunIsToday = sunKey === todayKey;
  const hasToday   = satIsToday || sunIsToday;

  return (
    <button
      onClick={onExpand}
      onDragOver={e => { e.preventDefault(); if (isDragging) onExpand(); }}
      title="Expandir fin de semana"
      className={`
        w-10 shrink-0 flex flex-col items-center justify-between py-1.5 px-0.5
        border-l-2 border-dashed transition-all group select-none
        ${hasToday
          ? 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/60'
          : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/80'}
      `}
    >
      {/* Badge */}
      {pillCount > 0 ? (
        <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center shadow-sm">
          {pillCount > 9 ? '9+' : pillCount}
        </span>
      ) : (
        <span className="w-4 h-4" />
      )}

      {/* Day numbers */}
      <div className="flex flex-col items-center gap-0.5 flex-1 justify-center">
        {[
          { day: satDay, isToday: satIsToday, label: 'S' },
          { day: sunDay, isToday: sunIsToday, label: 'D' },
        ].map(({ day, isToday, label }) => (
          <span
            key={label}
            className={`
              text-[9px] font-bold leading-none
              ${isToday
                ? 'w-4 h-4 rounded-full bg-slate-800 text-white flex items-center justify-center'
                : 'text-slate-400'}
            `}
          >
            {day}
          </span>
        ))}
      </div>

      {/* Chevron */}
      <ChevronLeft
        size={12}
        className={`
          rotate-180 transition-colors shrink-0
          ${hasToday ? 'text-blue-400 group-hover:text-blue-600' : 'text-slate-300 group-hover:text-slate-500'}
        `}
      />
    </button>
  );
}

// ─── Individual day cell ──────────────────────────────────────────────────────

interface DayCellProps {
  day: number;
  cellYear: number;
  cellMonth: number;
  isCurrentMonth: boolean;
  todayKey: string;
  calendarData: Record<string, CalendarPill[]>;
  daySaturation: Record<string, { saturated: boolean; dupLanes: string[] }>;
  expandedCells: Set<string>;
  toggleExpand: (dayKey: string) => void;
  dropTarget: string | null;
  dragState: DragState | null;
  externalDragInstance: InstanceSchedule | null | undefined;
  highlightInstanceId: number | null | undefined;
  highlightDays: Record<string, string> | undefined;
  isWeekend?: boolean;
  onDragOver: (e: React.DragEvent, dayKey: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, dayKey: string) => void;
  onDragStart: (e: React.DragEvent, pill: CalendarPill, dayKey: string) => void;
  onPillClick?: (pill: CalendarPill) => void;
  onDayClick?: (dayKey: string) => void;
  searchQuery: string;
  instanceLookup: Record<number, InstanceSchedule>;
  readOnly?: boolean;
}

function DayCell({
  day,
  cellYear,
  cellMonth,
  isCurrentMonth,
  todayKey,
  calendarData,
  daySaturation,
  expandedCells,
  toggleExpand,
  dropTarget,
  dragState,
  externalDragInstance,
  highlightInstanceId,
  highlightDays,
  isWeekend = false,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onPillClick,
  onDayClick,
  searchQuery,
  instanceLookup,
  readOnly = false,
}: DayCellProps) {
  const dayKey      = formatDateKey(cellYear, cellMonth, day);
  const pills       = calendarData[dayKey] ?? [];
  const isToday     = dayKey === todayKey;
  const isDropTarget = dropTarget === dayKey;
  const satInfo     = daySaturation[dayKey];
  const isSaturated = satInfo?.saturated ?? false;
  const dupLanes    = satInfo?.dupLanes ?? [];
  const isExpanded  = expandedCells.has(dayKey);
  const visiblePills = isExpanded ? pills : pills.slice(0, PILLS_COLLAPSE_THRESHOLD);
  const hiddenCount  = pills.length - visiblePills.length;
  const focusActive  = searchQuery.trim().length > 0;
  const laneHighlight = highlightDays?.[dayKey];

  return (
    <div
      className={`
        flex-1 min-w-0 overflow-hidden min-h-[90px] p-1.5 flex flex-col gap-1 transition-colors
        ${isCurrentMonth
          ? isToday ? 'bg-blue-50/60' : isWeekend ? 'bg-slate-50/40 hover:bg-slate-100/60' : 'hover:bg-slate-50/80'
          : 'bg-slate-50/80 hover:bg-slate-100/60'}
        ${isDropTarget
          ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-300'
          : isSaturated && isCurrentMonth
            ? 'ring-1 ring-inset ring-amber-200'
            : ''}
        ${laneHighlight ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
      `}
      onDragOver={e => onDragOver(e, dayKey)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, dayKey)}
    >
      {/* Day header */}
      <div className="flex items-center justify-between min-h-[16px]">
        <span
          onClick={() => onDayClick?.(dayKey)}
          className={`
            text-xs font-medium leading-none transition-colors
            ${isToday
              ? 'w-5 h-5 flex items-center justify-center rounded-full bg-slate-800 text-white text-[10px]'
              : isCurrentMonth ? 'text-slate-400' : 'text-slate-300 italic'}
            ${onDayClick ? 'cursor-pointer hover:text-slate-600' : ''}
          `}
        >
          {day}
        </span>
        <div className="flex items-center gap-0.5">
          {laneHighlight && (
            <span
              className="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-600 text-white leading-none shrink-0"
              title={`Resaltado edición: ${laneHighlight}`}
            >
              {laneHighlight}
            </span>
          )}
          {dupLanes.length > 0 && (
            <span
              title={`Carril duplicado: ${dupLanes.join(', ')}`}
              className="text-[8px] text-amber-500 font-black leading-none cursor-default"
            >
              ⚠️
            </span>
          )}
          {pills.length > 0 && (
            <span className={`
              text-[9px] font-bold leading-none px-1 py-0.5 rounded-full
              ${isSaturated ? 'bg-amber-100 text-amber-600' : 'text-slate-300'}
            `}>
              {pills.length}
            </span>
          )}
        </div>
      </div>

      {/* Drop hint */}
      {(dragState || externalDragInstance) && isDropTarget && (
        <div className="border border-dashed border-emerald-400 rounded-lg py-1 text-center">
          <span className="text-[9px] text-emerald-600 font-medium">Soltar aquí</span>
        </div>
      )}

      {/* Saturation banner — only for current month (adjacent months lack pill data) */}
      {isSaturated && isCurrentMonth && (
        <div
          title="Día saturado — 5 o más operaciones."
          className="text-[8px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 text-center font-semibold cursor-default"
        >
          ⚠️ Día saturado
        </div>
      )}

      {/* Pills */}
      <div className="flex flex-col gap-0.5 min-w-0">
        {visiblePills.map((pill, pIdx) => {
          const isHighlighted = highlightInstanceId === pill.instance_id;
          const matches       = matchesPillQuery(pill, searchQuery, instanceLookup);
          // Focus-mode takes priority; fall back to highlight-dim when no search active
          const isActive = focusActive
            ? matches
            : (highlightInstanceId == null || isHighlighted);
          return (
            <div
              key={`${pill.instance_id}-${pill.lane}-${pIdx}`}
              className={`min-w-0 transition-all duration-150 ${isActive ? 'opacity-100' : 'opacity-25 grayscale'}`}
            >
              <InstancePill
                pill={pill}
                onClick={onPillClick}
                draggable={!readOnly}
                onDragStart={readOnly ? undefined : (e, p) => onDragStart(e, p, dayKey)}
              />
            </div>
          );
        })}
      </div>

      {/* +N more toggle */}
      {pills.length > PILLS_COLLAPSE_THRESHOLD && (
        <button
          onClick={() => toggleExpand(dayKey)}
          className="text-[9px] text-indigo-500 hover:text-indigo-700 font-semibold text-left transition-colors mt-0.5"
        >
          {isExpanded ? '↑ Ver menos' : `+${hiddenCount} más`}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlanningCalendar({
  year,
  month,
  calendarData,
  loading,
  onPrevMonth,
  onNextMonth,
  onRefresh,
  highlightInstanceId,
  highlightDays,
  onPillClick,
  externalDragInstance,
  onExternalDrop,
  onDayClick,
  weekendExpanded,
  onWeekendToggle,
  searchQuery,
  instanceLookup,
  readOnly = false,
}: Props) {
  const [dragState, setDragState]           = useState<DragState | null>(null);
  const [dropTarget, setDropTarget]         = useState<string | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{
    pill: CalendarPill; targetDate: string;
  } | null>(null);
  const [pendingExternalDrop, setPendingExternalDrop] = useState<{
    dayKey: string; instance: InstanceSchedule;
  } | null>(null);
  const [expandedCells, setExpandedCells]   = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((dayKey: string) => {
    setExpandedCells(prev => {
      const next = new Set(prev);
      next.has(dayKey) ? next.delete(dayKey) : next.add(dayKey);
      return next;
    });
  }, []);

  // ── Saturation & dup-lane warnings ───────────────────────────
  const daySaturation = useMemo(() => {
    const result: Record<string, { saturated: boolean; dupLanes: string[] }> = {};
    for (const [dayKey, pills] of Object.entries(calendarData)) {
      const laneCounts: Record<string, number> = {};
      for (const p of pills) laneCounts[p.lane] = (laneCounts[p.lane] ?? 0) + 1;
      result[dayKey] = {
        saturated: pills.length >= SATURATION_WARNING_COUNT,
        dupLanes: Object.entries(laneCounts).filter(([, c]) => c >= 2).map(([l]) => l),
      };
    }
    return result;
  }, [calendarData]);

  // ── Total weekend pills (for legend badge) ───────────────────
  const daysInMonth    = getDaysInMonth(year, month);
  const weekendPillCount = useMemo(() => {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay(); // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) {
        count += calendarData[formatDateKey(year, month, d)]?.length ?? 0;
      }
    }
    return count;
  }, [calendarData, year, month, daysInMonth]);

  const { reschedule, loading: actionLoading, error: actionError } = useInstanceActions(onRefresh);

  const today    = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // ── Drag handlers ─────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, pill: CalendarPill, dayKey: string) => {
    if (readOnly) return;
    setDragState({ pill, sourceDate: dayKey });
    e.dataTransfer.effectAllowed = 'move';
  }, [readOnly]);

  const handleDragOver = useCallback((e: React.DragEvent, dayKey: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(dayKey);
  }, [readOnly]);

  const handleDragLeave = useCallback(() => setDropTarget(null), []);

  const handleDrop = useCallback((e: React.DragEvent, dayKey: string) => {
    if (readOnly) { setDropTarget(null); return; }
    e.preventDefault();
    setDropTarget(null);
    if (externalDragInstance) {
      setPendingExternalDrop({ dayKey, instance: externalDragInstance });
      setDragState(null);
      return;
    }
    if (!dragState || dragState.sourceDate === dayKey) { setDragState(null); return; }
    setPendingReschedule({ pill: dragState.pill, targetDate: dayKey });
    setDragState(null);
  }, [readOnly, dragState, externalDragInstance]);

  const confirmReschedule = async (proportional: boolean) => {
    if (!pendingReschedule) return;
    const { pill, targetDate } = pendingReschedule;
    const field = LANE_FIELD_MAP[pill.lane];
    if (!field) return;
    const result = await reschedule(pill.instance_id, field, targetDate + 'T09:00:00', proportional);
    if (result !== null) setPendingReschedule(null);
    // On failure: modal stays open and actionError is shown
  };

  const isDragging = !!(dragState || externalDragInstance);

  // ── Auto-navigation on drag: hover ‹/› for 800 ms to change month ─────────
  const dragNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startNavTimer = useCallback((navigate: () => void) => {
    if (dragNavTimerRef.current) return;
    dragNavTimerRef.current = setTimeout(() => {
      dragNavTimerRef.current = null;
      navigate();
    }, 800);
  }, []);

  const clearNavTimer = useCallback(() => {
    if (dragNavTimerRef.current) {
      clearTimeout(dragNavTimerRef.current);
      dragNavTimerRef.current = null;
    }
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => { if (dragNavTimerRef.current) clearTimeout(dragNavTimerRef.current); }, []);

  // ── Build Monday-first grid rows with real adjacent-month fill cells ─────
  // Col order per row: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  const mondayOffset = getMondayFirstOffset(year, month);

  // Previous month
  const prevMonthYear   = month === 1 ? year - 1 : year;
  const prevMonthNum    = month === 1 ? 12 : month - 1;
  const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonthNum);
  // Next month
  const nextMonthYear   = month === 12 ? year + 1 : year;
  const nextMonthNum    = month === 12 ? 1 : month + 1;

  const flatCells: GridCell[] = [
    // Tail of previous month
    ...Array.from({ length: mondayOffset }, (_, i) => ({
      day: daysInPrevMonth - mondayOffset + 1 + i,
      year: prevMonthYear,
      month: prevMonthNum,
      isCurrentMonth: false,
    })),
    // Current month
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      year,
      month,
      isCurrentMonth: true,
    })),
  ];
  // Head of next month
  let nextFill = 1;
  while (flatCells.length % 7 !== 0) {
    flatCells.push({ day: nextFill++, year: nextMonthYear, month: nextMonthNum, isCurrentMonth: false });
  }

  const numRows  = flatCells.length / 7;
  const gridRows: GridCell[][] = Array.from(
    { length: numRows },
    (_, r) => flatCells.slice(r * 7, r * 7 + 7)
  );

  // Shared cell props passed to every DayCell (year/month are per-cell now)
  const sharedCellProps = {
    todayKey,
    calendarData, daySaturation,
    expandedCells, toggleExpand,
    dropTarget, dragState,
    externalDragInstance,
    highlightInstanceId,
    highlightDays,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onDragStart: handleDragStart,
    onPillClick,
    onDayClick,
    searchQuery,
    instanceLookup,
    readOnly,
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Nav bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <button
          onClick={onPrevMonth}
          onDragOver={e => { e.preventDefault(); if (isDragging) startNavTimer(onPrevMonth); }}
          onDragLeave={clearNavTimer}
          onDrop={clearNavTimer}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          title="Mes anterior (mantén una pieza aquí para navegar)"
        >
          ‹
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold text-slate-800">{MONTH_NAMES[month]} {year}</h2>
          <p className="text-[10px] text-slate-400">
            Tablero de Planeación Maestro
            {!weekendExpanded && weekendPillCount > 0 && (
              <span className="ml-1.5 text-red-500 font-semibold">
                · {weekendPillCount} op. en fin de semana
              </span>
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
            onClick={onNextMonth}
            onDragOver={e => { e.preventDefault(); if (isDragging) startNavTimer(onNextMonth); }}
            onDragLeave={clearNavTimer}
            onDrop={clearNavTimer}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Mes siguiente (mantén una pieza aquí para navegar)"
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Legend + weekend toggle ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 overflow-x-auto shrink-0">
        {[
          { code: 'PM', label: 'Prod. MDF',    color: 'bg-violet-200 text-violet-800' },
          { code: 'PP', label: 'Prod. Piedra', color: 'bg-stone-200 text-stone-700'  },
          { code: 'IM', label: 'Inst. MDF',    color: 'bg-sky-200 text-sky-800'      },
          { code: 'IP', label: 'Inst. Piedra', color: 'bg-cyan-200 text-cyan-800'    },
        ].map(item => (
          <div key={item.code} className="flex items-center gap-1 shrink-0">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.color}`}>
              {item.code}
            </span>
            <span className="text-[10px] text-slate-400">{item.label}</span>
          </div>
        ))}

        {/* Weekend toggle */}
        <div className="ml-auto shrink-0">
          <button
            onClick={() => onWeekendToggle(!weekendExpanded)}
            className={`
              flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg
              border transition-all
              ${weekendExpanded
                ? 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'border-dashed border-slate-300 text-slate-400 hover:text-slate-600 hover:bg-slate-50'}
            `}
            title={weekendExpanded ? 'Colapsar fin de semana' : 'Expandir fin de semana'}
          >
            {weekendExpanded
              ? <><ChevronRight size={11} /> Colapsar fin de semana</>
              : <><ChevronLeft size={11} className="rotate-180" /> Mostrar fin de semana</>
            }
            {!weekendExpanded && weekendPillCount > 0 && (
              <span className="ml-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-black">
                {weekendPillCount > 9 ? '9+' : weekendPillCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Column headers ── */}
      <div className="flex border-b border-slate-100 shrink-0">
        {/* Mon–Fri headers (flex-1 each) */}
        {DAY_HEADERS.slice(0, 5).map(d => (
          <div key={d} className="flex-1 py-2 text-center text-[10px] font-medium text-slate-400">
            {d}
          </div>
        ))}
        {/* Weekend headers */}
        {weekendExpanded ? (
          <>
            {DAY_HEADERS.slice(5).map(d => (
              <div key={d} className="flex-1 py-2 text-center text-[10px] font-medium text-slate-300">
                {d}
              </div>
            ))}
            {/* Collapse button aligned with the narrow collapse strip */}
            <button
              onClick={() => onWeekendToggle(false)}
              title="Colapsar fin de semana"
              className="w-6 shrink-0 flex items-center justify-center border-l border-dashed border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors group"
            >
              <ChevronRight size={11} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </button>
          </>
        ) : (
          <div className="w-10 shrink-0 py-2 flex items-center justify-center border-l border-dashed border-slate-200">
            <span className="text-[8px] font-bold text-slate-300 tracking-wide">F·S</span>
          </div>
        )}
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-600" />
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {gridRows.map((rowCells, rowIdx) => {
              const satCell = rowCells[5]; // Sat (GridCell, always defined)
              const sunCell = rowCells[6]; // Sun (GridCell, always defined)
              const satKey  = formatDateKey(satCell.year, satCell.month, satCell.day);
              const sunKey  = formatDateKey(sunCell.year, sunCell.month, sunCell.day);
              const rowWeekendPills =
                (calendarData[satKey]?.length ?? 0) +
                (calendarData[sunKey]?.length ?? 0);

              return (
                <div key={rowIdx} className="flex min-h-[110px] divide-x divide-slate-100">
                  {/* Mon–Fri */}
                  {rowCells.slice(0, 5).map((cell, colIdx) => (
                    <DayCell
                      key={colIdx}
                      day={cell.day}
                      cellYear={cell.year}
                      cellMonth={cell.month}
                      isCurrentMonth={cell.isCurrentMonth}
                      {...sharedCellProps}
                    />
                  ))}

                  {/* Weekend */}
                  {weekendExpanded ? (
                    <>
                      <DayCell
                        day={satCell.day}
                        cellYear={satCell.year}
                        cellMonth={satCell.month}
                        isCurrentMonth={satCell.isCurrentMonth}
                        isWeekend
                        {...sharedCellProps}
                      />
                      <DayCell
                        day={sunCell.day}
                        cellYear={sunCell.year}
                        cellMonth={sunCell.month}
                        isCurrentMonth={sunCell.isCurrentMonth}
                        isWeekend
                        {...sharedCellProps}
                      />
                      {/* Narrow collapse strip on the far right */}
                      {rowIdx === 0 && (
                        <button
                          onClick={() => onWeekendToggle(false)}
                          title="Colapsar fin de semana"
                          className="w-6 shrink-0 row-span-full flex items-center justify-center border-l border-dashed border-slate-200 bg-slate-50/60 hover:bg-slate-100 transition-colors group"
                        >
                          <ChevronRight size={11} className="text-slate-300 group-hover:text-slate-500" />
                        </button>
                      )}
                      {rowIdx > 0 && (
                        <div className="w-6 shrink-0 border-l border-dashed border-slate-100 bg-slate-50/40" />
                      )}
                    </>
                  ) : (
                    <MonthWeekendStrip
                      satDay={satCell.day}
                      sunDay={sunCell.day}
                      satKey={satKey}
                      sunKey={sunKey}
                      todayKey={todayKey}
                      pillCount={rowWeekendPills}
                      onExpand={() => onWeekendToggle(true)}
                      isDragging={isDragging}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom-left stack: reschedule (arriba) + lane picker (abajo) — sin overlay ── */}
      {(pendingReschedule || pendingExternalDrop) && (
        <div className="fixed top-0 left-0 z-50 flex flex-col-reverse gap-3 items-start pointer-events-none max-w-[min(24rem,calc(100vw-6rem))]">
          <div className="pointer-events-auto w-full">
            <ExternalDropModal
              pending={pendingExternalDrop}
              onExternalDrop={onExternalDrop}
              onCancel={() => setPendingExternalDrop(null)}
            />
          </div>
          <div className="pointer-events-auto w-full">
            <RescheduleModal
              pill={pendingReschedule?.pill ?? null}
              targetDate={pendingReschedule?.targetDate ?? null}
              onConfirmProportional={() => confirmReschedule(true)}
              onConfirmFixed={() => confirmReschedule(false)}
              onCancel={() => setPendingReschedule(null)}
              loading={actionLoading}
              error={actionError}
            />
          </div>
        </div>
      )}
    </div>
  );
}
