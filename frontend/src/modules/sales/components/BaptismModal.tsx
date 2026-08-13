/**
 * BaptismModal  —  Asignación de Alias ("Bautizo") de Instancias
 *
 * Modal reutilizado desde:
 *  1. SalesDashboardPage → tarjeta "Monitor Operativo"
 *  2. SalesOrderDetailModal → botón "Gestionar Identidad / Bautizar"
 *  3. SimulatorPage → botón "Bautizo Masivo"
 *
 * FLUJO DE BAUTIZO POR CASA (calle + lote):
 *  - Se captura Calle + Lote de una casa.
 *  - "Sugerir una de cada tipo" preselecciona una instancia sin asignar de cada
 *    product_name distinto (las casas son idénticas). El usuario ajusta con checkboxes.
 *  - "Asignar a esta casa" pone street/lot a las seleccionadas y arma el custom_name
 *    con el formato: "<product_name>, <calle>, <lote>".
 *  - Las instancias asignadas se agrupan por casa (street+lot). Las que no tienen
 *    casa quedan en "Sin asignar".
 */
import { useEffect, useMemo, useState } from 'react';
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
  product_name: string;   // nombre de la partida (base del custom_name)
  custom_name: string;    // alias final (se arma al asignar casa)
  street: string | null;
  lot: string | null;
}

// Construye el custom_name con el formato pactado: "<producto>, <calle>, <lote>"
function buildCustomName(productName: string, street: string, lot: string): string {
  const parts = [productName.trim()];
  if (street.trim()) parts.push(street.trim());
  if (lot.trim()) parts.push(lot.trim());
  return parts.join(', ');
}

