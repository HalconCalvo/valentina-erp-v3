import React, { useState } from 'react';
import { HealthPanel, InstanceSchedule } from '../../../api/planning-service';
import { getSemaphoreConfig } from '../hooks/usePlanning';

interface Props {
  data: HealthPanel | null;
  loading: boolean;
  onInstanceClick?: (instance: InstanceSchedule) => void;
}

type Tab = 'critical' | 'alerts' | 'planned' | 'warranty';

const TABS: { key: Tab; label: string; icon: string; dataKey: keyof HealthPanel }[] = [
  { key: 'critical', label: 'Críticos',  icon: '🔴', dataKey: 'critical' },
  { key: 'alerts',   label: 'Alertas',   icon: '🟡', dataKey: 'alerts'   },
  { key: 'planned',  label: 'En Planeación', icon: '⬜', dataKey: 'planned'  },
  { key: 'warranty', label: 'Garantías', icon: '⚠️', dataKey: 'warranty'  },
];

const LANE_LABELS: Record<string, string> = {
  PM: 'P.MDF', PP: 'P.Piedra', IM: 'I.MDF', IP: 'I.Piedra',
};

function InstanceCard({
  instance,
  onClick,
}: {
  instance: InstanceSchedule;
  onClick?: (inst: InstanceSchedule) => void;
}) {
  const cfg = getSemaphoreConfig(instance.semaphore);
  const schedEntries = Object.entries(instance.schedule).filter(([, v]) => v !== null);

  return (
    <button
      onClick={() => onClick?.(instance)}
      className={`
        w-full text-left p-3 rounded-xl border transition-all
        hover:shadow-sm hover:border-slate-300
        ${cfg.border} ${cfg.bg}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-xs font-semibold truncate ${cfg.text}`}>
            {instance.is_warranty_reopened && <span className="mr-1">⚠️</span>}
            {instance.custom_name}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{instance.semaphore_label}</p>
        </div>
        <span className="text-base shrink-0">{cfg.dot}</span>
      </div>

      {/* Fechas programadas */}
      {schedEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {schedEntries.map(([lane, dt]) => (
            <span
              key={lane}
              className="inline-flex items-center gap-0.5 text-[9px] bg-white/70 border border-slate-200 rounded-full px-1.5 py-0.5 text-slate-600"
            >
              <span className="font-bold">{LANE_LABELS[lane] ?? lane}</span>
              {' '}
              {new Date(dt!).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
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
    </button>
  );
}

export default function HealthSidebar({ data, loading, onInstanceClick }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('critical');

  const activeTabConfig = TABS.find(t => t.key === activeTab)!;
  const instances = data ? (data[activeTabConfig.dataKey] as InstanceSchedule[]) : [];

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-100">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">Panel de Salud</h2>
        <p className="text-xs text-slate-400 mt-0.5">Semáforo Preventivo</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 overflow-x-auto shrink-0">
        {TABS.map(tab => {
          const count = data?.counts[
            tab.key === 'critical' ? 'RED' :
            tab.key === 'alerts'   ? 'YELLOW' :
            tab.key === 'planned'  ? 'GRAY' : 'WARRANTY'
          ] ?? 0;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex-1 min-w-0 py-2.5 px-1 text-center transition-colors
                ${isActive
                  ? 'border-b-2 border-slate-800 text-slate-800'
                  : 'text-slate-400 hover:text-slate-600'
                }
              `}
            >
              <div className="text-base">{tab.icon}</div>
              <div className="text-[9px] font-medium mt-0.5">{tab.label}</div>
              {count > 0 && (
                <div className={`
                  inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold mt-0.5
                  ${tab.key === 'critical' ? 'bg-red-100 text-red-700' :
                    tab.key === 'alerts'   ? 'bg-amber-100 text-amber-700' :
                    tab.key === 'warranty' ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-600'}
                `}>
                  {count > 99 ? '99+' : count}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-700" />
          </div>
        )}
        {!loading && instances.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <span className="text-3xl mb-2">
              {activeTab === 'critical' ? '🟢' : activeTab === 'alerts' ? '✅' : '📋'}
            </span>
            <p className="text-xs text-center">
              {activeTab === 'critical' ? 'Sin instancias críticas' :
               activeTab === 'alerts'   ? 'Sin alertas próximas' :
               activeTab === 'warranty' ? 'Sin garantías activas' :
               'Sin instancias en planeación'}
            </p>
          </div>
        )}
        {!loading && instances.map(inst => (
          <InstanceCard key={inst.id} instance={inst} onClick={onInstanceClick} />
        ))}
      </div>

      {/* Footer stats */}
      {data && (
        <div className="px-4 py-3 border-t border-slate-100 grid grid-cols-2 gap-2">
          {[
            { label: 'En Proceso', count: (data.counts['BLUE'] ?? 0) + (data.counts['BLUE_GREEN'] ?? 0) + (data.counts['DOUBLE_BLUE'] ?? 0), icon: '🔵' },
            { label: 'Instalados', count: data.counts['GREEN'] ?? 0, icon: '🟢' },
          ].map(item => (
            <div key={item.label} className="bg-slate-50 rounded-xl p-2 text-center">
              <div className="text-base">{item.icon}</div>
              <div className="text-lg font-bold text-slate-700">{item.count}</div>
              <div className="text-[10px] text-slate-400">{item.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
