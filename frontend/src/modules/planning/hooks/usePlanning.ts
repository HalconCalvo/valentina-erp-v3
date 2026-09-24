import { useState, useEffect, useCallback } from 'react';
import { planningService, CalendarFeed, HealthPanel, InstanceSchedule, CalendarPill } from '../../../api/planning-service';

// ============================================================
// SEMAPHORE HELPERS
// ============================================================

export const SEMAPHORE_CONFIG: Record<string, {
  label: string;
  dot: string;          // emoji
  bg: string;           // Tailwind bg class
  text: string;         // Tailwind text class
  border: string;       // Tailwind border class
  pillBg: string;
}> = {
  GRAY:        { label: 'Programado',        dot: '⬛', bg: 'bg-slate-100',   text: 'text-slate-500', border: 'border-slate-200', pillBg: 'bg-slate-200' },
  YELLOW:      { label: 'Alerta',            dot: '🟡', bg: 'bg-amber-50',    text: 'text-amber-700', border: 'border-amber-300', pillBg: 'bg-amber-100' },
  RED:         { label: 'Crítico',           dot: '🔴', bg: 'bg-red-50',      text: 'text-red-700',   border: 'border-red-300',   pillBg: 'bg-red-100'   },
  BLUE:        { label: 'En Proceso',        dot: '🔵', bg: 'bg-blue-50',     text: 'text-blue-700',  border: 'border-blue-300',  pillBg: 'bg-blue-100'  },
  BLUE_GREEN:  { label: 'Listo / Andén',     dot: '🔵', bg: 'bg-teal-50',     text: 'text-teal-700',  border: 'border-teal-300',  pillBg: 'bg-teal-100'  },
  DOUBLE_BLUE: { label: 'En Instalación',    dot: '🔵', bg: 'bg-indigo-50',   text: 'text-indigo-700',border: 'border-indigo-300',pillBg: 'bg-indigo-100'},
  GREEN:       { label: 'Instalado',         dot: '🟢', bg: 'bg-green-50',    text: 'text-green-700', border: 'border-green-300', pillBg: 'bg-green-100' },
  DOUBLE_GREEN:{ label: 'Cerrado',           dot: '🟢', bg: 'bg-emerald-50',  text: 'text-emerald-700',border:'border-emerald-300',pillBg:'bg-emerald-100'},
  WARRANTY:    { label: 'Garantía',          dot: '⚠️', bg: 'bg-orange-50',   text: 'text-orange-700',border: 'border-orange-300',pillBg: 'bg-orange-100'},
};

export function getSemaphoreConfig(semaphore: string) {
  return SEMAPHORE_CONFIG[semaphore] ?? SEMAPHORE_CONFIG['GRAY'];
}

// ============================================================
// INSTANCE LABEL FORMATTING
// ============================================================

/**
 * Builds the compact display label: "[Category] | [Alias]"
 *
 * Priority:
 *  - Both category + alias → "Cocina | Casa 23 Calle 41"
 *  - Only category         → "Cocina"
 *  - Only alias            → "Casa 23 Calle 41"
 *  - Neither               → productName fallback, or "—"
 */
export function formatInstanceLabel(
  category: string | null | undefined,
  alias: string,
  productName?: string | null,
): string {
  const cat  = category?.trim() || '';
  const name = alias?.trim()    || '';
  if (cat && name) return `${cat} | ${name}`;
  if (cat)         return cat;
  if (name)        return name;
  return productName?.trim() || '—';
}

// ============================================================
// FOCUS-MODE SEARCH MATCHING
// ============================================================

/**
 * Returns true if a CalendarPill matches the search query.
 * Checks custom_name, product_category and production_status directly
 * from the pill, then falls back to the richer InstanceSchedule fields
 * (folio, client, project, product) via the lookup map built from the
 * health panel.
 */
