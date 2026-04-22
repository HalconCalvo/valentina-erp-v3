import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { productionService } from '../../../api/production-service';

export default function ProductionReadyPage() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productionService.getBatches().then(batches => {
      const ready = batches
        .filter(b => b.status === 'READY_TO_INSTALL')
        .flatMap(b => (b.instances || []).map(inst => ({
          ...inst,
          batch_folio: b.folio,
          batch_type: b.batch_type,
        })));
      setInstances(ready);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24">
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate('/production')}
          className="flex items-center gap-2 bg-white border
                     border-slate-300 text-slate-700 px-4 py-2
                     rounded-lg font-bold hover:bg-slate-50
                     hover:text-emerald-600 transition-all shadow-sm"
        >
          ← Regresar
        </button>
      </div>
      <div className="mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800
                       flex items-center gap-2">
          🟢 Listas para Instalarse
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Instancias terminadas esperando despacho.
        </p>
      </div>
      {loading ? (
        <p className="text-slate-400 text-center py-12">Cargando...</p>
      ) : instances.length === 0 ? (
        <p className="text-slate-400 text-center py-12">
          El andén de despacho está vacío.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {instances.map(inst => (
            <div key={inst.id}
                 className="bg-white rounded-xl border border-slate-200
                            shadow-sm px-5 py-4 flex items-center gap-4">
              <span className="text-xs font-mono font-bold
                               text-emerald-600 bg-emerald-50 px-2 py-0.5
                               rounded-lg border border-emerald-100 shrink-0">
                {inst.batch_folio}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5
                               rounded-full bg-slate-100 text-slate-600
                               shrink-0">
                {inst.batch_type}
              </span>
              <span className="font-bold text-slate-800 flex-1 truncate">
                {inst.custom_name || '—'}
              </span>
              {inst.qr_code && (
                <span className="text-[10px] font-mono text-slate-400
                                 shrink-0">
                  QR: {inst.qr_code.slice(0, 8)}...
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
