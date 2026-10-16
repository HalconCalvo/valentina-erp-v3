import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { designService, LabelRequestItem } from '../../../api/design-service';
import { toast } from '@/components/ui/VToast';
import { Button } from '@/components/ui/Button';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import axiosClient from '@/api/axios-client';
import { formatDateTime } from '@/utils/format';

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

/** H32: "Etiquetas_OV-0157_Piloto-1.pdf" (house = street/lot or the last parts of its name). */
export function pdfFileName(kind: string, row: LabelRequestItem): string {
  const house = casaSortKey(row) || row.custom_name || String(row.instance_id);
  const safe = house.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return [kind, row.order_folio, safe].filter(Boolean).join('_') + '.pdf';
}

/** H35: a failed PDF download says the server's reason (the error body comes as a Blob). */
async function serverReason(error: unknown, fallback: string): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  try {
    const text = data instanceof Blob ? await data.text() : JSON.stringify(data ?? '');
    const detail = JSON.parse(text)?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  } catch {
    // not JSON: use the fallback
  }
  return fallback;
}

async function downloadPdf(url: string, fileName: string, what: string): Promise<boolean> {
  try {
    const response = await axiosClient.get(url, { responseType: 'blob' });
    const href = window.URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(href);
    return true;
  } catch (error) {
    toast.error(`No se pudo descargar ${what}: ${await serverReason(error, 'error del servidor.')}`);
    return false;
  }
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

  // H56: the download marks the request printed; reload so the row shows it
  const reloadRows = async () => {
    try {
      setRows(await designService.getLabelRequests());
    } catch {
      // the list keeps its last state
    }
  };

  const handleGenerateLabels = async (row: LabelRequestItem) => {
    if (await downloadPdf(`/design/instances/${row.instance_id}/labels_pdf`, pdfFileName('Etiquetas', row), 'las etiquetas')) {
      await reloadRows();
    }
  };

  const handleDownloadManifest = async (row: LabelRequestItem) => {
    if (await downloadPdf(`/design/instances/${row.instance_id}/stone_manifest`, pdfFileName('Manifiesto_Piedra', row),
      'el manifiesto')) {
      await reloadRows();
    }
  };

  const tableData = useMemo(() => {
    const sorted = [...rows].sort(compareLabelRequests);
    return sorted.map((row) => ({ ...row, id: `${row.instance_id}-${row.is_stone ? 'P' : 'M'}` }));
  }, [rows]);

  const labelColumns = useMemo((): VTableColumn<LabelRequestItem & { id: string }>[] => [
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
      label: 'Bultos / piezas',
      render: (row) => (
        <span className="block text-right tabular-nums text-slate-700">
          {row.is_stone ? `${row.stone_pieces ?? 0} piezas` : `${row.declared_bundles} bultos`}
        </span>
      ),
    },
    {
      key: 'printed_at',
      label: 'Impresión',
      render: (row) => (row.printed_at ? (
        <span className="text-xs text-slate-500">
          Impresa {formatDateTime(row.printed_at)}{row.printed_by ? ` · ${row.printed_by}` : ''}
        </span>
      ) : (
        <span className="text-xs font-bold text-amber-700">Pendiente de imprimir</span>
      )),
    },
    {
      key: 'action',
      label: 'Acción',
      width: '12rem',
      render: (row) => (
        <div className="flex items-center justify-center gap-2">
          {row.is_stone ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleDownloadManifest(row)}
              className="text-xs"
            >
              🪨 Descargar Manifiesto
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleGenerateLabels(row)}
              className="text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              <Printer size={14} />
              🖨️ Descargar Etiquetas
            </Button>
          )}
        </div>
      ),
    },
  ], [handleDownloadManifest, handleGenerateLabels]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 pb-24 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <Printer size={32} className="text-indigo-600" /> Centro de impresión
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Etiquetas pendientes de generación</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/design')}>
          <ArrowLeft size={18} /> Regresar
        </Button>
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
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Bandeja de solicitudes</h2>

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