export function matchesPillQuery(
  pill: CalendarPill,
  query: string,
  lookup: Record<number, InstanceSchedule>
): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  if (pill.custom_name.toLowerCase().includes(q)) return true;
  if (pill.product_category?.toLowerCase().includes(q)) return true;
  if (pill.production_status?.toLowerCase().includes(q)) return true;
  if (pill.project_name?.toLowerCase().includes(q)) return true;
  if (pill.order_folio?.toLowerCase().includes(q)) return true;
  const inst = lookup[pill.instance_id];
  if (!inst) return false;
  return (
    (inst.order_folio?.toLowerCase().includes(q)       ?? false) ||
    (inst.client_name?.toLowerCase().includes(q)       ?? false) ||
    (inst.project_name?.toLowerCase().includes(q)      ?? false) ||
    (inst.product_name?.toLowerCase().includes(q)      ?? false) ||
    (inst.product_category?.toLowerCase().includes(q)  ?? false)
  );
}

export const LANE_COLORS: Record<string, string> = {
  PM: 'bg-violet-200 text-violet-800 border-violet-300',
  PP: 'bg-stone-200 text-stone-700 border-stone-300',
  IM: 'bg-sky-200 text-sky-800 border-sky-300',
  IP: 'bg-orange-200 text-orange-800 border-orange-300',
};

/** Texto visible en píldora: proyecto + sufijo de lote si venía en custom_name. */
export function formatPillDisplayLabel(
  pill: CalendarPill,
  projectName?: string | null,
): string {
  const custom = pill.custom_name?.trim() || '';
  const project = (projectName ?? pill.project_name)?.trim();
  if (!project) return custom || '—';
  const lotSuffix = custom.match(/\s(-\s*Lote\s.+)$/i);
  if (lotSuffix) return `${project}${lotSuffix[1]}`;
  return project;
}

// ============================================================
// SHARED SCHEDULING UTILITIES
// ============================================================

const PRODUCTION_LOCKED_STATUSES = new Set([
  'IN_PRODUCTION',
  'PACKING',
  'READY',
  'CARGADO',
  'INSTALLED',
  'CLOSED',
]);

/** Producción ya ocurrió o es reventa — no ofrecer PM/PP al soltar en calendario. */
export function isExternalDropProductionLocked(instance: InstanceSchedule): boolean {
  if (instance.is_resale === true) return true;
  return PRODUCTION_LOCKED_STATUSES.has(
    String(instance.production_status).toUpperCase(),
  );
}

/** IM (y IP si hay piedra) ya tienen fecha programada. */
export function isInstallationFullyScheduled(instance: InstanceSchedule): boolean {
  if (!instance.schedule.IM) return false;
  const hasStone = (instance.stone_pieces ?? 0) > 0;
  if (hasStone) return !!instance.schedule.IP;
  return true;
}

/** Regla 2: abrir InstanceEditModal sin ExternalDropModal. */
export function shouldSkipExternalDropModal(instance: InstanceSchedule): boolean {
  return (
    isExternalDropProductionLocked(instance) &&
    isInstallationFullyScheduled(instance)
  );
}

export type ExternalDropLaneCode = 'PM' | 'PP' | 'IM' | 'IP';

type InstallationLaneCode = 'IM' | 'IP';

const SCHEDULE_KEY_BY_LANE: Record<ExternalDropLaneCode, keyof InstanceSchedule['schedule']> = {
  PM: 'PM',
  PP: 'PP',
  IM: 'IM',
  IP: 'IP',
};

/** Carriles IM/IP según material y estado de producción. */
export function getInstallationScheduleLaneCodes(
  instance: InstanceSchedule,
): InstallationLaneCode[] {
  if (instance.is_resale === true) {
    return ['IM', 'IP'];
  }
  const pieces = instance.stone_pieces ?? 0;
  const prodLocked = isExternalDropProductionLocked(instance);

  if (prodLocked) {
    return pieces > 0 ? ['IP'] : ['IM'];
  }

  if (pieces === 0) {
    return ['IM'];
  }
  if (!instance.schedule.PM) {
    return ['IP'];
  }
  return ['IM', 'IP'];
}

function getInstallationDropLaneCodes(instance: InstanceSchedule): ExternalDropLaneCode[] {
  return getInstallationScheduleLaneCodes(instance);
}

