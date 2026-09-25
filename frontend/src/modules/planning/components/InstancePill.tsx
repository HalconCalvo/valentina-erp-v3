import { CalendarPill } from '../../../api/planning-service';
import {
  LANE_COLORS,
  formatPillDisplayLabel,
  getSemaphoreConfig,
  isPlanningPillProductionLocked,
} from '../hooks/usePlanning';
import CalendarPillTooltip from './CalendarPillTooltip';

interface Props {
  pill: CalendarPill;
  projectName?: string | null;
  onClick?: (pill: CalendarPill) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, pill: CalendarPill) => void;
}


export default function InstancePill({ pill, projectName, onClick, draggable, onDragStart }: Props) {
  const laneClass = LANE_COLORS[pill.lane] ?? 'bg-gray-200 text-gray-700 border-gray-300';
  const label = formatPillDisplayLabel(pill, projectName ?? pill.project_name);
  const productionLocked = isPlanningPillProductionLocked(pill);
  const laneLabel = productionLocked ? `✓ ${pill.lane}` : pill.lane;
  const semCfg = getSemaphoreConfig(pill.semaphore);
  const grayWarningStyle =
    pill.semaphore === 'GRAY_WARNING'
      ? `ring-2 ${semCfg.border} ${semCfg.bg} shadow-sm`
      : '';

  return (
    <CalendarPillTooltip pill={pill}>
      <div
        draggable={draggable}
        onDragStart={onDragStart ? (e) => onDragStart(e, pill) : undefined}
        onClick={() => onClick?.(pill)}
        className={`
        flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium
        cursor-pointer select-none min-w-0 overflow-hidden
        ${laneClass}
        hover:opacity-80 transition-opacity
        ${draggable ? 'cursor-grab active:cursor-grabbing' : productionLocked ? 'cursor-default' : ''}
        ${pill.is_warranty_reopened ? 'ring-1 ring-orange-400' : ''}
        ${grayWarningStyle}
      `}
      >
        {semCfg.icon && (
          <span className="shrink-0 text-amber-600 leading-none" aria-hidden>{semCfg.icon}</span>
        )}
        <span className="shrink-0 font-bold">{laneLabel}</span>
        <span className="shrink-0 opacity-40">|</span>
        <span className="flex-1 min-w-0 truncate">{label}</span>
      </div>
    </CalendarPillTooltip>
  );
}
