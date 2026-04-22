import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { productionService } from '../../../api/production-service';

export default function ProductionInProcessPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productionService.getBatches()
      .then(data => {
        setBatches(
          data.filter(b => b.status === 'IN_PRODUCTION')
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalInstances = batches.reduce(
    (n, b) => n + (b.instances?.length ?? 0), 0
  );

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24">
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate('/production')}
          className="flex items-center gap-2 bg-white border
                     border-slate-300 text-slate-700 px-4 py-2
                     rounded-lg font-bold hover:bg-slate-50
                     hover:text-blue-600 transition-all shadow-sm"
        >
          ← Regresar
        </button>
      </div>

      <div className="mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800
                       flex items-center gap-2">
          🔵 Instancias en Proceso
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {totalInstances} instancia(s) actualmente en fabricación
          en {batches.length} lote(s).
        </p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">
          Cargando...
        </p>
      ) : batches.length === 0 ? (
        <p className="text-slate-400 text-center py-12">
          No hay instancias en producción en este momento.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {batches.map(batch => (
            <div key={batch.id}
                 className="bg-white rounded-xl border
                            border-slate-200 shadow-sm overflow-hidden">
              {/* Header del lote */}
              <div className="flex items-center justify-between
                              px-5 py-3 bg-blue-50
                              border-b border-blue-100">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-blue-700">
                    {batch.folio}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5
                                   rounded-full bg-blue-100
                                   text-blue-600">
                    {batch.batch_type}
                  </span>
                </div>
                <span className="text-xs text-blue-500 font-medium">
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