/** Carriles visibles en ExternalDropModal según estado de la instancia. */
export function getExternalDropLaneCodes(instance: InstanceSchedule): ExternalDropLaneCode[] {
  if (instance.is_resale === true) {
    return ['IM', 'IP'];
  }
  const prodLocked = isExternalDropProductionLocked(instance);
  const codes: ExternalDropLaneCode[] = [];
  if (!prodLocked) {
    codes.push('PM');
    if ((instance.stone_pieces ?? 0) > 0) {
      codes.push('PP');
    }
  }
  codes.push(...getInstallationDropLaneCodes(instance));
  return codes;
}

/** Pre-carga la fecha del día en el carril elegido al soltar desde el sidebar. */
export function applyExternalDropSchedule(
  instance: InstanceSchedule,
  dayKey: string,
  lane: ExternalDropLaneCode,
): InstanceSchedule {
  const scheduleKey = SCHEDULE_KEY_BY_LANE[lane];
  return {
    ...instance,
    schedule: {
      ...instance.schedule,
      [scheduleKey]: `${dayKey}T09:00:00.000Z`,
    },
  };
}

/** Maps a CalendarPill lane code to the backend field name used in reschedule PATCH. */
export const LANE_FIELD_MAP: Record<string, string> = {
  PM: 'scheduled_prod_mdf',
  PP: 'scheduled_prod_stone',
  IM: 'scheduled_inst_mdf',
  IP: 'scheduled_inst_stone',
};

