import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Download, FileSpreadsheet, ShieldCheck, Upload, XCircle } from 'lucide-react';
import {
  salesService,
  type LegacyImportDiscrepancy,
  type LegacyImportIssue,
  type LegacyImportPreview,
  type LegacyImportPreviewOrder,
  type LegacyImportResult,
} from '@/api/sales-service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VStatusBadge } from '@/components/ui/VStatusBadge';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';

const role = String(localStorage.getItem('user_role') ?? '').toUpperCase();

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type CreatedRow = LegacyImportResult['orders_created_details'][number];

const issueColumns: VTableColumn<LegacyImportIssue>[] = [
  { key: 'sheet', label: 'Hoja', render: (r) => r.sheet, width: '90px' },
  { key: 'row', label: 'Fila', render: (r) => r.row ?? '—', width: '60px' },
  { key: 'project', label: 'Proyecto', render: (r) => r.project ?? '—' },
  { key: 'message', label: 'Detalle', render: (r) => r.message },
];

const ACTION_TONE: Record<string, string> = {
  CREAR: 'bg-emerald-100 text-emerald-800',
  AGREGAR: 'bg-emerald-100 text-emerald-800',
  REVISAR: 'bg-amber-100 text-amber-800',
  'SIN CAMBIOS': 'bg-slate-100 text-slate-600',
};
const REVIEW_TONE = 'bg-amber-100 text-amber-800';

