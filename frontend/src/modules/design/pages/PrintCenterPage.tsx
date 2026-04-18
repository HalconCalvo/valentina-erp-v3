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

  const handleGenerateLabels = async (instanceId: number) => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL
        || 'http://localhost:8000/api/v1';
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${baseUrl}/design/instances/${instanceId}/generate_labels`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      if (!response.ok) {
        const err = await response.json();
        alert(`Error: ${err.detail}`);
        return;
      }
      const data = await response.json();
      // Mostrar el ZPL en una ventana nueva para copiar/enviar a impresora
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`
            <html>
              <head>
                <title>Etiquetas ZPL — ${data.instance_name}</title>
                <style>
                  body { font-family: monospace; padding: 20px; 
                         background: #1e1e1e; color: #d4d4d4; }
                  h2 { color: #4ec9b0; }
                  .info { color: #9cdcfe; margin-bottom: 16px; }
                  pre { background: #252526; padding: 20px; 
                        border-radius: 8px; overflow-x: auto;
                        border: 1px solid #3e3e3e; font-size: 13px;
                        line-height: 1.5; }
                  button { background: #0e639c; color: white; 
                           border: none; padding: 10px 20px; 
                           border-radius: 6px; cursor: pointer;
                           font-size: 14px; margin-bottom: 16px; }
                  button:hover { background: #1177bb; }
                </style>
              </head>
              <body>
                <h2>🏷️ Etiquetas ZPL — ${data.instance_name}</h2>
                <div class="info">
                  <p>Cliente: <strong>${data.client_name}</strong></p>
                  <p>Proyecto: <strong>${data.project_name}</strong></p>
                  <p>Total etiquetas: <strong>${data.total_labels}</strong>
                     (${data.mdf_bundles} MDF + 
                     ${data.hardware_bundles} HERRAJES)</p>
                  <p>QR UUID: <code>${data.qr_uuid}</code></p>
                </div>
                <button onclick="navigator.clipboard.writeText(
                  document.getElementById('zpl').textContent
                ).then(() => alert('ZPL copiado al portapapeles'))">
                  📋 Copiar ZPL al portapapeles
                </button>
                <pre id="zpl">${data.zpl_content}</pre>
              </body>
            </html>
          `);
        win.document.close();
      }
    } catch (e) {
      alert('Error al generar etiquetas. Verifica la conexión.');
    }
  };

  const handleDownloadManifest = async (instanceId: number) => {
    try {
      const token = localStorage.getItem('token');
      const baseUrl = import.meta.env.VITE_API_URL
        || 'http://localhost:8000/api/v1';
      const response = await fetch(
        `${baseUrl}/design/instances/${instanceId}/stone_manifest`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        const err = await response.json();
        alert(`Error: ${err.detail}`);
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manifiesto_piedra_${instanceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar el manifiesto.');
    }
  };

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
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold text-right">Total bultos</th>
                  <th className="px-4 py-3 font-semibold text-center w-48">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      No hay solicitudes pendientes
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.instance_id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.client_name}</td>
                      <td className="px-4 py-3 text-slate-700">{row.project_name}</td>
                      <td className="px-4 py-3 text-slate-800">{row.custom_name}</td>
                      <td className="px-4 py-3 text-center">
                        {row.is_stone ? '🪨 Piedra' : '🪵 MDF'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {row.declared_bundles}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {row.is_stone ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadManifest(row.instance_id)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                            >
                              🪨 Descargar Manifiesto
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleGenerateLabels(row.instance_id)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                            >
                              <Printer size={14} />
                              🖨️ Generar Etiquetas
                            </button>
                          )}
                        </div>
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
