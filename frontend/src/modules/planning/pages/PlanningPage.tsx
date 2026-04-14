import React, { useState } from 'react';
import PlanningCalendar from '../components/PlanningCalendar';
import HealthSidebar from '../components/HealthSidebar';
import { usePlanningCalendar, useHealthPanel } from '../hooks/usePlanning';
import { InstanceSchedule } from '../../../api/planning-service';
import { CalendarPill } from '../../../api/planning-service';

export default function PlanningPage() {
  const calendar = usePlanningCalendar();
  const health = useHealthPanel();

  // Instancia resaltada cuando el usuario hace clic en el panel de salud
  const [highlightInstanceId, setHighlightInstanceId] = useState<number | null>(null);

  const handleHealthInstanceClick = (instance: InstanceSchedule) => {
    setHighlightInstanceId(prev =>
      prev === instance.id ? null : instance.id
    );
  };

  const handleCalendarPillClick = (pill: CalendarPill) => {
    setHighlightInstanceId(prev =>
      prev === pill.instance_id ? null : pill.instance_id
    );
  };

  const handleRefresh = () => {
    calendar.refresh();
    health.refresh();
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white overflow-hidden">
      {/* ─── CALENDARIO MAESTRO (izquierda, ~75%) ─── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <PlanningCalendar
          year={calendar.year}
          month={calendar.month}
          calendarData={calendar.data?.calendar ?? {}}
          loading={calendar.loading}
          onPrevMonth={calendar.prevMonth}
          onNextMonth={calendar.nextMonth}
          onRefresh={handleRefresh}
          highlightInstanceId={highlightInstanceId}
          onPillClick={handleCalendarPillClick}
        />
      </div>

      {/* ─── PANEL DE SALUD (derecha, fijo ~280px) ─── */}
      <div className="w-72 shrink-0 overflow-hidden">
        <HealthSidebar
          data={health.data}
          loading={health.loading}
          onInstanceClick={handleHealthInstanceClick}
        />
      </div>
    </div>
  );
}
