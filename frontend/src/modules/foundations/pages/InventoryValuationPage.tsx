import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, DollarSign, Loader2, Pencil, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '@/api/axios-client';
import { formatInventoryCurrency } from '@/api/inventory-service';
import { Material } from '@/types/foundations';
import { Input } from '@/components/ui/Input';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VTable, VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import { MaterialForm } from '../components/MaterialForm';

interface ValuationRow extends Record<string, unknown> {
  id: number;
  sku: string;
  name: string;
  physical_stock: number;
  usage_unit: string;
  unit_cost: number;
  total_value: number;
}

const formatQty = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const computeUnitCost = (mat: Material): number => {
  const factor = mat.conversion_factor && mat.conversion_factor !== 0 ? mat.conversion_factor : 1;
  return (mat.current_cost ?? 0) / factor;
};

export default function InventoryValuationPage() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosClient.get('/foundations/materials');
      const rows = Array.isArray(response.data) ? response.data : [];
      setMaterials(rows as Material[]);
    } catch {
      toast.error('Error al cargar materiales.');
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  const valuationRows = useMemo((): ValuationRow[] => {
    const term = search.trim().toLowerCase();
    return materials
      .filter((m) => m.is_active && (m.physical_stock ?? 0) > 0)
      .filter((m) => {
        if (!term) return true;
        return (
          m.sku.toLowerCase().includes(term) ||
          m.name.toLowerCase().includes(term)
        );
      })
      .map((m) => {
        const unitCost = computeUnitCost(m);
        const stock = m.physical_stock ?? 0;
        return {
          id: m.id!,
          sku: m.sku,
          name: m.name,
          physical_stock: stock,
          usage_unit: m.usage_unit,
          unit_cost: unitCost,
          total_value: stock * unitCost,
        };
      })
      .sort((a, b) => b.total_value - a.total_value);
  }, [materials, search]);

  const totals = useMemo(
    () => ({
      count: valuationRows.length,
      value: valuationRows.reduce((sum, row) => sum + row.total_value, 0),
    }),
    [valuationRows],
  );

  const columns: VTableColumn<ValuationRow>[] = useMemo(
    () => [
      {
        key: 'sku',
        label: 'SKU',
        sortable: true,
        render: (row) => <span className="font-mono text-xs font-bold text-indigo-600">{row.sku}</span>,
      },
      {
        key: 'name',
        label: 'Material',
        sortable: true,
        render: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: 'physical_stock',
        label: 'Stock',
        sortable: true,
        render: (row) => formatQty(row.physical_stock),
      },
      {
        key: 'usage_unit',
        label: 'Unidad',
        render: (row) => row.usage_unit || '—',
      },
      {
        key: 'unit_cost',
        label: 'Costo Unit.',
        sortable: true,
        render: (row) => `$${formatInventoryCurrency(row.unit_cost)}`,
      },
      {
        key: 'total_value',
        label: 'Valor Total',
        sortable: true,
        render: (row) => (
          <span className="font-bold text-slate-800">${formatInventoryCurrency(row.total_value)}</span>
        ),
      },
      {
        key: 'actions',
        label: 'Acciones',
        width: '80px',
        render: (row) => (
          <button
            type="button"
            title="Editar material"
            onClick={() => setEditingMaterialId(row.id)}
            className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
          >
            <Pencil size={16} />
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <DollarSign className="text-orange-600" size={32} />
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Valuación de Inventario</h1>
            <p className="text-slate-500 mt-1 font-medium">
              Detalle por artículo — stock × costo unitario de uso.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/inventory', { state: { openSection: 'INVENTORY_HUB' } })}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
        >
          <ArrowLeft size={18} /> Regresar
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por SKU o nombre..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <VEmptyState
          icon={<Loader2 className="animate-spin text-slate-300" size={48} />}
          title="Cargando valuación..."
        />
      ) : valuationRows.length === 0 ? (
        <VEmptyState
          icon={<DollarSign className="text-slate-300" size={48} />}
          title="Sin materiales con stock"
          description={
            search.trim()
              ? 'No hay resultados para la búsqueda.'
              : 'No hay materiales activos con stock mayor a cero.'
          }
        />
      ) : (
        <>
          <VTable columns={columns} data={valuationRows} />

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">
                Total materiales
              </p>
              <p className="text-2xl font-black text-orange-900">{totals.count}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">
                Valor total del inventario
              </p>
              <p className="text-2xl font-black text-orange-900">
                ${formatInventoryCurrency(totals.value)}
              </p>
            </div>
          </div>
        </>
      )}

      {editingMaterialId != null && (
        <MaterialForm
          materialId={editingMaterialId}
          onCancel={() => setEditingMaterialId(null)}
          onCreated={() => {
            setEditingMaterialId(null);
            toast.success('Material actualizado.');
            void loadMaterials();
          }}
        />
      )}
    </div>
  );
}