/** Zero-pads year/month/day into a YYYY-MM-DD calendar key. */
export function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Mínimo para `<input type="date">` (parte UTC de ISO). */
export function getScheduleTodayMinIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Hoy en calendario local (misma convención que las celdas del mes/semana). */
export function getLocalTodayDateKey(): string {
  const t = new Date();
  return formatDateKey(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

export function isScheduleDateBeforeToday(dayKey: string): boolean {
  return dayKey < getLocalTodayDateKey();
}

// ============================================================
// OPTIMISTIC LOCAL UPDATES (calendar + health)
// ============================================================

const SCHEDULE_LANES: { lane: CalendarPill['lane']; key: keyof InstanceSchedule['schedule'] }[] = [
  { lane: 'PM', key: 'PM' },
  { lane: 'PP', key: 'PP' },
  { lane: 'IM', key: 'IM' },
  { lane: 'IP', key: 'IP' },
];

function scheduleValueInMonth(value: string | null, year: number, month: number): boolean {
  if (!value) return false;
  const dayKey = value.slice(0, 10);
  const [y, m] = dayKey.split('-').map(Number);
  return y === year && m === month;
}

function eachDayKeyInRange(startIso: string, endIso: string | null | undefined): string[] {
  const startKey = startIso.slice(0, 10);
  const endKey = (endIso?.slice(0, 10) || startKey);
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const keys: string[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function buildCalendarPill(
  inst: InstanceSchedule,
  lane: CalendarPill['lane'],
  dayKey: string,
  range?: { is_range: boolean; range_start: string; range_end: string },
): CalendarPill {
  const datetime = `${dayKey}T09:00:00`;
  return {
    instance_id: inst.id,
    custom_name: inst.custom_name,
    product_category: inst.product_category,
    lane,
    lane_label: `${lane} ${inst.custom_name}`,
    datetime,
    semaphore: inst.semaphore,
    semaphore_label: inst.semaphore_label,
    production_status: inst.production_status,
    sales_order_item_id: inst.sales_order_item_id,
    is_warranty_reopened: inst.is_warranty_reopened,
    project_name: inst.project_name ?? null,
    order_folio: inst.order_folio ?? null,
    is_range: range?.is_range ?? false,
    range_start: range?.range_start ?? null,
    range_end: range?.range_end ?? null,
  };
}

/** Rebuild calendar pills for one instance within the visible month. */
export function applyInstanceToCalendarFeed(
  feed: CalendarFeed | null,
  updated: InstanceSchedule,
  year: number,
  month: number,
): CalendarFeed | null {
  if (!feed) return feed;

  const instance = normalizeInstanceFromApi(updated);
  const calendar: Record<string, CalendarPill[]> = {};
  for (const [dayKey, pills] of Object.entries(feed.calendar)) {
    const kept = pills.filter((p) => p.instance_id !== instance.id);
    if (kept.length > 0) calendar[dayKey] = kept;
  }

  for (const { lane, key } of SCHEDULE_LANES) {
    const raw = instance.schedule[key];
    if (!raw) continue;

    if (lane === 'IM' || lane === 'IP') {
      const endRaw =
        lane === 'IM'
          ? instance.scheduled_inst_mdf_end
          : instance.scheduled_inst_stone_end;
      const rangeStart = raw;
      const rangeEnd = endRaw ?? raw;
      const isRange = endRaw != null && endRaw.slice(0, 10) > raw.slice(0, 10);
      const rangeMeta = isRange
        ? { is_range: true, range_start: rangeStart, range_end: rangeEnd }
        : undefined;
      for (const dayKey of eachDayKeyInRange(raw, endRaw)) {
        if (!scheduleValueInMonth(`${dayKey}T09:00:00`, year, month)) continue;
        if (!calendar[dayKey]) calendar[dayKey] = [];
        calendar[dayKey].push(buildCalendarPill(instance, lane, dayKey, rangeMeta));
      }
      continue;
    }

    if (!scheduleValueInMonth(raw, year, month)) continue;
    const dayKey = raw.slice(0, 10);
    if (!calendar[dayKey]) calendar[dayKey] = [];
    calendar[dayKey].push(buildCalendarPill(instance, lane, dayKey));
  }

  const total_pills = Object.values(calendar).reduce((sum, arr) => sum + arr.length, 0);
  return { ...feed, calendar, total_pills };
}

type HealthListKey =
  | 'critical'
  | 'alerts'
  | 'planned'
  | 'in_process'
  | 'ready_to_install'
  | 'in_transit'
  | 'installed'
  | 'warranty';

const HEALTH_LIST_KEYS: HealthListKey[] = [
  'critical',
  'alerts',
  'planned',
  'in_process',
  'ready_to_install',
  'in_transit',
  'installed',
  'warranty',
];

const SEMAPHORE_TO_HEALTH_LIST: Partial<Record<string, HealthListKey>> = {
  RED: 'critical',
  YELLOW: 'alerts',
  GRAY: 'planned',
  BLUE: 'in_process',
  BLUE_GREEN: 'ready_to_install',
  DOUBLE_BLUE: 'in_transit',
  GREEN: 'installed',
  WARRANTY: 'warranty',
};

function coerceProductionStatus(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'value' in (value as object)) {
    return String((value as { value: string }).value);
  }
  return String(value);
}

function coerceSemaphoreFromApi(value: unknown): string {
  if (value == null || value === '') return 'GRAY';
  const s = typeof value === 'string' ? value : String(value);
  return s.trim().toUpperCase();
}

/**
 * Instancia devuelta por PATCH/GET de planeación — semáforo y fechas vienen del backend.
 * No recomputar semáforo en el cliente.
 */
export function normalizeInstanceFromApi(raw: InstanceSchedule): InstanceSchedule {
  return {
    ...raw,
    production_status: coerceProductionStatus(raw.production_status),
    semaphore: coerceSemaphoreFromApi(raw.semaphore),
    semaphore_label: raw.semaphore_label ?? '',
  };
}

function healthListKeyForInstance(instance: InstanceSchedule): HealthListKey | null {
  return SEMAPHORE_TO_HEALTH_LIST[instance.semaphore] ?? null;
}

function recomputeHealthCounts(panel: HealthPanel): Record<string, number> {
  return {
    RED: panel.critical.length,
    YELLOW: panel.alerts.length,
    GRAY: panel.planned.length,
    BLUE: panel.in_process.length,
    BLUE_GREEN: panel.ready_to_install.length,
    DOUBLE_BLUE: panel.in_transit.length,
    GREEN: panel.installed.length,
    WARRANTY: panel.warranty.length,
  };
}

function stripInstanceFromHealth(panel: HealthPanel, instanceId: number): HealthPanel {
  const next = { ...panel } as HealthPanel;
  for (const key of HEALTH_LIST_KEYS) {
    next[key] = panel[key].filter((i) => i.id !== instanceId);
  }
  return next;
}

/** Reubica una instancia en el panel de salud usando solo `semaphore` del backend. */
export function applyInstanceToHealthPanel(
  panel: HealthPanel | null,
  updated: InstanceSchedule,
): HealthPanel | null {
  if (!panel) return panel;

  const instance = normalizeInstanceFromApi(updated);
  let next = stripInstanceFromHealth(panel, instance.id);
  const isClosed = instance.production_status.toUpperCase() === 'CLOSED';
  const listKey = healthListKeyForInstance(instance);

  if (!isClosed && listKey) {
    next = {
      ...next,
      [listKey]: [...next[listKey], instance],
    };
  }

  return {
    ...next,
    counts: recomputeHealthCounts(next),
    timestamp: new Date().toISOString(),
  };
}

/** Emoji dots used across pill and day-view components. */
export const SEMAPHORE_DOTS: Record<string, string> = {
  GRAY:         '⬜',
  YELLOW:       '🟡',
  RED:          '🔴',
  BLUE:         '🔵',
  BLUE_GREEN:   '🔵🟢',
  DOUBLE_BLUE:  '🔵🔵',
  GREEN:        '🟢',
  DOUBLE_GREEN: '🟢🟢',
  WARRANTY:     '⚠️',
};

// ============================================================
// CALENDAR HOOK
// ============================================================

export function usePlanningCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<CalendarFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await planningService.getCalendar(y, m);
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al cargar el calendario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(year, month); }, [year, month, fetch]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const refresh = useCallback(() => fetch(year, month), [fetch, year, month]);

  const applyInstanceUpdate = useCallback(
    (updated: InstanceSchedule) => {
      setData((prev) => applyInstanceToCalendarFeed(prev, updated, year, month));
    },
    [year, month],
  );

  /** Navigate to the month that contains the given YYYY-MM-DD date string */
  const goToDate = useCallback((dateStr: string) => {
    const [y, m] = dateStr.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      setYear(y);
      setMonth(m);
    }
  }, []);

  return {
    year,
    month,
    data,
    loading,
    error,
    prevMonth,
    nextMonth,
    refresh,
    goToDate,
    applyInstanceUpdate,
  };
}

