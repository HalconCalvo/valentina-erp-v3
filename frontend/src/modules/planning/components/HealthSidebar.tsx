import { useState, useMemo } from 'react';
import { HealthPanel, InstanceSchedule } from '../../../api/planning-service';
import { getSemaphoreConfig, formatInstanceLabel } from '../hooks/usePlanning';

interface Props {
  data: HealthPanel | null;
  loading: boolean;
  onInstanceClick?: (instance: InstanceSchedule) => void;
  onInstanceDragStart?: (instance: InstanceSchedule) => void;
  highlightId?: number | null;
  /** Controlled search query — lifted to PlanningPage for cross-view focus mode */
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  /** When true, drag-to-calendar is disabled (Vendedor view) */
  readOnly?: boolean;
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
  isDraggable = true,
}: {
  instance: InstanceSchedule;
  onClick?: (inst: InstanceSchedule) => void;
  onDragStart?: (inst: InstanceSchedule) => void;
  isHighlighted: boolean;
  isDraggable?: boolean;
}) {
  const cfg = getSemaphoreConfig(instance.semaphore);
  const schedEntries = Object.entries(instance.schedule).filter(([, v]) => v !== null) as [string, string][];

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? () => onDragStart?.(instance) : undefined}
      onClick={() => onClick?.(instance)}
      className={`
        w-full text-left px-3 py-3 rounded-xl border select-none transition-all
        ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} hover:shadow-md active:scale-[0.98]
        ${isHighlighted
          ? 'border-indigo-400 ring-2 ring-indigo-200 shadow-md bg-indigo-50/40'
          : `border-slate-200 bg-white hover:border-slate-300`
        }
      `}
    >
      {/* ── Row 1: Semaphore dot + Alias title ── */}
      <div className="flex items-start gap-2.5">
        {/* Semaphore dot — visual bullet */}
        <span className="text-lg leading-none mt-0.5 shrink-0">{cfg.dot}</span>

        <div className="flex-1 min-w-0">
          {/* Main title: [Category] | [Alias] */}
          <p className="text-sm font-bold text-slate-800 leading-snug break-words">
            {instance.is_warranty_reopened && (
              <span className="mr-1 text-orange-500">⚠️</span>
            )}
            {formatInstanceLabel(instance.product_category, instance.custom_name, instance.product_name)}
          </p>

          {/* Subtitle: client + project context */}
          {(instance.client_name || instance.project_name) && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {[instance.client_name, instance.project_name].filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Folio chip */}
          {instance.order_folio && (
            <span className="inline-block mt-1 text-[9px] font-semibold bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
              {instance.order_folio}
            </span>
          )}
        </div>
      </div>

      {/* ── Row 2: Semaphore label ── */}
      <p className={`text-[10px] font-medium mt-1.5 ml-[30px] ${cfg.text}`}>
        {cfg.label}
      </p>

      {/* ── Row 3: Scheduled lane chips ── */}
      {schedEntries.length > 0 && (
        <div className="mt-2 ml-[30px] flex flex-wrap gap-1">
          {schedEntries.map(([lane, dt]) => (
            <span
              key={lane}
              className="inline-flex items-center gap-1 text-[9px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600 font-medium"
            >
              <span className="font-black">{LANE_LABELS[lane] ?? lane}</span>
              {new Date(dt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
            </span>
          ))}
        </div>
      )}

      {/* ── Row 4: Delivery deadline ── */}
      {instance.delivery_deadline && (
        <p className="text-[10px] text-slate-400 mt-1.5 ml-[30px]">
          Límite:{' '}
          <span className="font-semibold text-slate-600">
            {new Date(instance.delivery_deadline).toLocaleDateString('es-MX', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </span>
        </p>
      )}
    </div>
  );
}

export default function HealthSidebar({ data, loading, onInstanceClick, onInstanceDragStart, highlightId, searchQuery, onSearchQueryChange, readOnly = false }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('RED');

  // query is now controlled from PlanningPage (searchQuery / onSearchQueryChange)
  const query    = searchQuery;
  const setQuery = onSearchQueryChange;

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

  // Raw list from the active tab
  const rawInstances = useMemo((): InstanceSchedule[] => {
    if (!data) return [];
    const tab = TABS.find(t => t.key === activeTab);
    return tab ? tab.dataKey(data) : [];
  }, [data, activeTab]);

  // Filtered list — case-insensitive, multi-field, stable across refreshes
  const instances = useMemo((): InstanceSchedule[] => {
    const q = query.trim().toLowerCase();
    if (!q) return rawInstances;
    return rawInstances.filter(inst => {
      return (
        inst.custom_name.toLowerCase().includes(q) ||
        (inst.product_category?.toLowerCase().includes(q) ?? false) ||
        (inst.order_folio?.toLowerCase().includes(q)      ?? false) ||
        (inst.client_name?.toLowerCase().includes(q)      ?? false) ||
        (inst.project_name?.toLowerCase().includes(q)     ?? false) ||
        (inst.product_name?.toLowerCase().includes(q)     ?? false)
      );
    });
  }, [rawInstances, query]);

  const isFiltering = query.trim().length > 0;

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-100">

      {/* ── Header + Search ── */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 px-1">Panel de Salud</h2>

        {/* Multi-criteria search */}
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar OV, cliente o Proyecto..."
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors text-sm leading-none"
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Active filter banner ── */}
      {isFiltering && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
          <p className="text-[10px] text-indigo-700 font-semibold">
            Filtro activo — {instances.length} resultado{instances.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={() => setQuery('')}
            className="text-[9px] text-indigo-400 hover:text-indigo-700 transition-colors font-semibold"
          >
            Limpiar ✕
          </button>
        </div>
      )}

      {/* ── Semaphore Filter Tabs ── */}
      <div className="flex border-b border-slate-100 shrink-0 mt-1">
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
                    {count > 99 ? '99+' : count}
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
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 px-3">
            {isFiltering ? (
              <>
                <span className="text-3xl mb-2">🔎</span>
                <p className="text-xs font-semibold text-slate-600 text-center">
                  No se encontraron instancias para esta búsqueda.
                </p>
                <p className="text-[10px] text-slate-400 text-center mt-1 leading-relaxed">
                  Probaste: "<span className="italic">{query}</span>"
                </p>
                <button
                  onClick={() => setQuery('')}
                  className="mt-3 text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold underline transition-colors"
                >
                  Limpiar búsqueda
                </button>
              </>
            ) : (
              <>
                <span className="text-3xl mb-2">
                  {activeTab === 'RED'      ? '🟢' :
                   activeTab === 'YELLOW'   ? '✅' :
                   activeTab === 'WARRANTY' ? '🛡️' : '📋'}
                </span>
                <p className="text-xs text-center leading-relaxed">
                  {activeTab === 'RED'      ? 'Sin instancias críticas. ¡Todo en orden!' :
                   activeTab === 'YELLOW'   ? 'Sin alertas próximas.' :
                   activeTab === 'WARRANTY' ? 'Sin garantías activas.' :
                   activeTab === 'BLUE'     ? 'Sin instancias en proceso.' :
                   'Sin instancias en planeación.'}
                </p>
              </>
            )}
          </div>
        )}

        {!loading && instances.map(inst => (
          <InstanceCard
            key={inst.id}
            instance={inst}
            onClick={onInstanceClick}
            onDragStart={onInstanceDragStart}
            isHighlighted={highlightId === inst.id}
            isDraggable={!readOnly}
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
