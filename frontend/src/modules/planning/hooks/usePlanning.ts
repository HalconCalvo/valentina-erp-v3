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
  IP: 'bg-cyan-200 text-cyan-800 border-cyan-300',
};

// ============================================================
// SHARED SCHEDULING UTILITIES
// ============================================================

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

  const refresh = () => fetch(year, month);

  /** Navigate to the month that contains the given YYYY-MM-DD date string */
  const goToDate = useCallback((dateStr: string) => {
    const [y, m] = dateStr.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      setYear(y);
      setMonth(m);
    }
  }, []);

  return { year, month, data, loading, error, prevMonth, nextMonth, refresh, goToDate };
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

  return { data, loading, error, refresh: fetch };
}

// ============================================================
// INSTANCE ACTIONS HOOK
// ============================================================

export function useInstanceActions(onSuccess?: () => void) {
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
      await planningService.updateInstance(id, updates);
      onSuccess?.();
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
      onSuccess?.();
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
      onSuccess?.();
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
      onSuccess?.();
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
