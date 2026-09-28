import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { productionService } from '../../../api/production-service';
import { getSemaphoreBadgeMark, getSemaphoreConfig } from '../../planning/hooks/usePlanning';

const TITLE_SEMAPHORE = getSemaphoreConfig('BLUE_GREEN');

function formatScheduleDay(iso: string | null | undefined): string | null {
  const raw = typeof iso === 'string' ? iso.trim() : '';
  if (!raw) return null;
  const d = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const month = d
    .toLocaleDateString('es-MX', { month: 'short' })
    .replace(/\./g, '')
    .trim();
  return `${day}/${month}/${d.getFullYear()}`;
}

function installationScheduleDisplay(
  inst: {
    scheduled_inst_mdf?: string | null;
    scheduled_inst_stone?: string | null;
    track?: string | null;
    batch_type?: string | null;
  },
  isPiedra: boolean,
): { text: string; hasDate: boolean } {
  const raw = isPiedra ? inst.scheduled_inst_stone : inst.scheduled_inst_mdf;
  const prefix = isPiedra ? 'IP' : 'IM';
  const formatted = formatScheduleDay(raw);
  if (formatted) {
    return { text: `${prefix}: ${formatted}`, hasDate: true };
  }
  return { text: 'Sin fecha programada', hasDate: false };
}

function InstanceSemaphoreMark({ semaphore }: { semaphore?: string | null }) {
  const sem = semaphore ?? 'BLUE_GREEN';
  const mark = getSemaphoreBadgeMark(sem);
  if (mark.kind === 'icon') {
    return (
      <span className="text-sm leading-none shrink-0" title={sem} aria-hidden>
        {mark.icon}
      </span>
    );
  }
  return <span className={mark.dotClass} title={sem} aria-hidden />;
}

export default function ProductionReadyPage() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    productionService.getReadyInstances().then(data => {
      setInstances(Array.isArray(data) ? data : []);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  // Agrupar por OV
  const groups = useMemo(() => {
    const map = new Map<string, { folio: string; project_name: string; client_name: string; instances: any[] }>();
    for (const inst of instances) {
      const key = inst.order_folio || 'Sin OV';
      if (!map.has(key)) {
        map.set(key, {
          folio: inst.order_folio || 'Sin OV',
          project_name: inst.project_name || '—',
          client_name: inst.client_name || '—',
          instances: [],
        });
      }
      map.get(key)!.instances.push(inst);
    }
    return Array.from(map.values()).sort((a, b) => a.folio.localeCompare(b.folio));
  }, [instances]);

  const toggle = (folio: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(folio) ? next.delete(folio) : next.add(folio);
      return next;
    });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24">
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate('/production')}
          className="flex items-center gap-2 bg-white border border-slate-300
                     text-slate-700 px-4 py-2 rounded-lg font-bold
                     hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-sm"
        >
          ← Regresar
        </button>
      </div>

      <div className="mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <span className="text-2xl leading-none shrink-0" aria-hidden>
            {TITLE_SEMAPHORE.icon ?? TITLE_SEMAPHORE.dot}
          </span>
          Listas para Instalarse
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Instancias terminadas esperando despacho — agrupadas por OV.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">Cargando...</p>
      ) : groups.length === 0 ? (
        <p className="text-slate-400 text-center py-12">El andén de despacho está vacío.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(group => {
            const isOpen = expanded.has(group.folio);
            return (
              <div key={group.folio} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header de OV — clickeable */}
                <div
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggle(group.folio)}
                >
                  {isOpen
                    ? <ChevronUp size={16} className="text-slate-400 shrink-0" />
                    : <ChevronDown size={16} className="text-slate-400 shrink-0" />
                  }
                  <span className="text-sm font-black text-slate-800">{group.folio}</span>
                  <span className="text-sm text-slate-500 flex-1 truncate">
                    {group.project_name} — {group.client_name}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                    {group.instances.length} {group.instances.length === 1 ? 'instancia' : 'instancias'}
                  </span>
                </div>

                {/* Instancias de esta OV */}
                {isOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {group.instances.map(inst => {
                      const isPiedra =
                        String(inst.track ?? inst.batch_type ?? '').toUpperCase() === 'PIEDRA';
                      const schedule = installationScheduleDisplay(inst, isPiedra);
                      return (
                      <div
                        key={inst.id}
                        className={`px-5 py-3 flex items-center gap-3 border-l-4 hover:opacity-95 transition-opacity ${
                          isPiedra
                            ? 'bg-violet-50 border-l-violet-400'
                            : 'bg-amber-50 border-l-amber-400'
                        }`}
                      >
                        <InstanceSemaphoreMark semaphore={inst.semaphore} />
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            isPiedra
                              ? 'bg-violet-100 text-violet-800 border border-violet-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {inst.batch_type}
                        </span>
                        <span className="font-bold text-slate-700 flex-1 min-w-0 truncate text-sm">
                          {inst.custom_name || '—'}
                        </span>
                        <span
                          className={`text-xs shrink-0 ml-auto text-right max-w-[11rem] ${
                            schedule.hasDate
                              ? 'text-blue-700 font-semibold'
                              : 'text-slate-400 font-medium'
                          }`}
                        >
                          {schedule.text}
                        </span>
                        {inst.qr_code && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            QR: {inst.qr_code.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