export default function BaptismModal({ orderId, order: orderProp, onClose, onComplete }: Props) {
  const [order, setOrder] = useState<any>(orderProp);
  const [rows, setRows] = useState<InstanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Captura de la casa en curso
  const [newStreet, setNewStreet] = useState('');
  const [newLot, setNewLot] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Cargar detalle de la OV si no viene hidratado con instancias
  useEffect(() => {
    setLoading(true);
    salesService.getOrderDetail(orderId)
      .then((data: any) => {
        setOrder(data);
        hydrateRows(data);
      })
      .catch(() => setError('Error al cargar las instancias de esta OV.'))
      .finally(() => setLoading(false));
  }, [orderId]);

  function hydrateRows(data: any) {
    const all: InstanceRow[] = [];
    (data?.items ?? []).forEach((item: any) => {
      (item.instances ?? []).forEach((inst: any) => {
        all.push({
          id: inst.id,
          product_name: item.product_name ?? 'Producto',
          custom_name: inst.custom_name ?? '',
          street: inst.street ?? null,
          lot: inst.lot ?? null,
        });
      });
    });
    setRows(all);
  }

  // Instancias sin asignar (sin street/lot): el "pool" para armar casas
  const unassigned = useMemo(
    () => rows.filter(r => !r.street && !r.lot),
    [rows]
  );

  // Instancias ya agrupadas por casa (street+lot)
  const houses = useMemo(() => {
    const map = new Map<string, { street: string; lot: string; items: InstanceRow[] }>();
    rows.forEach(r => {
      if (r.street || r.lot) {
        const key = `${r.street ?? ''}||${r.lot ?? ''}`;
        if (!map.has(key)) map.set(key, { street: r.street ?? '', lot: r.lot ?? '', items: [] });
        map.get(key)!.items.push(r);
      }
    });
    return Array.from(map.values());
  }, [rows]);

  // Sugerir: una instancia sin asignar de cada product_name distinto
  const handleSuggest = () => {
    const seen = new Set<string>();
    const next = new Set<number>();
    unassigned.forEach(r => {
      if (!seen.has(r.product_name)) {
        seen.add(r.product_name);
        next.add(r.id);
      }
    });
    setSelected(next);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Asignar los seleccionados a la casa (street+lot), armar custom_name y GUARDAR ya.
  const handleAssignHouse = async () => {
    setError(null);
    if (!newStreet.trim() || !newLot.trim()) {
      setError('Captura la calle y el lote de la casa antes de asignar.');
      return;
    }
    if (selected.size === 0) {
      setError('Selecciona al menos una instancia para la casa.');
      return;
    }
    const street = newStreet.trim();
    const lot = newLot.trim();
    // Instancias de esta casa (las seleccionadas), con su nombre armado
    const payload: BaptismEntry[] = rows
      .filter(r => selected.has(r.id))
      .map(r => ({
        instance_id: r.id,
        custom_name: buildCustomName(r.product_name, street, lot),
        street,
        lot,
      }));
    setSaving(true);
    try {
      await planningService.baptizeInstances(orderId, payload);
      // Éxito: reflejar en pantalla
      setRows(prev => prev.map(r => {
        if (selected.has(r.id)) {
          return { ...r, street, lot, custom_name: buildCustomName(r.product_name, street, lot) };
        }
        return r;
      }));
      setNewStreet('');
      setNewLot('');
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'No se pudo guardar la casa. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Deshacer una casa: revertir en la BD (street/lot vacíos -> NULL) y en pantalla.
  const handleUnassignHouse = async (street: string, lot: string) => {
    setError(null);
    const affected = rows.filter(r => (r.street ?? '') === street && (r.lot ?? '') === lot);
    if (affected.length === 0) return;
    const payload: BaptismEntry[] = affected.map(r => ({
      instance_id: r.id,
      custom_name: r.product_name,   // vuelve al nombre base de la partida
      street: '',                     // vacío -> el backend lo pone en NULL
      lot: '',
    }));
    setSaving(true);
    try {
      await planningService.baptizeInstances(orderId, payload);
      setRows(prev => prev.map(r => {
        if ((r.street ?? '') === street && (r.lot ?? '') === lot) {
          return { ...r, street: null, lot: null, custom_name: '' };
        }
        return r;
      }));
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'No se pudo deshacer la casa.');
    } finally {
      setSaving(false);
    }
  };

  const assignedCount = rows.filter(r => r.street && r.lot).length;
  const projectName = (order as any)?.project_name ?? `OV-${String(orderId).padStart(4, '0')}`;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Gestionar Identidad — Bautizo por Casa"
      size="custom"
      className="w-[95vw] max-w-3xl"
    >
      {/* Sub-header */}
      <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3">
        <span className="text-2xl">🏘️</span>
        <div>
          <p className="text-sm font-bold text-indigo-800">{projectName}</p>
          <p className="text-xs text-indigo-600 mt-0.5">
            Arma cada casa: captura <strong>Calle</strong> y <strong>Lote</strong>, elige sus muebles
            (puedes usar "Sugerir una de cada tipo" y ajustar), y asígnalos. El nombre se arma solo
            como <em>"Producto, Calle, Lote"</em>.
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
          {/* Captura de nueva casa */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">Nueva casa</p>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Calle</label>
                <input
                  type="text"
                  value={newStreet}
                  onChange={e => setNewStreet(e.target.value)}
                  placeholder="Ej. Calle 98"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Lote</label>
                <input
                  type="text"
                  value={newLot}
                  onChange={e => setNewLot(e.target.value)}
                  placeholder="Ej. E-195"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                onClick={handleSuggest}
                className="h-[38px] px-3 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap"
              >
                Sugerir una de c/tipo
              </button>
            </div>
          </div>

          {/* Pool de instancias sin asignar */}
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
            Sin asignar ({unassigned.length}) — elige los muebles de esta casa
          </p>
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-3">
            <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {unassigned.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-400">Todas las instancias están asignadas a una casa.</div>
              ) : (
                unassigned.map(row => {
                  const on = selected.has(row.id);
                  return (
                    <label
                      key={row.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${on ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleSelect(row.id)}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span className="text-sm text-slate-700">{row.product_name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <button
            onClick={handleAssignHouse}
            disabled={selected.size === 0 || !newStreet.trim() || !newLot.trim()}
            className="w-full h-[42px] mb-4 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Asignar {selected.size > 0 ? `${selected.size} ` : ''}seleccionados
            {newStreet.trim() && newLot.trim() ? ` a ${newStreet.trim()}, ${newLot.trim()}` : ' a esta casa'}
          </button>

          {/* Casas armadas */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Casas armadas ({houses.length})
            </p>
            <span className="text-[10px] text-slate-400">{assignedCount}/{rows.length} instancias asignadas</span>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {houses.length === 0 ? (
              <div className="text-xs text-slate-400 px-1 py-2">Aún no armas ninguna casa.</div>
            ) : (
              houses.map((h, i) => (
                <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-[13px] font-bold text-slate-700">
                      🏠 {h.street}{h.street && h.lot ? ', ' : ''}{h.lot}
                      <span className="text-slate-400 font-normal"> · {h.items.length} muebles</span>
                    </span>
                    <button
                      onClick={() => handleUnassignHouse(h.street, h.lot)}
                      className="text-[10px] text-rose-500 hover:text-rose-700 font-bold uppercase"
                    >
                      Deshacer
                    </button>
                  </div>
                  {h.items.map(it => (
                    <div key={it.id} className="px-3 py-1.5 pl-8 text-[13px] text-slate-500 border-t border-slate-50">
                      {it.custom_name}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">
              {assignedCount}/{rows.length} instancia(s) asignada(s). Cada casa se guarda al asignar.
            </span>
            <button
              onClick={() => { onComplete(); onClose(); }}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Cerrar'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
