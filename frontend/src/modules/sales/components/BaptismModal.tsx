/**
 * BaptismModal  —  Asignación de Alias ("Bautizo") de Instancias
 *
 * Modal reutilizado desde:
 *  1. SalesDashboardPage → tarjeta "Monitor Operativo"
 *  2. SalesOrderDetailModal → botón "Gestionar Identidad / Bautizar"
 *  3. SimulatorPage → botón "Bautizo Masivo"
 */
import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { salesService } from '../../../api/sales-service';
import { planningService, BaptismEntry } from '../../../api/planning-service';
import { SalesOrder } from '../../../types/sales';

interface Props {
  orderId: number;
  order: SalesOrder | null;
  onClose: () => void;
  onComplete: () => void;
}

interface InstanceRow {
  id: number;
  custom_name: string;
  product_name: string;
}

export default function BaptismModal({ orderId, order: orderProp, onClose, onComplete }: Props) {
  const [order, setOrder] = useState<any>(orderProp);
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load order detail if not already hydrated with instances
  useEffect(() => {
    const hasInstances = (orderProp?.items ?? []).some((it: any) => (it.instances ?? []).length > 0);
    if (hasInstances) {
      hydrateRows(orderProp as any);
    } else {
      setLoading(true);
      salesService.getOrderDetail(orderId)
        .then((data: any) => {
          setOrder(data);
          hydrateRows(data);
        })
        .catch(() => setError('Error al cargar las instancias de esta OV.'))
        .finally(() => setLoading(false));
    }
  }, [orderId]);

  function hydrateRows(data: any) {
    const all: InstanceRow[] = [];
    (data?.items ?? []).forEach((item: any) => {
      (item.instances ?? []).forEach((inst: any) => {
        all.push({
          id: inst.id,
          custom_name: inst.custom_name ?? '',
          product_name: item.product_name ?? 'Producto',
        });
      });
    });
    setRows(all);
  }

  const handleNameChange = (id: number, value: string) => {
    setSaved(false);
    setRows(prev => prev.map(r => r.id === id ? { ...r, custom_name: value } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: BaptismEntry[] = rows.map(r => ({
        instance_id: r.id,
        custom_name: r.custom_name.trim() || r.custom_name,
      }));
      await planningService.baptizeInstances(orderId, payload);
      setSaved(true);
      setTimeout(() => onComplete(), 600);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al guardar los alias.');
    } finally {
      setSaving(false);
    }
  };

  const allFilled = rows.every(r => r.custom_name.trim().length > 0);
  const filledCount = rows.filter(r => r.custom_name.trim().length > 0).length;
  const projectName = (order as any)?.project_name ?? `OV-${String(orderId).padStart(4, '0')}`;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Gestionar Identidad — Bautizo de Instancias"
      size="custom"
      className="w-[95vw] max-w-2xl"
    >
      {/* Sub-header */}
      <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3">
        <span className="text-2xl">🏷️</span>
        <div>
          <p className="text-sm font-bold text-indigo-800">{projectName}</p>
          <p className="text-xs text-indigo-600 mt-0.5">
            Asigna un alias descriptivo a cada instancia antes de enviarlas a la Planeación Maestra.
            Ejemplo: <em>"Casa 123, Calle 98 — Cocina Integral"</em>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-slate-700 mr-3" />
          Cargando instancias...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <p className="text-sm">Esta OV no tiene instancias generadas todavía.</p>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.round((filledCount / rows.length) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 shrink-0">{filledCount}/{rows.length} nombradas</span>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[2fr_3fr] text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-slate-50 px-4 py-2 border-b border-slate-200">
              <span>Producto</span>
              <span>Alias / Ubicación</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {rows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-[2fr_3fr] items-center gap-3 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-700 truncate">{row.product_name}</p>
                    <p className="text-[10px] text-slate-400">Instancia #{idx + 1}</p>
                  </div>
                  <input
                    type="text"
                    value={row.custom_name}
                    onChange={e => handleNameChange(row.id, e.target.value)}
                    placeholder={`Alias #${idx + 1}...`}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !allFilled || saved}
              className={`
                px-5 py-2 rounded-xl text-sm font-bold transition-all
                ${saved
                  ? 'bg-green-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'}
              `}
            >
              {saving ? 'Guardando...' : saved ? '✓ Alias guardados' : `Confirmar ${rows.length} instancias`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
