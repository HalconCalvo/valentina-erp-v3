import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { designService, LabelRequestItem } from '../../../api/design-service';
import { toast } from '@/components/ui/VToast';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import axiosClient from '@/api/axios-client';

function localeCompareEs(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

function orderFolioSortKey(folio: string | undefined): number {
  const raw = (folio ?? '').trim();
  const m = raw.match(/OV-(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return Number.MAX_SAFE_INTEGER;
}

/** Casa/Lote: street+lot del API o últimos segmentos del custom_name (bautizo). */
function casaSortKey(row: LabelRequestItem): string {
  const street = row.street?.trim() ?? '';
  const lot = row.lot?.trim() ?? '';
  if (street || lot) {
    return [street, lot].filter(Boolean).join(', ');
  }
  const parts = row.custom_name.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts.slice(-2).join(', ');
  }
  return '';
}

function compareLabelRequests(a: LabelRequestItem, b: LabelRequestItem): number {
  let cmp = localeCompareEs(a.client_name ?? '', b.client_name ?? '');
  if (cmp !== 0) return cmp;

  const ovNum = orderFolioSortKey(a.order_folio) - orderFolioSortKey(b.order_folio);
  if (ovNum !== 0) return ovNum;
  cmp = localeCompareEs(a.order_folio ?? '', b.order_folio ?? '');
  if (cmp !== 0) return cmp;

  cmp = localeCompareEs(casaSortKey(a), casaSortKey(b));
  if (cmp !== 0) return cmp;

  return localeCompareEs(a.custom_name ?? '', b.custom_name ?? '');
}

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
      const response = await axiosClient.get(`/design/instances/${instanceId}/labels_pdf`, { responseType: 'blob' });
      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiquetas_${instanceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al descargar las etiquetas.');
    }
  };

  const handleDownloadManifest = async (instanceId: number) => {
    try {
      const response = await axiosClient.get(`/design/instances/${instanceId}/stone_manifest`, { responseType: 'blob' });
      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manifiesto_piedra_${instanceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Error al descargar el manifiesto.');
    }
  };

  const tableData = useMemo(() => {
    const sorted = [...rows].sort(compareLabelRequests);
    return sorted.map((row) => ({ ...row, id: row.instance_id }));
  }, [rows]);

  const labelColumns = useMemo((): VTableColumn<LabelRequestItem & { id: number }>[] => [
    {
      key: 'client_name',
      label: 'Cliente',
      render: (row) => (
        <span className="font-medium text-slate-800">{row.client_name}</span>
      ),
    },
    {
      key: 'project_name',
      label: 'Proyecto',
    },
    {
      key: 'custom_name',
      label: 'Instancia',
      render: (row) => (
        <span className="text-slate-800">{row.custom_name}</span>
      ),
    },
    {
      key: 'is_stone',
      label: 'Tipo',
      render: (row) => (
        <span className="block text-center">
          {row.is_stone ? '🪨 Piedra' : '🪵 MDF'}
        </span>
      ),
    },
    {
      key: 'declared_bundles',
      label: 'Total bultos',
      render: (row) => (
        <span className="block text-right tabular-nums text-slate-700">
          {row.declared_bundles}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Acción',
      width: '12rem',
      render: (row) => (
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
              🖨️ Descargar Etiquetas
            </button>
          )}
        </div>
      ),
    },
  ], [handleDownloadManifest, handleGenerateLabels]);

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

        <VTable
          columns={labelColumns as unknown as VTableColumn<Record<string, unknown>>[]}
          data={tableData as unknown as Record<string, unknown>[]}
          isLoading={loading}
          emptyState={{
            title: 'No hay solicitudes pendientes',
          }}
        />
      </section>
    </div>
  );
}
