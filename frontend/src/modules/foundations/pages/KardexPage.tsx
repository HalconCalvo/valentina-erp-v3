import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '@/api/axios-client';
import {
  formatInventoryCurrency,
  inventoryService,
  KardexEntryRead,
} from '@/api/inventory-service';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VTable, VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';

interface MaterialOption {
  id: number;
  sku: string;
  name: string;
}

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_ENTRY: 'Entrada compra',
  OPENING_BALANCE: 'Saldo apertura',
  ADJUSTMENT_IN: 'Ajuste positivo',
  ADJUSTMENT_OUT: 'Ajuste negativo',
  WASTE: 'Merma',
  PRODUCTION_OUT: 'Salida producción',
  PHYSICAL_COUNT: 'Conteo físico',
};

const getMovementColor = (entry: KardexEntryRead): string => {
  const type = (entry.transaction_type || '').toUpperCase();
  if (type.includes('ADJUSTMENT') || type.includes('AJUSTE')) {
    return 'text-amber-700 bg-amber-50 border-amber-200';
  }
  if ((entry.quantity ?? 0) >= 0) {
    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  }
  return 'text-red-700 bg-red-50 border-red-200';
};

const formatMovementLabel = (entry: KardexEntryRead): string =>
  MOVEMENT_LABELS[entry.transaction_type] || entry.transaction_type.replace(/_/g, ' ');

const formatReference = (entry: KardexEntryRead): string => {
  const parts: string[] = [];
  if (entry.reason_code) parts.push(entry.reason_code);
  if (entry.reception_id) parts.push(`Recepción #${entry.reception_id}`);
  if (entry.project_id) parts.push(`Proyecto #${entry.project_id}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
};

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export default function KardexPage() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loadingKardex, setLoadingKardex] = useState(false);
  const [entries, setEntries] = useState<KardexEntryRead[]>([]);
  const [materialLabel, setMaterialLabel] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoadingMaterials(true);
      try {
        const response = await axiosClient.get('/foundations/materials');
        const rows = Array.isArray(response.data) ? response.data : [];
        setMaterials(
          rows.map((m: { id: number; sku: string; name: string }) => ({
            id: m.id,
            sku: m.sku,
            name: m.name,
          })),
        );
      } catch {
        toast.error('Error al cargar materiales.');
        setMaterials([]);
      } finally {
        setLoadingMaterials(false);
      }
    };
    void load();
  }, []);

  const loadKardex = useCallback(async () => {
    const materialId = parseInt(selectedMaterialId, 10);
    if (Number.isNaN(materialId)) {
      setEntries([]);
      return;
    }
    setLoadingKardex(true);
    try {
      const fromParam = dateFrom ? `${dateFrom}T00:00:00` : undefined;
      const toParam = dateTo ? `${dateTo}T23:59:59` : undefined;
      const data = await inventoryService.getKardex(materialId, fromParam, toParam);
      setEntries(data.entries || []);
      setMaterialLabel(`${data.material_sku} — ${data.material_name}`);
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al cargar Kárdex.');
      setEntries([]);
    } finally {
      setLoadingKardex(false);
    }
  }, [selectedMaterialId, dateFrom, dateTo]);

  useEffect(() => {
    if (selectedMaterialId) {
      void loadKardex();
    } else {
      setEntries([]);
      setMaterialLabel('');
    }
  }, [selectedMaterialId, loadKardex]);

  const columns: VTableColumn<KardexEntryRead>[] = useMemo(
    () => [
      {
        key: 'created_at',
        label: 'Fecha',
        sortable: true,
        render: (row) => formatDate(row.created_at),
      },
      {
        key: 'transaction_type',
        label: 'Tipo',
        sortable: true,
        render: (row) => (
          <span
            className={`inline-flex rounded border px-2 py-0.5 text-xs font-bold uppercase ${getMovementColor(row)}`}
          >
            {formatMovementLabel(row)}
          </span>
        ),
      },
      {
        key: 'quantity',
        label: 'Cantidad',
        sortable: true,
        render: (row) => {
          const color = (row.quantity ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600';
          return <span className={`font-bold ${color}`}>{formatInventoryCurrency(row.quantity)}</span>;
        },
      },
      {
        key: 'unit_cost',
        label: 'Costo unit.',
        render: (row) => `$${formatInventoryCurrency(row.unit_cost)}`,
      },
      {
        key: 'subtotal',
        label: 'Subtotal',
        render: (row) => `$${formatInventoryCurrency(row.subtotal)}`,
      },
      {
        key: 'saldo_acumulado',
        label: 'Saldo acum.',
        sortable: true,
        render: (row) => (
          <span className="font-bold text-slate-800">{formatInventoryCurrency(row.saldo_acumulado)}</span>
        ),
      },
      {
        key: 'reference',
        label: 'Referencia',
        render: (row) => formatReference(row),
      },
      {
        key: 'usuario',
        label: 'Usuario',
        render: (row) => row.operator_name || '—',
      },
    ],
    [],
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <BookOpen className="text-indigo-600" size={32} />
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Kárdex de Materiales</h1>
            <p className="text-slate-500 mt-1 font-medium">Historial de movimientos por material.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/inventory')}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
        >
          <ArrowLeft size={18} /> Regresar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
            Material
          </label>
          {loadingMaterials ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Cargando...
            </div>
          ) : (
            <SearchableSelect
              items={materials}
              value={selectedMaterialId}
              onChange={setSelectedMaterialId}
              getValue={(m) => String(m.id)}
              getLabel={(m) => `${m.sku} — ${m.name}`}
              placeholder="Buscar material (SKU o nombre)..."
            />
          )}
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
            Desde
          </label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
            Hasta
          </label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {selectedMaterialId && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-600">{materialLabel}</p>
          <button
            type="button"
            onClick={() => void loadKardex()}
            disabled={loadingKardex}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loadingKardex ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      )}

      {!selectedMaterialId ? (
        <VEmptyState
          icon={<BookOpen className="text-slate-300" size={48} />}
          title="Selecciona un material"
          description="Elige un material para ver su historial de movimientos."
        />
      ) : loadingKardex ? (
        <VEmptyState
          icon={<Loader2 className="animate-spin text-slate-300" size={48} />}
          title="Cargando movimientos..."
        />
      ) : entries.length === 0 ? (
        <VEmptyState
          title="Sin movimientos"
          description="No hay registros en el rango seleccionado."
        />
      ) : (
        <VTable columns={columns} data={entries as KardexEntryRead[]} />
      )}
    </div>
  );
}
