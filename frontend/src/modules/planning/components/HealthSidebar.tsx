import { useState } from 'react';
import { HealthPanel, InstanceSchedule } from '../../../api/planning-service';
import { getSemaphoreConfig } from '../hooks/usePlanning';

interface Props {
  data: HealthPanel | null;
  loading: boolean;
  onInstanceClick?: (instance: InstanceSchedule) => void;
  onInstanceDragStart?: (instance: InstanceSchedule) => void;
  highlightId?: number | null;
}

type Tab = 'RED' | 'YELLOW' | 'GRAY' | 'WARRANTY' | 'BLUE' | 'ALL';

interface TabConfig {
  key: Tab;
  icon: string;
  label: string;
  dataKey: (data: HealthPanel) => InstanceSchedule[];
  countKey: string;
  dotClass: string;
}

const TABS: TabConfig[] = [
  {
    key: 'RED',
    icon: '🔴',
    label: 'Críticos',
    dataKey: d => d.critical,
    countKey: 'RED',
    dotClass: 'bg-red-500',
  },
  {
    key: 'YELLOW',
    icon: '🟡',
    label: 'Alertas',
    dataKey: d => d.alerts,
    countKey: 'YELLOW',
    dotClass: 'bg-amber-400',
  },
  {
    key: 'GRAY',
    icon: '⬜',
    label: 'Planeación',
    dataKey: d => d.planned,
    countKey: 'GRAY',
    dotClass: 'bg-slate-300',
  },
  {
    key: 'WARRANTY',
    icon: '⚠️',
    label: 'Garantías',
    dataKey: d => d.warranty,
    countKey: 'WARRANTY',
    dotClass: 'bg-orange-400',
  },
  {
    key: 'BLUE',
    icon: '🔵',
    label: 'Activas',
    dataKey: d => [...d.in_process, ...d.ready_to_install, ...d.in_transit, ...d.installed],
    countKey: '_ACTIVE',
    dotClass: 'bg-blue-500',
  },
];

const LANE_LABELS: Record<string, string> = {
  PM: 'P.MDF',
  PP: 'P.Piedra',
  IM: 'I.MDF',
  IP: 'I.Piedra',
};

