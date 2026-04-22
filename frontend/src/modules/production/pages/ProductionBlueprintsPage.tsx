import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { designService } from '../../../api/design-service';

export default function ProductionBlueprintsPage() {
  const navigate = useNavigate();
  const [masters, setMasters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    designService.getMasters()
      .then(res => {
        const data = Array.isArray(res) ? res : (res as any).data ?? [];
        setMasters(data.filter((m: any) => m.blueprint_path));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = masters.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24">
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate('/production')}
          className="flex items-center gap-2 bg-white border
                     border-slate-300 text-slate-700 px-4 py-2
                     rounded-lg font-bold hover:bg-slate-50
                     hover:text-indigo-600 transition-all shadow-sm"
        >
          ← Regresar
        </button>
      </div>
      <div className="mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800
                       flex items-center gap-2">
          📐 Planos de Productos
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Catálogo técnico completo — solo lectura.
        </p>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar producto o categoría..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-200 rounded-xl
                     px-4 py-2.5 text-sm text-slate-700
                     focus:outline-none focus:ring-2
                     focus:ring-indigo-300 transition"
        />
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">Cargando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-center py-12">
          No hay planos disponibles.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(master => (
            <div key={master.id}
                 className="bg-white rounded-xl border border-slate-200
                            shadow-sm px-5 py-4 flex items-center
                            justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 truncate">
                  {master.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {master.category}
                </p>
              </div>
              <a
                href={master.blueprint_path}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2
                           rounded-xl text-sm font-bold text-indigo-600
                           border border-indigo-200 bg-indigo-50
                           hover:bg-indigo-100 transition shrink-0"
              >
                📐 Ver / Descargar
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
