import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { salesService, type LegacyImportResult } from '@/api/sales-service';
import { Input } from '@/components/ui/Input';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import plantillaUrl from '@/assets/plantilla-migracion-ov.xlsx?url';

const role = String(localStorage.getItem('user_role') ?? '').toUpperCase();

type CreatedRow = LegacyImportResult['orders_created_details'][number];

export default function LegacyImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LegacyImportResult | null>(null);

  const createdColumns: VTableColumn<CreatedRow>[] = useMemo(
    () => [
      { key: 'folio', label: 'Folio', render: (r) => r.folio },
      { key: 'project_name', label: 'Proyecto', render: (r) => r.project_name },
      {
        key: 'outstanding_balance',
        label: 'Saldo pendiente',
        render: (r) =>
          new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(r.outstanding_balance),
      },
    ],
    [],
  );

  if (role !== 'DIRECTOR') {
    return (
      <VEmptyState
        title="Acceso restringido"
        description="Solo el Director puede ejecutar la migración legacy."
      />
    );
  }

  const handleImport = async () => {
    if (!file) {
      toast.warning('Selecciona un archivo Excel.');
      return;
    }
    setLoading(true);
    try {
      const data = await salesService.importLegacyOrders(file);
      setResult(data);
      toast.success(
        `Importación finalizada: ${data.orders_created} OV(s), ${data.invoices_created} factura(s).`,
      );
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al importar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Migración OVs Legacy</h1>
          <p className="text-sm text-slate-500 mt-1">
            Importa saldos abiertos desde Excel para el arranque en ceros.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/director')}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Regresar
        </button>
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
              setResult(null);
            }}
          />
        </div>

        <button
          type="button"
          disabled={loading || !file}
          onClick={() => void handleImport()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          Importar
        </button>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase text-emerald-700">OVs creadas</p>
              <p className="text-2xl font-black text-emerald-800">{result.orders_created}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-bold uppercase text-indigo-700">Facturas</p>
              <p className="text-2xl font-black text-indigo-800">{result.invoices_created}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-600">Abonos</p>
              <p className="text-2xl font-black text-slate-800">{result.installments_created}</p>
            </div>
          </div>

          {result.orders_created_details.length > 0 && (
            <div>
              <h2 className="text-sm font-black uppercase text-slate-600 mb-3 flex items-center gap-2">
                <FileSpreadsheet size={16} /> OVs importadas
              </h2>
              <VTable columns={createdColumns} data={result.orders_created_details} />
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
              <p className="font-bold">Avisos</p>
              {result.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-1">
              <p className="font-bold">Errores</p>
              {result.errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
