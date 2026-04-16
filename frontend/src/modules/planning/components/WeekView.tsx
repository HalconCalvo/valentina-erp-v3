import { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarPill, InstanceSchedule } from '../../../api/planning-service';
import InstancePill from './InstancePill';
import RescheduleModal from './RescheduleModal';
import { useInstanceActions, matchesPillQuery, LANE_FIELD_MAP, formatDateKey } from '../hooks/usePlanning';
import ExternalDropModal from './ExternalDropModal';

// ─── Helpers ────────────────────────────────────────────────────────────────

const FULL_DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES_SHORT = [
  '', 'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function getWeekDays(dateStr: string): string[] {
  // Returns [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(sunday);
    dt.setDate(sunday.getDate() + i);
    return formatDateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  });
}

function friendlyDayLabel(dateStr: string) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  const today = new Date();
  return {
    name: FULL_DAY_NAMES[date.getDay()],
    nameShort: FULL_DAY_NAMES[date.getDay()].slice(0, 3),
    day: d,
    month: MONTH_NAMES_SHORT[mo],
    isToday:
      today.getFullYear() === y &&
      today.getMonth() + 1 === mo &&
      today.getDate() === d,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DragState {
  pill: CalendarPill;
  sourceDate: string;
}

interface Props {
  calendarData: Record<string, CalendarPill[]>;
  selectedDate: string;
  onDateChange: (dateStr: string) => void;
  loading: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onRefresh: () => void;
  highlightInstanceId?: number | null;
  onPillClick?: (pill: CalendarPill) => void;
  externalDragInstance?: InstanceSchedule | null;
  onExternalDrop?: (dayKey: string, instance: InstanceSchedule) => void;
  onDayClick?: (dayKey: string) => void;
  /** Shared weekend visibility state (controlled from PlanningPage) */
  weekendExpanded: boolean;
  onWeekendToggle: (expanded: boolean) => void;
  /** Focus-mode: search query from HealthSidebar */
  searchQuery: string;
  /** Focus-mode: instance lookup built from health panel */
  instanceLookup: Record<number, InstanceSchedule>;
  /** When true, all drag-and-drop is disabled (Vendedor read-only view) */
  readOnly?: boolean;
}

// ─── Day Column ──────────────────────────────────────────────────────────────

interface DayColumnProps {
  dayKey: string;
  pills: CalendarPill[];
  isDropTarget: boolean;
  isDragging: boolean;
  highlightInstanceId?: number | null;
  onPillClick?: (pill: CalendarPill) => void;
  onDragStart: (e: React.DragEvent, pill: CalendarPill, dayKey: string) => void;
  onDragOver: (e: React.DragEvent, dayKey: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, dayKey: string) => void;
  onDayClick?: (dayKey: string) => void;
  isWeekend?: boolean;
  searchQuery: string;
  instanceLookup: Record<number, InstanceSchedule>;
  readOnly?: boolean;
}

function DayColumn({
  dayKey,
  pills,
  isDropTarget,
  isDragging,
  highlightInstanceId,
  onPillClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDayClick,
  isWeekend = false,
  searchQuery,
  instanceLookup,
  readOnly = false,
}: DayColumnProps) {
  const { name, day, month, isToday } = friendlyDayLabel(dayKey);
  const focusActive = searchQuery.trim().length > 0;
  const totalCount  = pills.length;

  return (
    <div
      className={`
        flex flex-col min-h-[200px] min-w-0 overflow-hidden border-r border-slate-100 transition-colors
        ${isToday ? 'bg-blue-50/50' : isWeekend ? 'bg-slate-50/40' : 'hover:bg-slate-50/60'}
        ${isDropTarget ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-300' : ''}
      `}
      onDragOver={e => onDragOver(e, dayKey)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, dayKey)}
    >
      {/* Day header */}
      <div className={`
        px-2 py-3 border-b border-slate-100 text-center sticky top-0 z-10
        ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-slate-50' : 'bg-white'}
      `}>
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${isWeekend ? 'text-slate-400' : 'text-slate-400'}`}>
          {name}
        </p>
        <button
          onClick={() => onDayClick?.(dayKey)}
          className={`
            mt-0.5 w-8 h-8 rounded-full flex items-center justify-center mx-auto
            text-sm font-bold transition-all
            ${isToday
              ? 'bg-slate-800 text-white'
              : 'text-slate-700 hover:bg-slate-100 cursor-pointer hover:ring-2 hover:ring-indigo-300'}
          `}
          title="Ver vista diaria"
        >
          {day}
        </button>
        <p className="text-[9px] text-slate-300 mt-0.5 capitalize">{month}</p>
        {totalCount > 0 && (
          <span className={`
            inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1
            ${totalCount >= 5 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}
          `}>
            {totalCount} op.
          </span>
        )}
      </div>

      {/* Drop hint */}
      {isDragging && isDropTarget && (
        <div className="mx-2 mt-2 border border-dashed border-emerald-400 rounded-xl py-2 text-center">
          <span className="text-[10px] text-emerald-600 font-medium">Soltar aquí</span>
        </div>
      )}

      {/* Pills */}
      <div className="flex-1 p-2 flex flex-col gap-1.5 overflow-y-auto min-w-0">
        {pills.map((pill, pIdx) => {
          const isHighlighted = highlightInstanceId === pill.instance_id;
          const matches       = matchesPillQuery(pill, searchQuery, instanceLookup);
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
        {pills.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[10px] text-slate-200 select-none">—</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Collapsed Weekend Column ─────────────────────────────────────────────────

interface CollapsedWeekendProps {
  satKey: string;
  sunKey: string;
  pillCount: number;
  onExpand: () => void;
}

function CollapsedWeekendColumn({
  satKey,
  sunKey,
  pillCount,
  onExpand,
}: CollapsedWeekendProps) {
  const satLabel = friendlyDayLabel(satKey);
  const sunLabel = friendlyDayLabel(sunKey);
  const hasToday = satLabel.isToday || sunLabel.isToday;

  return (
    <button
      onClick={onExpand}
      onDragOver={e => { e.preventDefault(); onExpand(); }}
      title="Expandir fin de semana"
      className={`
        w-10 shrink-0 flex flex-col items-center justify-between
        border-l-2 border-dashed py-4 px-1
        transition-all duration-200 group select-none
        ${hasToday
          ? 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/60'
          : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/80'}
      `}
    >
      {/* Top: badge + chevron */}
      <div className="flex flex-col items-center gap-2">
        {/* Pill count badge */}
        {pillCount > 0 ? (
          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
            {pillCount > 9 ? '9+' : pillCount}
          </span>
        ) : (
          <span className="w-5 h-5 rounded-full border border-dashed border-slate-300 flex items-center justify-center">
            <span className="text-[8px] text-slate-300">0</span>
          </span>
        )}

        {/* Expand chevron */}
        <ChevronLeft
          size={14}
          className={`
            transition-colors rotate-180
            ${hasToday ? 'text-blue-400 group-hover:text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}
          `}
        />
      </div>

      {/* Middle: vertical label */}
      <span
        className={`
          text-[9px] font-semibold tracking-widest uppercase leading-none
          ${hasToday ? 'text-blue-400' : 'text-slate-400'}
          group-hover:text-slate-600 transition-colors
        `}
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        Fin de semana
      </span>

      {/* Bottom: day numbers */}
      <div className="flex flex-col items-center gap-1">
        {[satLabel, sunLabel].map((lbl, i) => (
          <span
            key={i}
            className={`
              w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold
              ${lbl.isToday
                ? 'bg-slate-800 text-white'
                : 'text-slate-400'}
            `}
          >
            {lbl.day}
          </span>
        ))}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WeekView({
  calendarData,
  selectedDate,
  loading,
  onPrevWeek,
  onNextWeek,
  onRefresh,
  highlightInstanceId,
  onPillClick,
  externalDragInstance,
  onExternalDrop,
  onDayClick,
  weekendExpanded,
  onWeekendToggle,
  searchQuery,
  instanceLookup,
  readOnly = false,
  // onDateChange intentionally unused — parent handles date navigation
}: Props) {
  // weekDays[0]=Sun, [1]=Mon, ..., [5]=Fri, [6]=Sat
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  // Display order: Mon–Fri, then Sat, Sun (weekend grouped at the right)
  const weekdayKeys = useMemo(() => weekDays.slice(1, 6), [weekDays]); // Mon-Fri
  const satKey      = weekDays[6];
  const sunKey      = weekDays[0];

  // weekendExpanded is now controlled by the parent (PlanningPage) via props

  // Total pill count across weekend
  const weekendPillCount = useMemo(() =>
    (calendarData[satKey]?.length ?? 0) + (calendarData[sunKey]?.length ?? 0),
  [calendarData, satKey, sunKey]);

  // ── Drag state ────────────────────────────────────────────────
  const [dragState, setDragState]           = useState<DragState | null>(null);
  const [dropTarget, setDropTarget]         = useState<string | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{
    pill: CalendarPill; targetDate: string;
  } | null>(null);
  const [pendingExternalDrop, setPendingExternalDrop] = useState<{
    dayKey: string; instance: InstanceSchedule;
  } | null>(null);

  const { reschedule, loading: actionLoading, error: actionError } = useInstanceActions(onRefresh);

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

  // ── Week header label ─────────────────────────────────────────
  const first = weekDays[1]; // Mon
  const last  = weekDays[0]; // Sun (end of week)
  const [fy, fm, fd] = first.split('-').map(Number);
  const [, lm, ld]   = last.split('-').map(Number);
  const weekLabel =
    fm === lm
      ? `${fd}–${ld} ${MONTH_NAMES_SHORT[fm]} ${fy}`
      : `${fd} ${MONTH_NAMES_SHORT[fm]} – ${ld} ${MONTH_NAMES_SHORT[lm]} ${fy}`;

  // ── Shared DayColumn props ────────────────────────────────────
  const sharedColumnProps = {
    highlightInstanceId,
    onPillClick,
    onDragStart: handleDragStart,
    onDragOver:  handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop:      handleDrop,
    onDayClick,
    isDragging,
    searchQuery,
    instanceLookup,
    readOnly,
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Nav bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <button onClick={onPrevWeek} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          ‹
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold text-slate-800 capitalize">{weekLabel}</h2>
          <p className="text-[10px] text-slate-400">
            Vista Semanal
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
          <button onClick={onNextWeek} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            ›
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
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

        {/* Weekend toggle hint */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
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

      {/* ── Week grid ── */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-600" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div
            className="flex h-full"
            style={{ minHeight: '100%' }}
          >
            {/* ── Mon–Fri columns (always visible, fill available space) ── */}
            {weekdayKeys.map(dayKey => (
              <div key={dayKey} className="flex-1 min-w-0">
                <DayColumn
                  dayKey={dayKey}
                  pills={calendarData[dayKey] ?? []}
                  isDropTarget={dropTarget === dayKey}
                  {...sharedColumnProps}
                />
              </div>
            ))}

            {/* ── Weekend: collapsed strip or expanded columns ── */}
            {weekendExpanded ? (
              <>
                {/* Sat */}
                <div className="flex-1 min-w-0">
                  <DayColumn
                    dayKey={satKey}
                    pills={calendarData[satKey] ?? []}
                    isDropTarget={dropTarget === satKey}
                    isWeekend
                    {...sharedColumnProps}
                  />
                </div>
                {/* Sun */}
                <div className="flex-1 min-w-0">
                  <DayColumn
                    dayKey={sunKey}
                    pills={calendarData[sunKey] ?? []}
                    isDropTarget={dropTarget === sunKey}
                    isWeekend
                    {...sharedColumnProps}
                  />
                </div>
                {/* Collapse strip */}
                <button
                  onClick={() => onWeekendToggle(false)}
                  title="Colapsar fin de semana"
                  className="w-6 shrink-0 flex flex-col items-center justify-center gap-1 border-l border-dashed border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors group"
                >
                  <ChevronRight
                    size={13}
                    className="text-slate-400 group-hover:text-slate-600 transition-colors"
                  />
                  <span
                    className="text-[8px] text-slate-300 group-hover:text-slate-500 transition-colors font-semibold tracking-wider uppercase"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  >
                    cerrar
                  </span>
                </button>
              </>
            ) : (
              <CollapsedWeekendColumn
                satKey={satKey}
                sunKey={sunKey}
                pillCount={weekendPillCount}
                onExpand={() => onWeekendToggle(true)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Internal pill reschedule modal ── */}
      <RescheduleModal
        pill={pendingReschedule?.pill ?? null}
        targetDate={pendingReschedule?.targetDate ?? null}
        onConfirmProportional={() => confirmReschedule(true)}
        onConfirmFixed={() => confirmReschedule(false)}
        onCancel={() => setPendingReschedule(null)}
        loading={actionLoading}
        error={actionError}
      />

      {/* ── External sidebar drop — lane selector ── */}
      <ExternalDropModal
        pending={pendingExternalDrop}
        onExternalDrop={onExternalDrop}
        onCancel={() => setPendingExternalDrop(null)}
      />
    </div>
  );
}
