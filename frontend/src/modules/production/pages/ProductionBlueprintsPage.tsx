import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { designService } from '../../../api/design-service';

export default function ProductionBlueprintsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Cargar todos los masters y sus versiones
    designService.getMasters()
      .then(async res => {
        const masters = Array.isArray(res) ? res : (res as any).data ?? [];
        // Aplanar: una entrada por versión que tenga blueprint_path
        const flat: any[] = [];
        for (const master of masters) {
          const versions = master.versions ?? [];
          for (const v of versions) {
            if (v.blueprint_path) {
              flat.push({
                master_id: master.id,
                master_name: master.name,
                category: master.category,
                version_id: v.id,
                version_name: v.version_name,
                blueprint_path: v.blueprint_path,
              });
            }
          }
        }
        setItems(flat);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(i =>
    i.master_name.toLowerCase().includes(search.toLowerCase()) ||
    (i.category || '').toLowerCase().includes(search.toLowerCase()) ||
    i.version_name.toLowerCase().includes(search.toLowerCase())
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
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          📐 Planos de Productos
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Catálogo técnico por versión — solo lectura.
        </p>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar producto, versión o categoría..."
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
          {filtered.map(item => (
            <div key={`${item.master_id}-${item.version_id}`}
                 className="bg-white rounded-xl border border-slate-200
                            shadow-sm px-5 py-4 flex items-center
                            justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 truncate">
                  {item.master_name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500">
                    {item.category}
                  </span>
                  <span className="text-[10px] font-bold text-indigo-600
                                   bg-indigo-50 border border-indigo-100
                                   px-1.5 py-0.5 rounded">
                    {item.version_name}
                  </span>
                </div>
              </div>
              <a
                href={item.blueprint_path}
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