function InstanceCard({
  instance,
  onClick,
  onDragStart,
  isHighlighted,
}: {
  instance: InstanceSchedule;
  onClick?: (inst: InstanceSchedule) => void;
  onDragStart?: (inst: InstanceSchedule) => void;
  isHighlighted: boolean;
}) {
  const cfg = getSemaphoreConfig(instance.semaphore);
  const schedEntries = Object.entries(instance.schedule).filter(([, v]) => v !== null) as [string, string][];

  return (
    <div
      draggable
      onDragStart={() => onDragStart?.(instance)}
      onClick={() => onClick?.(instance)}
      title="Clic para editar · Arrastrar al calendario para asignar fecha"
      className={`
        w-full text-left p-3 rounded-xl border cursor-pointer transition-all select-none
        hover:shadow-sm active:scale-95
        ${isHighlighted
          ? 'border-indigo-400 ring-2 ring-indigo-200 shadow-md'
          : `${cfg.border} ${cfg.bg} hover:border-slate-300`
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs font-semibold truncate ${cfg.text}`}>
            {instance.is_warranty_reopened && <span className="mr-1">⚠️</span>}
            {instance.custom_name}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{cfg.label}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-base leading-none">{cfg.dot}</span>
          {/* Drag handle hint */}
          <span className="text-[9px] text-slate-300">⠿ arrastrar</span>
        </div>
      </div>

      {/* Scheduled dates chips */}
      {schedEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {schedEntries.map(([lane, dt]) => (
            <span
              key={lane}
              className="inline-flex items-center gap-0.5 text-[9px] bg-white/70 border border-slate-200 rounded-full px-1.5 py-0.5 text-slate-600"
            >
              <span className="font-bold">{LANE_LABELS[lane] ?? lane}</span>
              {' '}
              {new Date(dt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
            </span>
          ))}
        </div>
      )}

      {instance.delivery_deadline && (
        <p className="text-[10px] text-slate-400 mt-1.5">
          Límite:{' '}
          <span className="font-medium">
            {new Date(instance.delivery_deadline).toLocaleDateString('es-MX', {
              day: 'numeric', month: 'short',
            })}
          </span>
        </p>
      )}
    </div>
  );
}

export default function HealthSidebar({ data, loading, onInstanceClick, onInstanceDragStart, highlightId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('RED');

  // Compute active instances count for the BLUE "Activas" pseudo-tab
  const activeCount = data
    ? (data.counts['BLUE'] ?? 0) +
      (data.counts['BLUE_GREEN'] ?? 0) +
      (data.counts['DOUBLE_BLUE'] ?? 0) +
      (data.counts['GREEN'] ?? 0)
    : 0;

  const getCount = (tab: TabConfig): number => {
    if (!data) return 0;
    if (tab.key === 'BLUE') return activeCount;
    return data.counts[tab.countKey] ?? 0;
  };

  const getInstances = (): InstanceSchedule[] => {
    if (!data) return [];
    const tab = TABS.find(t => t.key === activeTab);
    return tab ? tab.dataKey(data) : [];
  };

  const instances = getInstances();

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-100">

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">Panel de Salud</h2>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Haz clic para editar · Arrastra al calendario para programar
        </p>
      </div>

      {/* ── Semaphore Filter Tabs ── */}
      <div className="flex border-b border-slate-100 shrink-0">
        {TABS.map(tab => {
          const count = getCount(tab);
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex-1 min-w-0 py-2 px-0.5 flex flex-col items-center gap-0.5 transition-all
                ${isActive
                  ? 'border-b-2 border-slate-800 text-slate-800'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}
              `}
            >
              {/* Colored circle button */}
              <div className="relative">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all
                  ${isActive ? `${tab.dotClass} border-transparent shadow-md` : 'bg-slate-100 border-slate-200'}
                `}>
                  <span className="text-sm leading-none">{tab.icon}</span>
                </div>
                {count > 0 && (
                  <span className={`
                    absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold
                    flex items-center justify-center text-white
                    ${tab.key === 'RED' ? 'bg-red-500' :
                      tab.key === 'YELLOW' ? 'bg-amber-400' :
                      tab.key === 'WARRANTY' ? 'bg-orange-500' :
                      tab.key === 'BLUE' ? 'bg-blue-500' :
                      'bg-slate-400'}
                  `}>
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium truncate w-full text-center px-0.5">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Instance list ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-700" />
          </div>
        )}

        {!loading && instances.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <span className="text-3xl mb-2">
              {activeTab === 'RED' ? '🟢' :
               activeTab === 'YELLOW' ? '✅' :
               activeTab === 'WARRANTY' ? '🛡️' : '📋'}
            </span>
            <p className="text-xs text-center leading-relaxed">
              {activeTab === 'RED'      ? 'Sin instancias críticas. ¡Todo en orden!' :
               activeTab === 'YELLOW'   ? 'Sin alertas próximas.' :
               activeTab === 'WARRANTY' ? 'Sin garantías activas.' :
               activeTab === 'BLUE'     ? 'Sin instancias en proceso.' :
               'Sin instancias en planeación.'}
            </p>
          </div>
        )}

        {!loading && instances.map(inst => (
          <InstanceCard
            key={inst.id}
            instance={inst}
            onClick={onInstanceClick}
            onDragStart={onInstanceDragStart}
            isHighlighted={highlightId === inst.id}
          />
        ))}
      </div>

      {/* ── Footer stats ── */}
      {data && (
        <div className="px-3 py-3 border-t border-slate-100 grid grid-cols-3 gap-2">
          {[
            { label: 'Críticos', count: data.counts['RED'] ?? 0,   bg: 'bg-red-50',   text: 'text-red-700'   },
            { label: 'En Proc.',  count: activeCount,               bg: 'bg-blue-50',  text: 'text-blue-700'  },
            { label: 'Alertas',  count: data.counts['YELLOW'] ?? 0, bg: 'bg-amber-50', text: 'text-amber-700' },
          ].map(item => (
            <div key={item.label} className={`${item.bg} rounded-xl p-2 text-center`}>
              <div className={`text-base font-black ${item.text}`}>{item.count}</div>
              <div className="text-[9px] text-slate-400">{item.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
