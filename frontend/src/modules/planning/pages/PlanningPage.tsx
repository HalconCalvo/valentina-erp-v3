import { useState, useCallback } from 'react';
import PlanningCalendar from '../components/PlanningCalendar';
import HealthSidebar from '../components/HealthSidebar';
import InstanceEditModal from '../components/InstanceEditModal';
import { usePlanningCalendar, useHealthPanel } from '../hooks/usePlanning';
import { InstanceSchedule, CalendarPill, planningService } from '../../../api/planning-service';

export default function PlanningPage() {
  const calendar = usePlanningCalendar();
  const health   = useHealthPanel();

  // ── Highlight in calendar when sidebar card is clicked ──────────────
  const [highlightInstanceId, setHighlightInstanceId] = useState<number | null>(null);

  // ── Instance being edited in the modal ──────────────────────────────
  const [editingInstance, setEditingInstance] = useState<InstanceSchedule | null>(null);
  const [loadingInstance, setLoadingInstance] = useState(false);

  // ── Drag-from-sidebar state ─────────────────────────────────────────
  const [draggedInstance, setDraggedInstance] = useState<InstanceSchedule | null>(null);

  const handleRefresh = useCallback(() => {
    calendar.refresh();
    health.refresh();
  }, [calendar, health]);

  // Open edit modal from health sidebar card
  const handleHealthInstanceClick = (instance: InstanceSchedule) => {
    setHighlightInstanceId(prev => prev === instance.id ? null : instance.id);
    setEditingInstance(instance);
  };

  // Open edit modal from calendar pill click
  // Pill only has instance_id; we find the full object in health data or fetch it
  const handleCalendarPillClick = useCallback(async (pill: CalendarPill) => {
    setHighlightInstanceId(prev => prev === pill.instance_id ? null : pill.instance_id);

    // Try to find in already-loaded health data
    const healthData = health.data;
    let found: InstanceSchedule | undefined;
    if (healthData) {
      const all = [
        ...healthData.critical,
        ...healthData.alerts,
        ...healthData.planned,
        ...healthData.in_process,
        ...healthData.ready_to_install,
        ...healthData.in_transit,
        ...healthData.installed,
        ...healthData.warranty,
      ];
      found = all.find(inst => inst.id === pill.instance_id);
    }

    if (found) {
      setEditingInstance(found);
      return;
    }

    // Not in health panel — build minimal InstanceSchedule from pill data
    setEditingInstance({
      id: pill.instance_id,
      custom_name: pill.custom_name,
      product_name: null,
      order_folio: null,
      client_name: null,
      project_name: null,
      production_status: pill.production_status,
      semaphore: pill.semaphore,
      semaphore_label: pill.semaphore_label,
      schedule: { PM: null, PP: null, IM: null, IP: null },
      sales_order_item_id: pill.sales_order_item_id,
      delivery_deadline: null,
      signed_received_at: null,
      warranty_started_at: null,
      is_warranty_reopened: pill.is_warranty_reopened,
      warranty_reopened_at: null,
      original_signed_at: null,
      is_cancelled: false,
    });
    // Kick off background fetch to get schedule dates
    setLoadingInstance(true);
    planningService.updateInstance(pill.instance_id, {}).then(res => {
      setEditingInstance(res.data);
    }).catch(() => {
      // fallback already set above — keep minimal
    }).finally(() => {
      setLoadingInstance(false);
    });
  }, [health.data]);

  // Drag from sidebar: start
  const handleSidebarDragStart = useCallback((instance: InstanceSchedule) => {
    setDraggedInstance(instance);
  }, []);

  // Drag from sidebar: dropped on calendar day
  const handleSidebarDrop = useCallback((dayKey: string, instance: InstanceSchedule) => {
    setDraggedInstance(null);
    // Open edit modal pre-filled so user can pick which lane to assign the date
    // We rebuild schedule with the dropped date pre-filled (user can adjust lanes)
    const iso = dayKey + 'T09:00:00.000Z';
    const modified: InstanceSchedule = {
      ...instance,
      schedule: {
        PM: instance.schedule.PM ?? iso,
        PP: instance.schedule.PP,
        IM: instance.schedule.IM,
        IP: instance.schedule.IP,
      },
    };
    setEditingInstance(modified);
  }, []);

  const handleModalSaved = () => {
    handleRefresh();
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white overflow-hidden">

      {/* ─── CALENDARIO MAESTRO (izquierda, ~75%) ─── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <PlanningCalendar
          year={calendar.year}
          month={calendar.month}
          calendarData={calendar.data?.calendar ?? {}}
          loading={calendar.loading || loadingInstance}
          onPrevMonth={calendar.prevMonth}
          onNextMonth={calendar.nextMonth}
          onRefresh={handleRefresh}
          highlightInstanceId={highlightInstanceId}
          onPillClick={handleCalendarPillClick}
          externalDragInstance={draggedInstance}
          onExternalDrop={handleSidebarDrop}
        />
      </div>

      {/* ─── PANEL DE SALUD (derecha, fijo ~288px) ─── */}
      <div className="w-72 shrink-0 overflow-hidden">
        <HealthSidebar
          data={health.data}
          loading={health.loading}
          onInstanceClick={handleHealthInstanceClick}
          onInstanceDragStart={handleSidebarDragStart}
          highlightId={highlightInstanceId}
        />
      </div>

      {/* ─── MODAL DE EDICIÓN DE INSTANCIA ─── */}
      {editingInstance && (
        <InstanceEditModal
          instance={editingInstance}
          onClose={() => setEditingInstance(null)}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  );
}