const discrepancyColumns: VTableColumn<LegacyImportDiscrepancy>[] = [
  { key: 'folio', label: 'Folio OV', render: (r) => r.folio, width: '90px' },
  { key: 'project', label: 'Proyecto', render: (r) => r.project },
  { key: 'kind', label: 'Diferencia', render: (r) => r.kind },
  { key: 'record', label: 'Factura / abono', render: (r) => r.record || '—' },
  { key: 'concept', label: 'Concepto', render: (r) => r.concept },
  { key: 'valentina', label: 'En Valentina', render: (r) => r.valentina },
  { key: 'excel', label: 'En el Excel', render: (r) => r.excel },
];

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function OrderChanges({ order }: { order: LegacyImportPreviewOrder }) {
  if (order.details.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <ul className="list-disc pl-4 space-y-0.5 text-xs text-slate-700">
      {order.details.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

const previewColumns: VTableColumn<LegacyImportPreviewOrder>[] = [
  { key: 'row', label: 'Fila', render: (r) => r.row ?? '—', width: '60px' },
  {
    key: 'action',
    label: 'Acción',
    render: (r) => (
      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${ACTION_TONE[r.action] ?? REVIEW_TONE}`}>
        {r.action}
      </span>
    ),
  },
  { key: 'folio', label: 'Folio OV', render: (r) => r.folio ?? 'Nueva' },
  { key: 'project_name', label: 'Proyecto', render: (r) => r.project_name },
  { key: 'total_price', label: 'Total con IVA', render: (r) => money.format(r.total_price) },
  { key: 'invoices', label: 'Facturas', render: (r) => r.invoices },
  { key: 'installments', label: 'Abonos', render: (r) => r.installments },
  { key: 'outstanding_balance', label: 'Saldo con IVA', render: (r) => money.format(r.outstanding_balance) },
  {
    key: 'payment_status',
    label: 'Estado',
    render: (r) => <VStatusBadge status={r.payment_status} entity="invoice" />,
  },
  { key: 'details', label: 'Qué se agrega / diferencias', render: (r) => <OrderChanges order={r} /> },
];

const createdColumns: VTableColumn<CreatedRow>[] = [
  { key: 'folio', label: 'Folio', render: (r) => r.folio },
  { key: 'project_name', label: 'Proyecto', render: (r) => r.project_name },
  {
    key: 'outstanding_balance',
    label: 'Saldo pendiente',
    render: (r) => money.format(r.outstanding_balance),
  },
];

function errorDetail(err: unknown, fallback: string): string {
  const detail =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      : undefined;
  return typeof detail === 'string' ? detail : fallback;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-xs font-bold uppercase">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

function IssuesSection({ issues, kind }: { issues: LegacyImportIssue[]; kind: 'error' | 'warning' }) {
  if (issues.length === 0) return null;
  const isError = kind === 'error';
  return (
    <div className="space-y-3">
      <h2
        className={`text-sm font-black uppercase flex items-center gap-2 ${
          isError ? 'text-red-700' : 'text-amber-700'
        }`}
      >
        {isError ? <XCircle size={16} /> : <AlertTriangle size={16} />}
        {isError ? `Errores (${issues.length}) — bloquean la importación` : `Avisos (${issues.length})`}
      </h2>
      <VTable columns={issueColumns} data={issues} />
    </div>
  );
}

export default function LegacyImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<LegacyImportPreview | null>(null);
  const [result, setResult] = useState<LegacyImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const previewTotal = useMemo(
    () =>
      preview
        ? preview.orders.filter((o) => o.action === 'CREAR').reduce((sum, o) => sum + o.total_price, 0)
        : 0,
    [preview],
  );

  if (role !== 'DIRECTOR' && role !== 'MANAGER') {
    return (
      <VEmptyState
        title="Acceso restringido"
        description="Solo Dirección y Gerencia pueden subir el Excel de migración de OVs."
      />
    );
  }

  const handleValidate = async () => {
    if (!file) {
      toast.warning('Selecciona un archivo Excel.');
      return;
    }
    setValidating(true);
    setResult(null);
    try {
      const data = await salesService.validateLegacyOrders(file);
      setPreview(data);
      if (data.can_import) {
        toast.success(
          `Archivo válido: ${data.orders_to_create} OV(s) nuevas y ${data.additions} registro(s) por agregar.`,
        );
      } else if (data.errors.length === 0) {
        toast.info(`Nada que agregar. ${data.discrepancies.length} diferencia(s) para revisar.`);
      } else {
        toast.error(`El archivo tiene ${data.errors.length} error(es). Corrígelos y vuelve a validar.`);
      }
    } catch (err: unknown) {
      setPreview(null);
      toast.error(errorDetail(err, 'Error al validar el archivo.'));
    } finally {
      setValidating(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      saveBlob(await salesService.downloadLegacyTemplate(), 'migracion-ov.xlsx');
    } catch (err: unknown) {
      toast.error(errorDetail(err, 'No se pudo descargar el Excel.'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!file) return;
    setDownloadingReport(true);
    try {
      saveBlob(await salesService.downloadLegacyDiscrepancies(file), 'diferencias-migracion-ov.xlsx');
    } catch (err: unknown) {
      toast.error(errorDetail(err, 'No se pudo descargar el reporte de diferencias.'));
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const data = await salesService.importLegacyOrders(file);
      setResult(data);
      setPreview(null);
      if (data.errors.length > 0) {
        toast.error('No se importó nada. Revisa los errores.');
      } else {
        toast.success(
          `Aplicado: ${data.orders_created} OV(s) nuevas y ${data.additions} registro(s) agregados ` +
            `en ${data.orders_with_additions} OV(s).`,
        );
      }
    } catch (err: unknown) {
      toast.error(errorDetail(err, 'Error al importar el archivo.'));
    } finally {
      setImporting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Migración de OVs (Excel)</h1>
          <p className="text-sm text-slate-500 mt-1">
            La subida solo agrega lo que falta en Valentina (OVs nuevas, facturas y abonos). Nunca cambia ni
            cancela: las diferencias se reportan para corregirlas a mano en la app, con motivo. Todo se sigue
            capturando en la app. No toca bancos ni comisiones. Se aplica solo si no hay errores, todo o nada.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/director')}>
          <ArrowLeft size={16} /> Regresar
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
        <Button disabled={downloading} onClick={() => void handleDownload()}>
          <Download size={16} /> {downloading ? 'Descargando…' : 'Descargar Excel con los datos actuales'}
        </Button>

        <div>
          <label className="text-xs font-bold uppercase text-slate-500 mb-2 block">
            Archivo .xlsx
          </label>
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={validating || !file} onClick={() => void handleValidate()}>
            <ShieldCheck size={16} />
            {validating ? 'Validando…' : 'Validar'}
          </Button>
          <Button
            disabled={validating || importing || !preview?.can_import}
            onClick={() => setConfirmOpen(true)}
            title={preview?.can_import ? 'Agregar lo que falta en Valentina' : 'Valida un archivo sin errores con algo que agregar'}
          >
            <Upload size={16} /> Agregar lo que falta
          </Button>
          <Button
            variant="outline"
            disabled={downloadingReport || !preview || preview.errors.length > 0 || preview.discrepancies.length === 0}
            onClick={() => void handleDownloadReport()}
            title="Reporte de diferencias para corregir a mano"
          >
            <FileSpreadsheet size={16} /> {downloadingReport ? 'Descargando…' : 'Descargar reporte de diferencias'}
          </Button>
        </div>
      </div>

      {preview && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <StatCard label="OVs nuevas" value={preview.orders_to_create} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
            <StatCard label="OVs con algo que agregar" value={preview.orders_with_additions} tone="border-indigo-200 bg-indigo-50 text-indigo-800" />
            <StatCard label="Registros a agregar" value={preview.additions} tone="border-indigo-200 bg-indigo-50 text-indigo-800" />
            <StatCard label="Diferencias a revisar" value={preview.discrepancies.length} tone="border-amber-200 bg-amber-50 text-amber-800" />
          </div>
          <IssuesSection issues={preview.errors} kind="error" />
          <IssuesSection issues={preview.warnings} kind="warning" />
          {preview.discrepancies.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-black uppercase text-amber-700 flex items-center gap-2">
                <AlertTriangle size={16} /> Diferencias ({preview.discrepancies.length}) — no se cambian; corrígelas a mano
              </h2>
              <VTable columns={discrepancyColumns} data={preview.discrepancies} />
            </div>
          )}
          <div className="space-y-3">
            <h2 className="text-sm font-black uppercase text-slate-600 flex items-center gap-2">
              <FileSpreadsheet size={16} /> Vista previa
            </h2>
            <VTable
              columns={previewColumns}
              data={preview.orders}
              emptyState={{ title: 'Sin OVs válidas', description: 'Ninguna OV pasó la validación.' }}
            />
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <StatCard label="OVs creadas" value={result.orders_created} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
            <StatCard label="OVs con registros agregados" value={result.orders_with_additions} tone="border-indigo-200 bg-indigo-50 text-indigo-800" />
            <StatCard label="Registros agregados" value={result.additions} tone="border-indigo-200 bg-indigo-50 text-indigo-800" />
            <StatCard label="Diferencias a revisar" value={result.discrepancies.length} tone="border-amber-200 bg-amber-50 text-amber-800" />
          </div>
          <IssuesSection issues={result.errors} kind="error" />
          {result.orders_created_details.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-black uppercase text-slate-600 flex items-center gap-2">
                <FileSpreadsheet size={16} /> OVs importadas
              </h2>
              <VTable columns={createdColumns} data={result.orders_created_details} />
            </div>
          )}
          <IssuesSection issues={result.warnings} kind="warning" />
        </div>
      )}

      <VConfirmDialog
        isOpen={confirmOpen}
        title="Agregar lo que falta en Valentina"
        message={
          preview
            ? `Se crearán ${preview.orders_to_create} OV(s) nuevas (${money.format(previewTotal)} con IVA) y se ` +
              `agregarán ${preview.additions} factura(s) o abono(s) en ${preview.orders_with_additions} OV(s) existentes.`
            : ''
        }
        consequence={
          'Solo se agrega; nada se cambia ni se cancela. Queda en la bitácora con el motivo "Importación <fecha>". ' +
          `Las ${preview?.discrepancies.length ?? 0} diferencia(s) no se tocan: descarga el reporte y corrígelas a mano. ` +
          'No toca bancos ni comisiones.'
        }
        confirmLabel="Agregar"
        variant="warning"
        onConfirm={handleImport}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
