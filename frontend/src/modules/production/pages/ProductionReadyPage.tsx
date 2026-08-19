import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { productionService } from '../../../api/production-service';

export default function ProductionReadyPage() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    productionService.getBatches().then(batches => {
      const ready = batches
        .filter(b => b.status === 'READY_TO_INSTALL')
        .flatMap(b => (b.instances || []).map((inst: any) => ({
          ...inst,
          batch_folio: b.folio,
          batch_type: b.batch_type,
        })));
      setInstances(ready);
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
          🟢 Listas para Instalarse
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
                    {group.instances.map(inst => (
                      <div key={inst.id} className="px-5 py-3 flex items-center gap-4 bg-slate-50/50 hover:bg-slate-50">
                        <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 shrink-0">
                          {inst.batch_folio}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                          {inst.batch_type}
                        </span>
                        <span className="font-bold text-slate-700 flex-1 truncate text-sm">
                          {inst.custom_name || '—'}
                        </span>
                        {inst.qr_code && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            QR: {inst.qr_code.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    ))}
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
