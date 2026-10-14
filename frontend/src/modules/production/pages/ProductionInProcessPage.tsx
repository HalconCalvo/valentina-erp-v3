import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Factory } from 'lucide-react';
import { productionService } from '../../../api/production-service';
import { Button } from '@/components/ui/Button';
import { VEmptyState } from '@/components/ui/VEmptyState';

export default function ProductionInProcessPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productionService.getBatches()
      .then(data => {
        setBatches(
          data.filter(b => ['IN_PRODUCTION', 'PACKING'].includes(b.status))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalInstances = batches.reduce(
    (n, b) => n + (b.instances?.length ?? 0), 0
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 pb-24 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Factory className="text-indigo-600" size={32} />
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Instancias en Proceso</h1>
            <p className="text-slate-500 mt-1 font-medium">
              {totalInstances} instancia(s) en fabricación o empaque
              en {batches.length} lote(s).
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate('/production')}>
          <ArrowLeft size={18} /> Regresar
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4 animate-pulse">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-100" />)}
        </div>
      ) : batches.length === 0 ? (
        <VEmptyState icon={<Factory />} title="No hay instancias en producción en este momento." />
      ) : (
        <div className="flex flex-col gap-4">
          {batches.map(batch => (
            <div key={batch.id}
                 className="bg-white rounded-xl border
                            border-slate-200 shadow-sm overflow-hidden">
              {/* Header del lote */}
              <div className={`flex items-center justify-between
                              px-5 py-3 border-b
                              ${batch.status === 'PACKING'
                                ? 'bg-violet-50 border-violet-100'
                                : 'bg-blue-50 border-blue-100'}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-black
                                   ${batch.status === 'PACKING'
                                     ? 'text-violet-700'
                                     : 'text-blue-700'}`}>
                    {batch.folio}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5
                                   rounded-full
                                   ${batch.status === 'PACKING'
                                     ? 'bg-violet-100 text-violet-600'
                                     : 'bg-blue-100 text-blue-600'}`}>
                    {batch.batch_type}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5
                                   rounded-full
                                   ${batch.status === 'PACKING'
                                     ? 'bg-violet-200 text-violet-700'
                                     : 'bg-blue-200 text-blue-700'}`}>
                    {batch.status === 'PACKING' ? '📦 Empaque' : '🔵 En Producción'}
                  </span>
                </div>
                <span className={`text-xs font-medium
                                 ${batch.status === 'PACKING'
                                   ? 'text-violet-500'
                                   : 'text-blue-500'}`}>
                  {batch.instances?.length ?? 0} instancia(s)
                </span>
              </div>

              {/* Instancias del lote */}
              {(batch.instances || []).length === 0 ? (
                <p className="px-5 py-3 text-xs text-slate-400 italic">
                  Sin instancias asignadas.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(batch.instances || []).map((inst: any) => (
                    <div key={inst.id}
                         className="px-5 py-3 flex items-center
                                    gap-4 hover:bg-slate-50
                                    transition-colors">
                      <span className="text-sm font-bold
                                       text-slate-800 flex-1 truncate">
                        {inst.custom_name || '—'}
                      </span>
                      {inst.order_folio && (
                        <span className="text-xs font-mono
                                         text-indigo-600 bg-indigo-50
                                         px-2 py-0.5 rounded-lg
                                         border border-indigo-100
                                         shrink-0">
                          {inst.order_folio}
                        </span>
                      )}
                      {inst.client_name && (
                        <span className="text-xs text-slate-500
                                         shrink-0 max-w-[150px]
                                         truncate"
                              title={inst.client_name}>
                          {inst.client_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
