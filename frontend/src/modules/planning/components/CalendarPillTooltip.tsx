import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarPill,
  InstanceSchedule,
  InstanceInstallationAssignment,
  planningService,
} from '../../../api/planning-service';
import { getSemaphoreConfig } from '../hooks/usePlanning';

const HOVER_DELAY_MS = 400;
const TOOLTIP_WIDTH = 288;
const TOOLTIP_EST_HEIGHT = 260;

const PRODUCTION_COMPLETE_STATUSES = new Set([
  'IN_PRODUCTION',
  'PACKING',
  'READY',
  'CARGADO',
  'INSTALLED',
  'CLOSED',
]);

type TooltipCacheEntry = {
  instance: InstanceSchedule;
  assignments: InstanceInstallationAssignment[];
};

const instanceCache = new Map<number, TooltipCacheEntry>();
let installerNameById: Map<number, string> | null = null;

/** Tras update optimista, evitar semáforo/fechas obsoletos en tooltip. */
export function invalidatePlanningInstanceCache(instanceId: number): void {
  instanceCache.delete(instanceId);
}

async function ensureInstallerNames(): Promise<Map<number, string>> {
  if (installerNameById) return installerNameById;
  const res = await planningService.getInstallers();
  const rows = Array.isArray(res.data) ? res.data : [];
  installerNameById = new Map(
    rows.map((u: { id: number; full_name: string }) => [u.id, u.full_name]),
  );
  return installerNameById;
}

async function loadTooltipData(instanceId: number): Promise<TooltipCacheEntry> {
  const cached = instanceCache.get(instanceId);
  if (cached) return cached;

  const [instRes, assignments] = await Promise.all([
    planningService.getInstance(instanceId),
    planningService.getInstanceAssignments(instanceId),
    ensureInstallerNames(),
  ]);

  const entry: TooltipCacheEntry = {
    instance: instRes.data,
    assignments,
  };
  instanceCache.set(instanceId, entry);
  return entry;
}

function formatLaneDate(iso: string): string {
  const d = new Date(iso);
  const weekdayRaw = d.toLocaleDateString('es-MX', { weekday: 'long' });
  const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);
  const day = d.getDate();
  const month = d
    .toLocaleDateString('es-MX', { month: 'short' })
    .replace(/\./g, '')
    .trim();
  const year = d.getFullYear();
  return `${weekday} ${day}/${month}/${year}`;
}

function formatShortDayMonth(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso.slice(0, 10)}T12:00:00`);
  const day = d.getDate();
  const month = d
    .toLocaleDateString('es-MX', { month: 'short' })
    .replace(/\./g, '')
    .trim();
  return `${day}/${month}`;
}

function formatInstallationScheduleLabel(
  code: string,
  start: string | null,
  end: string | null | undefined,
  pill?: CalendarPill,
): string | null {
  if (!start) return null;
  if (
    pill?.is_range &&
    pill.lane === code &&
    pill.range_start &&
    pill.range_end
  ) {
    return `Del ${formatShortDayMonth(pill.range_start)} al ${formatShortDayMonth(pill.range_end)}`;
  }
  if (end && end.slice(0, 10) > start.slice(0, 10)) {
    return `Del ${formatShortDayMonth(start)} al ${formatShortDayMonth(end)}`;
  }
  return formatLaneDate(start);
}

function formatTeamLine(
  assignments: InstanceInstallationAssignment[],
  lane: 'IM' | 'IP',
  names: Map<number, string>,
): string | null {
  const row = assignments.find(a => a.lane === lane);
  if (!row) return null;
  const ids = [row.leader_user_id, row.helper_1_user_id, row.helper_2_user_id].filter(
    (id): id is number => id != null,
  );
  if (ids.length === 0) return null;
  return ids.map(id => names.get(id) ?? `Usuario #${id}`).join(' + ');
}

function buildStatusLine(instance: InstanceSchedule): string {
  const prodComplete = PRODUCTION_COMPLETE_STATUSES.has(
    String(instance.production_status).toUpperCase(),
  );
  const im = instance.schedule.IM;

  let prodPart = '';
  if (instance.is_resale !== true) {
    if (prodComplete) prodPart = 'Prod: ✓';
    else if (instance.schedule.PM) prodPart = 'Prod: programado';
    else prodPart = 'Prod: sin programar';
  }

  const instPart = im ? 'Inst: programado' : 'Inst: por programar';

  if (instance.is_resale === true) {
    return `Estado: ${instPart}`;
  }
  return `Estado: ${prodPart} | ${instPart}`;
}

function TooltipSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-100 rounded w-1/2" />
      <div className="h-3 bg-slate-100 rounded w-2/3" />
      <div className="h-3 bg-slate-100 rounded w-full" />
      <div className="h-3 bg-slate-100 rounded w-5/6" />
    </div>
  );
}

function TooltipBody({
  pill,
  data,
}: {
  pill: CalendarPill;
  data: TooltipCacheEntry;
}) {
  const inst = data.instance;
  const cfg = getSemaphoreConfig(inst.semaphore ?? pill.semaphore);
  const names = installerNameById ?? new Map<number, string>();

  const laneRows: { code: string; iso: string | null; endIso: string | null }[] = [
    { code: 'PM', iso: inst.schedule.PM, endIso: null },
    { code: 'PP', iso: inst.schedule.PP, endIso: null },
    { code: 'IM', iso: inst.schedule.IM, endIso: inst.scheduled_inst_mdf_end },
    { code: 'IP', iso: inst.schedule.IP, endIso: inst.scheduled_inst_stone_end },
  ].filter(row => row.iso);

  const imTeam = formatTeamLine(data.assignments, 'IM', names);
  const ipTeam = formatTeamLine(data.assignments, 'IP', names);

  const ovLine = [inst.order_folio, inst.project_name].filter(Boolean).join(' — ');

  return (
    <div className="space-y-2 text-left">
      <p className="text-sm font-bold text-slate-800 leading-snug break-words">
        {inst.custom_name || pill.custom_name}
      </p>

      {ovLine && (
        <p className="text-xs text-slate-500">{ovLine}</p>
      )}

      <p className={`text-xs font-medium flex items-center gap-1.5 ${cfg.text}`}>
        <span className="text-sm leading-none">{cfg.dot}</span>
        {inst.semaphore_label || pill.semaphore_label}
      </p>

      {laneRows.length > 0 && (
        <div className="text-xs text-slate-600 space-y-0.5">
          {laneRows.map(row => (
            <p key={row.code}>
              <span className="font-bold text-slate-700">{row.code}:</span>{' '}
              {formatInstallationScheduleLabel(
                row.code,
                row.iso,
                row.endIso,
                pill,
              )}
            </p>
          ))}
        </div>
      )}

      {imTeam && (
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Equipo IM:</span> {imTeam}
        </p>
      )}
      {ipTeam && (
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Equipo IP:</span> {ipTeam}
        </p>
      )}

      <p className="text-xs text-slate-500 pt-0.5 border-t border-slate-100">
        {buildStatusLine(inst)}
      </p>
    </div>
  );
}

interface Props {
  pill: CalendarPill;
  children: ReactNode;
}

export default function CalendarPillTooltip({ pill, children }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TooltipCacheEntry | null>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceAbove = rect.top;
    const placement =
      spaceAbove >= TOOLTIP_EST_HEIGHT + 12 ? 'top' : 'bottom';
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2),
      window.innerWidth - TOOLTIP_WIDTH - 8,
    );
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;
    setCoords({ top, left, placement });
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearTimer();
    timerRef.current = setTimeout(async () => {
      setOpen(true);
      updatePosition();

      const cached = instanceCache.get(pill.instance_id);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      setData(null);
      try {
        const entry = await loadTooltipData(pill.instance_id);
        setData(entry);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }, HOVER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    clearTimer();
    setOpen(false);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearTimer(), []);

  const popover =
    open && coords
      ? createPortal(
          <div
            className="fixed z-[200] pointer-events-none"
            style={{
              top: coords.top,
              left: coords.left,
              width: TOOLTIP_WIDTH,
              transform:
                coords.placement === 'top' ? 'translateY(-100%)' : undefined,
            }}
            role="tooltip"
          >
            <div className="rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-3">
              {loading && !data ? (
                <TooltipSkeleton />
              ) : data ? (
                <TooltipBody pill={pill} data={data} />
              ) : (
                <p className="text-xs text-slate-500">No se pudo cargar el detalle.</p>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={anchorRef}
      className="min-w-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {popover}
    </div>
  );
}