// ============================================================
// HEALTH PANEL HOOK
// ============================================================

export function useHealthPanel() {
  const [data, setData] = useState<HealthPanel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await planningService.getHealth();
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al cargar el panel de salud');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const applyInstanceUpdate = useCallback((updated: InstanceSchedule) => {
    setData((prev) => applyInstanceToHealthPanel(prev, updated));
  }, []);

  return { data, loading, error, refresh: fetch, applyInstanceUpdate };
}

// ============================================================
// INSTANCE ACTIONS HOOK
// ============================================================

export function useInstanceActions(onInstanceUpdated?: (updated: InstanceSchedule) => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSchedule = async (
    id: number,
    updates: Partial<{
      custom_name: string;
      scheduled_prod_mdf: string | null;
      scheduled_prod_stone: string | null;
      scheduled_inst_mdf: string | null;
      scheduled_inst_stone: string | null;
    }>
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await planningService.updateInstance(id, updates);
      onInstanceUpdated?.(normalizeInstanceFromApi(res.data));
      return true;
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al actualizar instancia');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const reschedule = async (
    id: number,
    field: string,
    newDate: string,
    proportional: boolean
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await planningService.reschedule(id, field, newDate, proportional);
      onInstanceUpdated?.(normalizeInstanceFromApi(res.data.instance));
      return res.data;
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al reprogramar');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const closeInstance = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await planningService.closeInstance(id);
      return res.data;
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al cerrar instancia');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const reopenWarranty = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await planningService.reopenWarranty(id);
      return res.data;
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al reabrir garantía');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, updateSchedule, reschedule, closeInstance, reopenWarranty };
}
