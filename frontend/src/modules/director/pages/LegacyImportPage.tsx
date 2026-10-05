import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Download, FileSpreadsheet, ShieldCheck, Upload, XCircle } from 'lucide-react';
import {
  salesService,
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
import plantillaUrl from '@/assets/plantilla-migracion-ov.xlsx?url';

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

const previewColumns: VTableColumn<LegacyImportPreviewOrder>[] = [
  { key: 'row', label: 'Fila', render: (r) => r.row, width: '60px' },
  { key: 'project_name', label: 'Proyecto', render: (r) => r.project_name },
  { key: 'client_name', label: 'Cliente', render: (r) => r.client_name },
  { key: 'tax_rate_name', label: 'IVA', render: (r) => r.tax_rate_name },
  { key: 'total_price', label: 'Total', render: (r) => money.format(r.total_price) },
  { key: 'invoices', label: 'Facturas', render: (r) => r.invoices },
  { key: 'installments', label: 'Abonos', render: (r) => r.installments },
  { key: 'outstanding_balance', label: 'Saldo', render: (r) => money.format(r.outstanding_balance) },
  {
    key: 'payment_status',
    label: 'Estado',
    render: (r) => <VStatusBadge status={r.payment_status} entity="invoice" />,
  },
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

  const previewTotal = useMemo(
    () => (preview ? preview.orders.reduce((sum, o) => sum + o.total_price, 0) : 0),
    [preview],
  );

  if (role !== 'DIRECTOR' && role !== 'MANAGER') {
    return (
      <VEmptyState
        title="Acceso restringido"
        description="Solo Dirección y Gerencia pueden ejecutar la migración legacy."
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
        toast.success(`Archivo válido: ${data.orders_to_create} OV(s) listas para importar.`);
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

  const handleImport = async () => {
    if (!file) return;
    try {
      const data = await salesService.importLegacyOrders(file);
      setResult(data);
      setPreview(null);
      if (data.errors.length > 0) {
        toast.error('No se importó nada. Revisa los errores.');
      } else {
        toast.success(
          `Importación finalizada: ${data.orders_created} OV(s), ${data.invoices_created} factura(s).`,
        );
      }
    } catch (err: unknown) {
      toast.error(errorDetail(err, 'Error al importar el archivo.'));
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Migración OVs Legacy</h1>
          <p className="text-sm text-slate-500 mt-1">
            Valida el archivo completo antes de importar. Solo se importa si no hay errores, y todo o nada.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/director')}>
          <ArrowLeft size={16} /> Regresar
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
        <a
          href={plantillaUrl}
          download="plantilla-migracion-ov.xlsx"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          <Download size={16} /> Descargar plantilla Excel
        </a>

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
            disabled={validating || !preview?.can_import}
            onClick={() => setConfirmOpen(true)}
            title={preview?.can_import ? 'Importar las OVs validadas' : 'Valida un archivo sin errores primero'}
          >
            <Upload size={16} /> Importar
          </Button>
        </div>
      </div>

      {preview && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="OVs a crear" value={preview.orders_to_create} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
            <StatCard label="Facturas" value={preview.invoices_to_create} tone="border-indigo-200 bg-indigo-50 text-indigo-800" />
            <StatCard label="Abonos" value={preview.installments_to_create} tone="border-slate-200 bg-slate-50 text-slate-800" />
          </div>
          <IssuesSection issues={preview.errors} kind="error" />
          <IssuesSection issues={preview.warnings} kind="warning" />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="OVs creadas" value={result.orders_created} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
            <StatCard label="Facturas" value={result.invoices_created} tone="border-indigo-200 bg-indigo-50 text-indigo-800" />
            <StatCard label="Abonos" value={result.installments_created} tone="border-slate-200 bg-slate-50 text-slate-800" />
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
        title="Importar OVs legacy"
        message={
          preview
            ? `Se crearán ${preview.orders_to_create} OV(s), ${preview.invoices_to_create} factura(s) y ` +
              `${preview.installments_to_create} abono(s), por un total de ${money.format(previewTotal)}.`
            : ''
        }
        consequence={
          `Se escribirá en la base de datos en una sola transacción. ` +
          `${preview?.warnings.length ?? 0} aviso(s) se importarán tal como están en el archivo. ` +
          'Una OV importada no se borra: solo puede cancelarse con motivo.'
        }
        confirmLabel="Importar"
        variant="warning"
        onConfirm={handleImport}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
