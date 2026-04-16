import { CalendarPill } from '../../../api/planning-service';
import { LANE_COLORS, SEMAPHORE_DOTS, formatInstanceLabel } from '../hooks/usePlanning';

interface Props {
  pill: CalendarPill;
  onClick?: (pill: CalendarPill) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, pill: CalendarPill) => void;
}


export default function InstancePill({ pill, onClick, draggable, onDragStart }: Props) {
  const laneClass = LANE_COLORS[pill.lane] ?? 'bg-gray-200 text-gray-700 border-gray-300';
  const dot = SEMAPHORE_DOTS[pill.semaphore] ?? '⬜';
  const label = formatInstanceLabel(pill.product_category, pill.custom_name);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart ? (e) => onDragStart(e, pill) : undefined}
      onClick={() => onClick?.(pill)}
      title={`${label} — ${pill.lane_label} — ${pill.semaphore_label}`}
      className={`
        flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium
        cursor-pointer select-none min-w-0 overflow-hidden
        ${laneClass}
        hover:opacity-80 transition-opacity
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
        ${pill.is_warranty_reopened ? 'ring-1 ring-orange-400' : ''}
      `}
    >
      <span className="shrink-0 font-bold">{pill.lane}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span className="shrink-0 leading-none">{dot}</span>
    </div>
  );
}
