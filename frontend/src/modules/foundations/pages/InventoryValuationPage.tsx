import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, DollarSign, Pencil, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  inventoryService,
  type InProcessLine,
  type NegativeStockReport,
  type RawMaterialLine,
  type StockAuthorization,
  type ValuationSummary,
} from '@/api/inventory-service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VSummaryCard } from '@/components/ui/VSummaryCard';
import { formatMoney } from '@/utils/format';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VTable, VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import { MaterialForm } from '../components/MaterialForm';

type Section = 'RAW' | 'WIP' | 'FINISHED' | 'NEGATIVE';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'RAW', label: 'Materia prima' },
  { key: 'WIP', label: 'Producción en proceso' },
  { key: 'FINISHED', label: 'Producto terminado' },
  { key: 'NEGATIVE', label: 'Existencias negativas' },
];

const formatQty = (value: number): string =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const money = (value: number): string => formatMoney(value);

const inProcessColumns: VTableColumn<InProcessLine>[] = [
  { key: 'instance_name', label: 'Instancia', sortable: true, render: (r) => <span className="font-medium">{r.instance_name}</span> },
  { key: 'batch_folio', label: 'Lote', sortable: true, render: (r) => <span className="font-mono text-xs">{r.batch_folio}</span> },
  { key: 'value', label: 'Valor de receta', sortable: true, render: (r) => <span className="font-bold">{money(r.value)}</span> },
];

const authorizationColumns: VTableColumn<StockAuthorization>[] = [
  { key: 'created_at', label: 'Fecha', render: (r) => new Date(r.created_at).toLocaleString('es-MX') },
  { key: 'batch_folio', label: 'Lote', render: (r) => <span className="font-mono text-xs">{r.batch_folio}</span> },
  { key: 'authorized_by', label: 'Autorizó', render: (r) => r.authorized_by },
  { key: 'reason', label: 'Motivo', render: (r) => r.reason },
  {
    key: 'shortages',
    label: 'Faltantes',
    render: (r) => r.shortages.map((s) => `${s.sku}: ${formatQty(s.missing)} ${s.usage_unit}`).join(' · '),
  },
];

export default function InventoryValuationPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ValuationSummary | null>(null);
  const [negatives, setNegatives] = useState<NegativeStockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('RAW');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, negativeData] = await Promise.all([
        inventoryService.getValuationSummary(dateFrom || undefined, dateTo || undefined),
        inventoryService.getNegativeStock(),
      ]);
      setSummary(summaryData);
      setNegatives(negativeData);
    } catch (err: any) {
      toast.error(err?.response?.status === 403 ? 'No tienes permisos para ver la valuación.' : 'Error al cargar la valuación.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const rawColumns: VTableColumn<RawMaterialLine>[] = useMemo(
    () => [
      { key: 'sku', label: 'SKU', sortable: true, render: (r) => <span className="font-mono text-xs font-bold text-indigo-600">{r.sku}</span> },
      { key: 'name', label: 'Material', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'stock', label: 'Stock', sortable: true, render: (r) => formatQty(r.stock) },
      { key: 'usage_unit', label: 'Unidad', render: (r) => r.usage_unit || '—' },
      { key: 'usage_unit_cost', label: 'Costo unit. (uso)', sortable: true, render: (r) => money(r.usage_unit_cost) },
      { key: 'value', label: 'Valor', sortable: true, render: (r) => <span className="font-bold text-slate-800">{money(r.value)}</span> },
      {
        key: 'actions',
        label: 'Acciones',
        width: '80px',
        render: (r) => (
          <button
            type="button"
            title="Editar material"
            onClick={() => setEditingMaterialId(r.material_id)}
            className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
          >
            <Pencil size={16} />
          </button>
        ),
      },
    ],
    [],
  );

  const term = search.trim().toLowerCase();
  const rawRows = useMemo(
    () => (summary?.raw_material_lines ?? []).filter((r) => !term || r.sku.toLowerCase().includes(term) || r.name.toLowerCase().includes(term)),
    [summary, term],
  );

  const renderSection = () => {
    if (!summary) return null;
    if (section === 'RAW') {
      return (
        <>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por SKU o nombre..." className="pl-9" />
          </div>
          <VTable columns={rawColumns} data={rawRows} emptyState={{ title: 'Sin materiales con stock' }} />
        </>
      );
    }
    if (section === 'WIP' || section === 'FINISHED') {
      const rows = section === 'WIP' ? summary.work_in_progress_lines : summary.finished_goods_lines;
      return (
        <VTable
          columns={inProcessColumns}
          data={rows}
          emptyState={{
            title: section === 'WIP' ? 'Sin producción en proceso' : 'Sin producto terminado',
            description: 'La receta se descarga del almacén cuando el lote entra a producción.',
          }}
        />
      );
    }
    return (
      <div className="space-y-6">
        <VTable
          columns={rawColumns.filter((c) => c.key !== 'actions')}
          data={negatives?.materials ?? []}
          emptyState={{ title: 'Sin existencias negativas' }}
        />
        <div className="space-y-2">
          <h2 className="text-sm font-black uppercase text-slate-600">Autorizaciones de producción sin stock</h2>
          <VTable columns={authorizationColumns} data={negatives?.authorizations ?? []} emptyState={{ title: 'Sin autorizaciones' }} />
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <DollarSign className="text-orange-600" size={32} />
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Valuación de Inventario</h1>
            <p className="text-slate-500 mt-1 font-medium">
              Materia prima, producción en proceso y producto terminado — todo es activo hasta que se carga para instalar.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate('/inventory', { state: { openSection: 'INVENTORY_HUB' } })}>
          <ArrowLeft size={18} /> Regresar
        </Button>
      </div>

      {loading && !summary ? (
        <VEmptyState icon={<DollarSign className="text-slate-300" size={48} />} title="Cargando valuación..." />
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <VSummaryCard label="Materia prima" value={money(summary.raw_materials)} tone="orange" />
            <VSummaryCard label="Producción en proceso" value={money(summary.work_in_progress)} tone="indigo" />
            <VSummaryCard label="Producto terminado" value={money(summary.finished_goods)} tone="emerald" />
            <VSummaryCard label="Total inventario" value={money(summary.total)} tone="total" />
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Costo de venta (cargado para instalar)</p>
              <p className="text-xl font-black text-slate-800">{money(summary.cost_of_sales)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Merma por reversas</p>
              <p className="text-xl font-black text-slate-800">{money(summary.waste)}</p>
            </div>
            <div className="flex items-end gap-2 ml-auto">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Desde</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Hasta</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <Button key={s.key} variant={section === s.key ? 'default' : 'outline'} onClick={() => setSection(s.key)}>
                {s.label}
                {s.key === 'NEGATIVE' && summary.negative_stock_materials > 0 && (
                  <span className="ml-1 rounded-full bg-red-600 px-2 text-[10px] font-black text-white">
                    {summary.negative_stock_materials}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {renderSection()}
        </>
      ) : (
        <VEmptyState icon={<DollarSign className="text-slate-300" size={48} />} title="Sin datos de valuación" />
      )}

      {editingMaterialId != null && (
        <MaterialForm
          materialId={editingMaterialId}
          onCancel={() => setEditingMaterialId(null)}
          onCreated={() => {
            setEditingMaterialId(null);
            toast.success('Material actualizado.');
            void loadData();
          }}
        />
      )}
    </div>
  );
}
