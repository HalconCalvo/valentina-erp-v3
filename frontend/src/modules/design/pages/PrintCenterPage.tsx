import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { designService, LabelRequestItem } from '../../../api/design-service';
import { toast } from '@/components/ui/VToast';
import { Button } from '@/components/ui/Button';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VPageHeader } from '@/components/ui/VPageHeader';
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
      sortable: true,
      render: (row) => (
        <span className="font-medium text-slate-800">{row.client_name}</span>
      ),
    },
    {
      key: 'project_name',
      label: 'Proyecto',
      sortable: true,
      render: (row) => (
        <span className="text-slate-700 max-w-[180px] truncate block" title={row.project_name ?? ''}>{row.project_name || '—'}</span>
      ),
    },
    {
      key: 'custom_name',
      label: 'Instancia',
      sortable: true,
      render: (row) => (
        <span className="text-slate-800">{row.custom_name}</span>
      ),
    },
    {
      key: 'is_stone',
      label: 'Tipo',
      sortable: true,
      sortValue: (row) => (row.is_stone ? 'Piedra' : 'MDF'),
      render: (row) => (
        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${row.is_stone
          ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          {row.is_stone ? 'Piedra' : 'MDF'}
        </span>
      ),
    },
    {
      key: 'declared_bundles',
      label: 'Bultos / piezas',
      align: 'right',
      render: (row) => (
        <span className="block text-right tabular-nums text-slate-700">
          {row.is_stone ? `${row.stone_pieces ?? 0} piezas` : `${row.declared_bundles} bultos`}
        </span>
      ),
    },
    {
      key: 'printed_at',
      label: 'Impresión',
      sortable: true,
      sortValue: (row) => (row.printed_at ? new Date(row.printed_at).getTime() : 0),
      render: (row) => (row.printed_at ? (
        <span className="text-xs text-slate-500">
          <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 mr-1">Impresa</span>
          {formatDateTime(row.printed_at)}{row.printed_by ? ` · ${row.printed_by}` : ''}
        </span>
      ) : (
        <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
          Pendiente de imprimir
        </span>
      )),
    },
    {
      key: 'action',
      label: 'Acción',
      width: '12rem',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-2">
          {row.is_stone ? (
            <Button type="button" size="sm" onClick={() => void handleDownloadManifest(row)}
              className="bg-emerald-600 hover:bg-emerald-700">
              <Printer size={14} /> Descargar manifiesto
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => void handleGenerateLabels(row)}
              className="bg-emerald-600 hover:bg-emerald-700">
              <Printer size={14} /> Descargar etiquetas
            </Button>
          )}
        </div>
      ),
    },
  ], [handleDownloadManifest, handleGenerateLabels]);

  // Guide v2 (tanda 1): list → full width, standard header, white KPI card, report table
  return (
    <div className="p-8 w-full pb-24 space-y-6 animate-fadeIn">
      <VPageHeader
        icon={Printer}
        title="Centro de impresión"
        subtitle="Etiquetas y manifiestos de piedra pendientes de generar."
        loading={loading}
        onBack={() => navigate('/design')}
        backLabel="Regresar a Diseño e Ingeniería"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Etiquetas pendientes</p>
          <p className="text-2xl font-black tabular-nums mt-1 text-indigo-700">{loading ? '—' : pendingCount}</p>
          <p className="text-xs text-slate-500 mt-1">Instancias con bultos declarados en producción o empaque</p>
        </div>
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      <VTable
        columns={labelColumns as unknown as VTableColumn<Record<string, unknown>>[]}
        data={tableData as unknown as Record<string, unknown>[]}
        isLoading={loading}
        headerStyle="report"
        className="shadow-sm"
        emptyState={{
          icon: <Printer />,
          title: 'No hay solicitudes pendientes',
          description: 'Aquí aparecen las instancias con bultos declarados en producción o empaque.',
        }}
      />
    </div>
  );
}
