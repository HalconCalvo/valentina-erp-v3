import { useState, useEffect, useCallback } from 'react';
import { planningService, CalendarFeed, HealthPanel, InstanceSchedule } from '../../../api/planning-service';

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

export const LANE_COLORS: Record<string, string> = {
  PM: 'bg-violet-200 text-violet-800 border-violet-300',
  PP: 'bg-stone-200 text-stone-700 border-stone-300',
  IM: 'bg-sky-200 text-sky-800 border-sky-300',
  IP: 'bg-cyan-200 text-cyan-800 border-cyan-300',
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

  return { year, month, data, loading, error, prevMonth, nextMonth, refresh };
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
