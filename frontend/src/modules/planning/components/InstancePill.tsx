import React from 'react';
import { CalendarPill } from '../../../api/planning-service';
import { getSemaphoreConfig, LANE_COLORS } from '../hooks/usePlanning';

interface Props {
  pill: CalendarPill;
  onClick?: (pill: CalendarPill) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, pill: CalendarPill) => void;
}

const SEMAPHORE_DOTS: Record<string, string> = {
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

export default function InstancePill({ pill, onClick, draggable, onDragStart }: Props) {
  const laneClass = LANE_COLORS[pill.lane] ?? 'bg-gray-200 text-gray-700 border-gray-300';
  const dot = SEMAPHORE_DOTS[pill.semaphore] ?? '⬜';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, pill) : undefined}
      onClick={() => onClick?.(pill)}
      title={`${pill.lane_label} — ${pill.semaphore_label}`}
      className={`
        flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium
        cursor-pointer select-none truncate max-w-full
        ${laneClass}
        hover:opacity-80 transition-opacity
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
        ${pill.is_warranty_reopened ? 'ring-1 ring-orange-400' : ''}
      `}
    >
      <span className="shrink-0 font-bold">{pill.lane}</span>
      <span className="truncate">{pill.custom_name}</span>
      <span className="shrink-0 leading-none">{dot}</span>
    </div>
  );
}
