import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { designService, LabelRequestItem } from '../../../api/design-service';

export default function PrintCenterPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LabelRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await designService.getLabelRequests();
        if (!cancelled) setRows(data);
      } catch (e: unknown) {
        if (!cancelled) {
          const err = e as { response?: { data?: { detail?: string } }; message?: string };
          setError(err.response?.data?.detail || err.message || 'Error al cargar solicitudes');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingCount = rows.length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 pb-24 animate-in fade-in duration-300">
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={() => navigate('/design')}
          className="flex items-center gap-2 bg-white border 
                   border-slate-300 text-slate-700 px-4 py-2 
                   rounded-lg font-bold hover:bg-slate-50 
                   hover:text-indigo-600 transition-all shadow-sm"
        >
          <ArrowLeft size={18} /> Regresar
        </button>
      </div>

      <div>
        <h1 className="text-3xl font-black text-slate-800">Centro de impresión</h1>
        <p className="text-slate-500 mt-1">Etiquetas pendientes de generación</p>
      </div>

      {/* KPI */}
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700/80 mb-2">
          Etiquetas pendientes
        </p>
        <p className="text-5xl font-black tabular-nums text-emerald-700">{loading ? '—' : pendingCount}</p>
        <p className="text-sm text-slate-500 mt-2">
          Instancias con bultos declarados en producción o empaque
        </p>
      </section>

      {/* Bandeja */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Bandeja de solicitudes</h2>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading ? (
          <p className="text-slate-500 text-sm py-8">Cargando…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Proyecto</th>
                  <th className="px-4 py-3 font-semibold">Instancia</th>
                  <th className="px-4 py-3 font-semibold text-right">Total bultos</th>
                  <th className="px-4 py-3 font-semibold text-center w-48">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No hay solicitudes pendientes
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.instance_id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.client_name}</td>
                      <td className="px-4 py-3 text-slate-700">{row.project_name}</td>
                      <td className="px-4 py-3 text-slate-800">{row.custom_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {row.declared_bundles}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            alert(
                              `Instancia #${row.instance_id}\nCliente: ${row.client_name}\nProyecto: ${row.project_name}\nInstancia: ${row.custom_name}\nTotal bultos: ${row.declared_bundles}`
                            )
                          }
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                          <Printer size={14} />
                          🖨️ Generar Etiquetas
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
