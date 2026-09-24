import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import PlanningCalendar from '../components/PlanningCalendar';
import WeekView from '../components/WeekView';
import DayView from '../components/DayView';
import HealthSidebar from '../components/HealthSidebar';
import InstanceEditModal from '../components/InstanceEditModal';
import {
  usePlanningCalendar,
  useHealthPanel,
  shouldSkipExternalDropModal,
  getExternalDropLaneCodes,
  applyExternalDropSchedule,
  normalizeInstanceFromApi,
} from '../hooks/usePlanning';
import { invalidatePlanningInstanceCache } from '../components/CalendarPillTooltip';
import { InstanceSchedule, CalendarPill, planningService } from '../../../api/planning-service';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';

type ViewMode = 'month' | 'week' | 'day';

const VIEW_TABS: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'month', label: 'Mes',    icon: '📅' },
  { key: 'week',  label: 'Semana', icon: '📆' },
  { key: 'day',   label: 'Día',    icon: '🗓️'  },
];

function getTodayKey(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/** Mapa fecha → carril para resaltado en mes, alineado con `InstanceSchedule.schedule` */
function highlightsFromInstance(instance: InstanceSchedule): Record<string, string> {
  const out: Record<string, string> = {};
  const { PM, PP, IM, IP } = instance.schedule;
  if (PM) out[PM.slice(0, 10)] = 'PM';
  if (PP) out[PP.slice(0, 10)] = 'PP';
  if (IM) out[IM.slice(0, 10)] = 'IM';
  if (IP) out[IP.slice(0, 10)] = 'IP';
  return out;
}

export default function PlanningPage() {
  const calendar = usePlanningCalendar();
  const health   = useHealthPanel();

  const userRole = (localStorage.getItem('user_role') || '').toUpperCase();

  const PLANNING_FULL_ACCESS = ['DIRECTOR', 'MANAGER', 'DESIGN'];
  const PLANNING_READ_ONLY = ['PRODUCTION', 'ADMIN', 'SALES'];
  const PLANNING_NO_ACCESS = ['LOGISTICS', 'WAREHOUSE'];

  const readOnly = PLANNING_READ_ONLY.includes(userRole);
  const noAccess = PLANNING_NO_ACCESS.includes(userRole);

  // ── Sidebar toggle (iPad) ────────────────────────────────────
  const [showSidebar, setShowSidebar] = useState(false);

  // ── View mode state ──────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKey());

  // ── Shared weekend visibility (synced across Month and Week views) ──
  const [weekendExpanded, setWeekendExpanded] = useState(false);

  // ── Focus-mode search query (shared across HealthSidebar + all calendar views) ──
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingUnscheduleId, setPendingUnscheduleId] = useState<number | null>(null);

  // ── Instance lookup map built from health panel data for rich pill matching ──
  const instanceLookup = useMemo<Record<number, InstanceSchedule>>(() => {
    if (!health.data) return {};
    const all = [
      ...health.data.critical,
      ...health.data.alerts,
      ...health.data.planned,
      ...health.data.in_process,
      ...health.data.ready_to_install,
      ...health.data.in_transit,
      ...health.data.installed,
      ...health.data.warranty,
    ];
    return Object.fromEntries(all.map(inst => [inst.id, inst]));
  }, [health.data]);

  // ── Sync calendar month/year when selectedDate changes ───────
  useEffect(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    if (y !== calendar.year || m !== calendar.month) {
      calendar.goToDate(selectedDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ── Highlight in calendar when sidebar card is clicked ───────
  const [highlightInstanceId, setHighlightInstanceId] = useState<number | null>(null);

  /** fechas YYYY-MM-DD → sigla de carril (resaltado en mes + InstanceEditModal) */
  const [highlightDays, setHighlightDays] = useState<Record<string, string>>(() => ({}));

  // ── Instance being edited in the modal ──────────────────────
  const [editingInstance, setEditingInstance] = useState<InstanceSchedule | null>(null);
  const [loadingInstance, setLoadingInstance] = useState(false);

  // ── Drag-from-sidebar state ──────────────────────────────────
  const [draggedInstance, setDraggedInstance] = useState<InstanceSchedule | null>(null);

  // Destructure stable refresh callbacks to prevent handleRefresh identity churn
  // (hook objects are new each render, but the individual callbacks are useCallback-stable)
  const calendarRefresh = calendar.refresh;
  const healthRefresh   = health.refresh;
  const calendarApplyUpdate = calendar.applyInstanceUpdate;
  const healthApplyUpdate   = health.applyInstanceUpdate;
  const handleRefresh = useCallback(async () => {
    await Promise.all([calendarRefresh(), healthRefresh()]);
  }, [calendarRefresh, healthRefresh]);

  const handleInstanceUpdated = useCallback(
    (updatedInstance: InstanceSchedule) => {
      const instance = normalizeInstanceFromApi(updatedInstance);
      invalidatePlanningInstanceCache(instance.id);
      calendarApplyUpdate(instance);
      healthApplyUpdate(instance);
    },
    [calendarApplyUpdate, healthApplyUpdate],
  );

  const skipHealthRefreshOnMount = useRef(true);
  useEffect(() => {
    if (skipHealthRefreshOnMount.current) {
      skipHealthRefreshOnMount.current = false;
      return;
    }
    void healthRefresh();
  }, [calendar.year, calendar.month, healthRefresh]);

  // Open edit modal from health sidebar card
  const handleHealthInstanceClick = (instance: InstanceSchedule) => {
    setHighlightInstanceId(prev => prev === instance.id ? null : instance.id);
    setEditingInstance(instance);
  };

  // Open edit modal from calendar pill click
  const handleCalendarPillClick = useCallback(async (pill: CalendarPill) => {
    setHighlightInstanceId(prev => prev === pill.instance_id ? null : pill.instance_id);

    // Use the pre-built lookup instead of rebuilding the combined array on every click
    const found = instanceLookup[pill.instance_id];

    if (found) {
      setEditingInstance(found);
    }

    setLoadingInstance(true);
    planningService.getInstance(pill.instance_id).then(res => {
      setEditingInstance(res.data);
    }).catch(() => {
      if (!found) {
        setEditingInstance(null);
        toast.error('No se pudo cargar la instancia. Intenta de nuevo.');
      }
    }).finally(() => {
      setLoadingInstance(false);
    });
  }, [instanceLookup]);

  // Click on a day number in Month view → jump to Day view
  const handleDayClick = useCallback((dayKey: string) => {
    setSelectedDate(dayKey);
    setViewMode('day');
  }, []);

  // Drag from sidebar
  const handleSidebarDragStart = useCallback((instance: InstanceSchedule) => {
    setDraggedInstance(instance);
  }, []);

  const handleSidebarDrop = useCallback((_dayKey: string, instance: InstanceSchedule) => {
    setDraggedInstance(null);
    const modified: InstanceSchedule = { ...instance };
    setEditingInstance(modified);
  }, []);

  const handleExternalDropAttempt = useCallback(
    (dayKey: string, instance: InstanceSchedule): boolean => {
      if (shouldSkipExternalDropModal(instance)) {
        setDraggedInstance(null);
        setEditingInstance({ ...instance });
        return true;
      }

      const lanes = getExternalDropLaneCodes(instance);
      if (lanes.length === 1) {
        const lane = lanes[0];
        setDraggedInstance(null);
        const updated = applyExternalDropSchedule(instance, dayKey, lane);
        setEditingInstance(updated);
        setHighlightDays({ [dayKey]: lane });
        return true;
      }

      return false;
    },
    [],
  );

  const handleModalSaved = useCallback(
    (updatedInstance: InstanceSchedule) => {
      const instance = normalizeInstanceFromApi(updatedInstance);
      handleInstanceUpdated(instance);
      setEditingInstance((prev) =>
        prev?.id === instance.id ? instance : prev,
      );
    },
    [handleInstanceUpdated],
  );

  const handleUnscheduleAll = useCallback(async () => {
    if (!editingInstance) return;
    const hasStone = (editingInstance.stone_pieces ?? 0) > 0;
    try {
      await planningService.updateInstance(editingInstance.id, {
        clear_prod_mdf: true,
        clear_inst_mdf: true,
        ...(hasStone
          ? { clear_prod_stone: true, clear_inst_stone: true }
          : {}),
      });
      setEditingInstance(null);
      setHighlightDays({});
      setHighlightInstanceId(null);
      await handleRefresh();
    } catch {
      toast.error('Error al desprogramar la instancia. Intenta de nuevo.');
    }
  }, [editingInstance, handleRefresh]);

  const executeUnscheduleFromDrop = async (id: number) => {
    const inst = instanceLookup[id];
    const hasStone = (inst?.stone_pieces ?? 0) > 0;
    try {
      const res = await planningService.updateInstance(id, {
        clear_prod_mdf: true,
        clear_inst_mdf: true,
        ...(hasStone
          ? { clear_prod_stone: true, clear_inst_stone: true }
          : {}),
      });
      handleInstanceUpdated(res.data);
    } catch {
      toast.error('Error al desprogramar.');
    } finally {
      setPendingUnscheduleId(null);
    }
  };

  // Inicializar resaltados del mes con las fechas ya guardadas en la instancia editada
  useEffect(() => {
    if (!editingInstance) return;
    setHighlightDays(highlightsFromInstance(editingInstance));
  }, [editingInstance?.id]);

  // ── Week navigation ──────────────────────────────────────────
  const handlePrevWeek = useCallback(() => setSelectedDate(d => addDays(d, -7)), []);
  const handleNextWeek = useCallback(() => setSelectedDate(d => addDays(d, 7)), []);

  // ── Day navigation ───────────────────────────────────────────
  const handlePrevDay = useCallback(() => setSelectedDate(d => addDays(d, -1)), []);
  const handleNextDay = useCallback(() => setSelectedDate(d => addDays(d, 1)), []);

  const calendarData = calendar.data?.calendar ?? {};
  const isLoading    = calendar.loading || loadingInstance;

  if (noAccess) {
    return (
      <div className="flex flex-col items-center justify-center 
                      h-full text-slate-400 gap-3">
        <span className="text-5xl">🔒</span>
        <p className="text-lg font-bold text-slate-600">
          Acceso Restringido
        </p>
        <p className="text-sm">
          No tienes permisos para ver la Planeación Estratégica.
        </p>
      </div>
    );
  }

  return (
    <div 
      className="flex h-[calc(100vh-3.5rem)] bg-white"
      style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
    >

      {/* ─── MAIN AREA (left, ~75%) ─── */}
      <div className="flex-1 min-w-[320px] flex flex-col overflow-hidden">

        {/* ── View Mode Tabs ── */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-slate-100 shrink-0">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key)}
              className={`
                flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg
                transition-all border-b-2 -mb-px
                ${viewMode === tab.key
                  ? 'border-slate-800 text-slate-800 bg-white'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'}
              `}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          {/* Toggle sidebar on iPad */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg mr-1"
          >
            {showSidebar ? 'Ocultar Panel' : '📋 Panel de Salud'}
          </button>
          {/* Month quick-jump info when in week/day view */}
          {viewMode !== 'month' && (
            <button
              onClick={() => setViewMode('month')}
              className="text-[10px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors mr-1 mb-0.5"
            >
              ← Ver mes completo
            </button>
          )}
        </div>

        {/* ── View Content ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {viewMode === 'month' && (
            <PlanningCalendar
              year={calendar.year}
              month={calendar.month}
              calendarData={calendarData}
              loading={isLoading}
              onPrevMonth={calendar.prevMonth}
              onNextMonth={calendar.nextMonth}
              onRefresh={handleRefresh}
              onInstanceUpdated={handleInstanceUpdated}
              highlightInstanceId={highlightInstanceId}
              highlightDays={{ ...highlightDays }}
              onPillClick={handleCalendarPillClick}
              externalDragInstance={readOnly ? null : draggedInstance}
              onExternalDrop={handleSidebarDrop}
              onExternalDropAttempt={handleExternalDropAttempt}
              onDayClick={handleDayClick}
              weekendExpanded={weekendExpanded}
              onWeekendToggle={setWeekendExpanded}
              searchQuery={searchQuery}
              instanceLookup={instanceLookup}
              readOnly={readOnly}
            />
          )}

          {viewMode === 'week' && (
            <WeekView
              calendarData={calendarData}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              loading={isLoading}
              onPrevWeek={handlePrevWeek}
              onNextWeek={handleNextWeek}
              onRefresh={handleRefresh}
              onInstanceUpdated={handleInstanceUpdated}
              highlightInstanceId={highlightInstanceId}
              onPillClick={handleCalendarPillClick}
              externalDragInstance={readOnly ? null : draggedInstance}
              onExternalDrop={handleSidebarDrop}
              onExternalDropAttempt={handleExternalDropAttempt}
              onDayClick={handleDayClick}
              weekendExpanded={weekendExpanded}
              onWeekendToggle={setWeekendExpanded}
              searchQuery={searchQuery}
              instanceLookup={instanceLookup}
              readOnly={readOnly}
            />
          )}

          {viewMode === 'day' && (
            <DayView
              calendarData={calendarData}
              selectedDate={selectedDate}
              loading={isLoading}
              onPrevDay={handlePrevDay}
              onNextDay={handleNextDay}
              onRefresh={handleRefresh}
              highlightInstanceId={highlightInstanceId}
              onPillClick={handleCalendarPillClick}
              searchQuery={searchQuery}
              instanceLookup={instanceLookup}
              readOnly={readOnly}
            />
          )}
        </div>
      </div>

      {/* ─── PANEL DE SALUD (right, fixed ~288px) ─── */}
      <div
        className={`
          shrink-0 overflow-y-auto
          lg:block lg:static lg:w-72
          ${showSidebar ? 'block' : 'hidden'}
          fixed top-14 right-0 bottom-0 w-80 z-40
          bg-white border-l border-slate-200 shadow-2xl
          lg:shadow-none lg:border-l lg:z-auto
        `}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const instanceId = e.dataTransfer.getData('pill_instance_id');
          if (!instanceId) return;
          const id = Number(instanceId);
          setPendingUnscheduleId(id);
        }}
      >
        <HealthSidebar
          data={health.data}
          loading={health.loading}
          onInstanceClick={handleHealthInstanceClick}
          onInstanceDragStart={readOnly ? undefined : handleSidebarDragStart}
          highlightId={highlightInstanceId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          readOnly={readOnly}
        />
      </div>

      {/* ─── MODAL DE EDICIÓN DE INSTANCIA ─── */}
      {editingInstance && (
        <InstanceEditModal
          instance={editingInstance}
          calendarData={calendarData}
          onClose={() => {
            setEditingInstance(null);
            setHighlightDays({});
            setHighlightInstanceId(null);
          }}
          onSaved={handleModalSaved}
          onUnscheduleAll={handleUnscheduleAll}
          readOnly={readOnly}
          onDateSelect={(dateStr, laneCode) =>
            setHighlightDays(prev => {
              const next = Object.fromEntries(
                Object.entries(prev).filter(([, v]) => v !== laneCode),
              );
              return { ...next, [dateStr]: laneCode };
            })
          }
        />
      )}

      {/* Overlay para cerrar sidebar en iPad */}
      {showSidebar && (
        <div 
          className="lg:hidden fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {pendingUnscheduleId !== null && (
        <VConfirmDialog
          isOpen={pendingUnscheduleId !== null}
          title="Desprogramar instancia"
          message="¿Desprogramar todos los procesos de esta instancia?"
          consequence="Se eliminarán PM, PP, IM e IP del calendario."
          variant="danger"
          confirmLabel="Sí, desprogramar"
          onConfirm={() => executeUnscheduleFromDrop(pendingUnscheduleId)}
          onCancel={() => setPendingUnscheduleId(null)}
        />
      )}
    </div>
  );
}
