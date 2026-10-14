import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { designService, PendingInstance, SimulateBatchResponse } from '../../../api/design-service';
import { productionService } from '../../../api/production-service';
import { toast } from '@/components/ui/VToast';
import { coreShortages, shortageText, type CoreShortage } from '../utils/coreShortage';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import axiosClient from '@/api/axios-client';
import { formatQty } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { Package, CheckSquare, Square, AlertTriangle, ShieldCheck, Factory, Beaker, ArrowLeft, Calculator } from 'lucide-react';

/** Devuelve el emoji del foco según el color del semáforo. */
function semaphoreDot(color?: string | null): string {
  switch (color) {
    case 'RED':         return '🔴';
    case 'YELLOW':      return '🟡';
    case 'GRAY':        return '⬜';
    case 'BLUE':        return '🔵';
    case 'BLUE_GREEN':  return '🔵🟢';
    case 'DOUBLE_BLUE': return '🔵🔵';
    case 'GREEN':       return '🟢';
    case 'DOUBLE_GREEN':return '🟢🟢';
    case 'WARRANTY':    return '⚠️';
    default:            return '⬜';
  }
}

/** True si la instancia tiene al menos una fecha programada. */
function isScheduled(inst: { schedule?: { PM: string | null; PP: string | null; IM: string | null; IP: string | null } | null }): boolean {
  const s = inst.schedule;
  if (!s) return false;
  return !!(s.PM || s.PP || s.IM || s.IP);
}

/** Devuelve un semáforo "efectivo" — si GRAY + schedule, lo tratamos como SCHEDULED (púrpura). */
function effectiveSemaphore(inst: { semaphore?: string | null; schedule?: { PM: string | null; PP: string | null; IM: string | null; IP: string | null } | null }): string {
  if (inst.semaphore === 'GRAY' && isScheduled(inst)) return 'SCHEDULED';
  return inst.semaphore ?? 'GRAY';
}

function semaphoreDotWithScheduled(color: string): string {
  if (color === 'SCHEDULED') return '🟣';
  return semaphoreDot(color);
}

export default function SimulatorPage() {
  const navigate = useNavigate(); 
  
  const [pendingByType, setPendingByType] = useState<{ MDF: PendingInstance[]; PIEDRA: PendingInstance[] }>({
    MDF: [],
    PIEDRA: [],
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchType, setBatchType] = useState<'MDF' | 'PIEDRA'>('MDF');
  /** Tipo de material activo por OV (badge MDF o Piedra). */
  const [orderMaterialViews, setOrderMaterialViews] = useState<Record<number, 'MDF' | 'PIEDRA'>>({});
  
  const [simulationResult, setSimulationResult] = useState<SimulateBatchResponse | null>(null);
  // D30: missing core material (MDF or stone) blocks creating the batch; hardware and the rest may go negative.
  const shortages = coreShortages(simulationResult?.materials);
  const [simulatedKey, setSimulatedKey] = useState('');
  const [loadingRadar, setLoadingRadar] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── Renombrado inline ───────────────────────────────────────────────


  // ── Agrupación por OV ───────────────────────────────────────────────
  const [expandedOrderIds, setExpandedOrderIds] =
    useState<Set<number>>(new Set());

  const scrollOvCardIntoView = (orderId: number) => {
    setTimeout(() => {
      const element = document.getElementById(`ov-card-${orderId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const toggleOrderExpand = (orderId: number) => {
    setExpandedOrderIds(prev => {
      const expanding = !prev.has(orderId);
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      if (expanding) {
        setOrderMaterialViews(views => {
          if (views[orderId]) return views;
          const mdf = mdfCountByOrder.get(orderId) ?? 0;
          const stone = stoneCountByOrder.get(orderId) ?? 0;
          const initial: 'MDF' | 'PIEDRA' = mdf > 0 ? 'MDF' : 'PIEDRA';
          if (mdf === 0 && stone === 0) return views;
          return { ...views, [orderId]: initial };
        });
        scrollOvCardIntoView(orderId);
      }
      return next;
    });
  };

  const toggleOrderMaterialBadge = (
    orderId: number,
    material: 'MDF' | 'PIEDRA',
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setBatchType(material);
    setSimulationResult(null);
    setExpandedOrderIds(prev => new Set(prev).add(orderId));
    setOrderMaterialViews(prev => ({ ...prev, [orderId]: material }));
    scrollOvCardIntoView(orderId);
  };

  useEffect(() => {
    loadPendingInstances();
    setSelectedIds([]);
    setSimulationResult(null);
  }, []);

  const loadPendingInstances = async () => {
    setLoadingRadar(true);
    try {
      const [mdf, piedra] = await Promise.all([
        designService.getPendingInstances('MDF'),
        designService.getPendingInstances('PIEDRA'),
      ]);
      setPendingByType({ MDF: mdf, PIEDRA: piedra });
    } catch {
      toast.error('Error al cargar el radar de instancias pendientes.');
    } finally {
      setLoadingRadar(false);
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setSimulationResult(null); 
  };

  const resolveBatchTypeForSelection = (): 'MDF' | 'PIEDRA' | null => {
    const mdfIds = new Set(pendingByType.MDF.map(p => p.id));
    const piedraIds = new Set(pendingByType.PIEDRA.map(p => p.id));
    // An instance with both tracks is pending in both lists and fits either line; only single-track ones decide.
    let onlyMdf = false;
    let onlyPiedra = false;
    for (const id of selectedIds) {
      if (mdfIds.has(id) && !piedraIds.has(id)) onlyMdf = true;
      if (piedraIds.has(id) && !mdfIds.has(id)) onlyPiedra = true;
    }
    if (onlyMdf && onlyPiedra) return null;
    if (onlyPiedra) return 'PIEDRA';
    if (onlyMdf) return 'MDF';
    return batchType;
  };

  const handleSimulate = async () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecciona al menos una instancia');
      return;
    }
    const line = resolveBatchTypeForSelection();
    if (!line) {
      toast.warning('Selecciona instancias de un solo tipo: MDF o Piedra.');
      return;
    }
    setBatchType(line);

    setSimulating(true);
    try {
      const result = await designService.simulateBatch(selectedIds, line);
      setSimulationResult(result);
      setSimulatedKey(`${line}:${[...selectedIds].sort((a, b) => a - b).join(',')}`);
      setRequestedIds([]);
    } catch (error: any) {
      toast.error(errorText(error, 'Error al simular el lote. Verifica la conexión.'));
    } finally {
      setSimulating(false);
    }
  };

  /** Server error as plain text (FastAPI may send a list of validation errors). */
  const errorText = (error: any, fallback: string): string => {
    const detail = error?.response?.data?.detail ?? error?.message;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) return detail.map((d) => d?.msg ?? String(d)).join(' · ') || fallback;
    return fallback;
  };

  // H18: the batch is created from the simulated selection only, and it always ends in a success or error message.
  const createBatch = async (line: 'MDF' | 'PIEDRA') => {
    if (!simulationResult || simulatedKey !== selectionKey) {
      toast.warning('La selección cambió: vuelve a simular antes de crear el lote.');
      return;
    }
    if (shortages.length > 0) return;
    setCreating(true);
    let folio: string | null = null;
    const failed: string[] = [];
    try {
      const newBatch = await productionService.createBatch({
        batch_type: line,
        estimated_merma_percent: line === 'MDF' ? 5.0 : 0.0,
      });
      folio = newBatch.folio;
      for (const instanceId of selectedIds) {
        try {
          await productionService.assignInstanceToBatch(newBatch.id, instanceId);
        } catch (error: any) {
          const name = allPendingInstances.find((p) => p.id === instanceId)?.custom_name ?? `#${instanceId}`;
          failed.push(`${name}: ${errorText(error, 'no se pudo agregar')}`);
        }
      }
      if (failed.length > 0) {
        toast.error(`Lote ${folio} creado, pero faltaron casas. ${failed.join(' | ')}`);
      } else {
        toast.success(`Lote ${folio} ${line === 'PIEDRA' ? 'de piedra ' : ''}creado en "Lote por producir"; Producción le da entrada en su tablero.`);
      }
      setSelectedIds([]);
      setSimulationResult(null);
      await loadPendingInstances();
    } catch (error: any) {
      toast.error(errorText(error, folio ? `Lote ${folio}: error al agregar las casas.` : 'No se pudo crear el lote.'));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBatch = () => createBatch('MDF');
  const handleCreateStoneBatch = () => createBatch('PIEDRA');



  const mdfCountByOrder = useMemo(() => {
    const counts = new Map<number, number>();
    for (const inst of pendingByType.MDF) {
      counts.set(inst.order_id, (counts.get(inst.order_id) ?? 0) + 1);
    }
    return counts;
  }, [pendingByType.MDF]);

  const stoneCountByOrder = useMemo(() => {
    const counts = new Map<number, number>();
    for (const inst of pendingByType.PIEDRA) {
      counts.set(inst.order_id, (counts.get(inst.order_id) ?? 0) + 1);
    }
    return counts;
  }, [pendingByType.PIEDRA]);

  const allPendingInstances = useMemo(
    () => [...pendingByType.MDF, ...pendingByType.PIEDRA],
    [pendingByType],
  );

  // D31: with a core shortage, ask Compras for it (confirmed: Design may only be trying combinations).
  const [requisitionFor, setRequisitionFor] = useState<CoreShortage | null>(null);
  const [requestedIds, setRequestedIds] = useState<number[]>([]);
  const selectionKey = `${batchType}:${[...selectedIds].sort((a, b) => a - b).join(',')}`;
  const selectedOrderIds = Array.from(new Set(allPendingInstances
    .filter((p) => selectedIds.includes(p.id)).map((p) => p.order_id)));
  const orderFolios = selectedOrderIds.map((id) => `OV-${String(id).padStart(4, '0')}`).join(', ');

  const createRequisition = async () => {
    if (!requisitionFor) return;
    try {
      await axiosClient.post('/purchases/requisitions/', {
        material_id: requisitionFor.materialId,
        requested_quantity: requisitionFor.purchaseQty,
        sales_order_id: selectedOrderIds.length === 1 ? selectedOrderIds[0] : null,
        notes: `[SIMULADOR] Faltante para el lote de ${orderFolios}`,
      });
      setRequestedIds((prev) => [...prev, requisitionFor.materialId]);
      toast.success(`Requisición enviada a Compras: ${formatQty(requisitionFor.purchaseQty)} ${requisitionFor.purchaseUnit} de ${requisitionFor.name}.`);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'No se pudo generar la requisición.');
    } finally {
      setRequisitionFor(null);
    }
  };

  const instancesByOrder = useMemo(() => {
    const metadata = new Map<number, {
      order_id: number;
      order_project_name: string;
      client_name: string | null;
    }>();
    for (const inst of allPendingInstances) {
      if (!metadata.has(inst.order_id)) {
        metadata.set(inst.order_id, {
          order_id: inst.order_id,
          order_project_name: inst.order_project_name,
          client_name: inst.client_name ?? null,
        });
      }
    }

    return Array.from(metadata.values()).filter(meta => {
      const mdf = mdfCountByOrder.get(meta.order_id) ?? 0;
      const stone = stoneCountByOrder.get(meta.order_id) ?? 0;
      return mdf > 0 || stone > 0;
    });
  }, [allPendingInstances, mdfCountByOrder, stoneCountByOrder]);

  const visibleInstancesForOrder = (orderId: number): PendingInstance[] => {
    const view = orderMaterialViews[orderId];
    if (view === 'MDF') {
      return pendingByType.MDF.filter(i => i.order_id === orderId);
    }
    if (view === 'PIEDRA') {
      return pendingByType.PIEDRA.filter(i => i.order_id === orderId);
    }
    return [];
  };

  const allInstancesForOrder = (orderId: number): PendingInstance[] =>
    allPendingInstances.filter(i => i.order_id === orderId);

  const materialColumns = useMemo((): VTableColumn<any>[] => [
    {
      key: 'name',
      label: 'Material (SKU)',
      render: (mat) => (
        <>
          <span className="font-bold text-slate-800">{mat.name}</span>
          <span className="block text-xs text-slate-400 mt-0.5">{mat.sku} • {mat.category}</span>
        </>
      ),
    },
    {
      key: 'required_qty',
      label: 'Requerido',
      render: (mat) => <span className="font-mono font-medium text-slate-600 text-right block">{mat.required_qty}</span>,
    },
    {
      key: 'available_qty',
      label: 'Existencia Fís.',
      render: (mat) => <span className="font-mono font-bold text-slate-800 text-right block">{mat.available_qty}</span>,
    },
    {
      key: 'status',
      label: 'Estatus',
      render: (mat) => (
        <div className="flex justify-center">
          {mat.status_color === 'RED' && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded border border-red-200 shadow-sm">FALTANTE CRÍTICO</span>}
          {mat.status_color === 'YELLOW' && <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded border border-amber-200 shadow-sm">FALTANTE MENOR</span>}
          {mat.status_color === 'GREEN' && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded border border-emerald-200 shadow-sm">SUFICIENTE</span>}
        </div>
      ),
    },
  ], []);

  return (
    <div className="flex flex-col h-full min-h-0 max-w-7xl mx-auto w-full animate-in fade-in duration-300">
      <div className="mb-4 shrink-0 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <Calculator size={32} className="text-indigo-600" /> Simulador y Lotificación
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Agrupa productos pagados y cruza recetas contra el inventario físico.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/design')} className="relative z-10">
          <ArrowLeft size={18} /> Regresar
        </Button>
      </div>

      <div className="flex flex-1 min-h-0 gap-6 items-stretch">
        {/* COLUMNA IZQUIERDA: EL RADAR */}
        <div className="w-1/3 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="shrink-0 p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Package size={18} className="text-slate-500" /> Órdenes Pendientes
              </h2>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">
                {allPendingInstances.length} piezas
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3 pb-32">
            {loadingRadar ? (
              <div className="flex flex-col gap-3 animate-pulse" aria-label="Escaneando ventas...">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-slate-100" />)}
              </div>
            ) : instancesByOrder.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Package size={32} className="mb-2 opacity-50"/>
                <p className="text-sm">No hay órdenes pendientes pagadas.</p>
              </div>
            ) : (
              instancesByOrder.map(group => {
                const isExpanded = expandedOrderIds.has(group.order_id);
                const orderInstances = allInstancesForOrder(group.order_id);
                const visibleInstances = visibleInstancesForOrder(group.order_id);
                const activeMaterial = orderMaterialViews[group.order_id];
                const mdfCount = mdfCountByOrder.get(group.order_id) ?? 0;
                const stoneCount = stoneCountByOrder.get(group.order_id) ?? 0;
                const selectedInGroup = orderInstances.filter(i =>
                  selectedIds.includes(i.id),
                ).length;
                return (
                  <div
                    key={group.order_id}
                    id={`ov-card-${group.order_id}`}
                    className="border border-slate-200 rounded-lg"
                  >
                    <div className="min-h-12 px-4 py-3.5 bg-slate-50 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleOrderExpand(group.order_id)}
                        className="flex-1 min-w-0 text-left hover:opacity-90 transition"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 shrink-0 tracking-tight">
                            OV-{String(group.order_id).padStart(4, '0')}
                          </span>
                          {selectedInGroup > 0 && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
                              {selectedInGroup} sel.
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-700 truncate mt-0.5">
                          {group.order_project_name}
                        </p>
                        {group.client_name && (
                          <p className="text-[10px] text-slate-400 truncate">
                            {group.client_name}
                          </p>
                        )}
                      </button>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {(() => {
                          const counts: Record<string, number> = {};
                          orderInstances.forEach(i => {
                            const s = effectiveSemaphore(i);
                            counts[s] = (counts[s] ?? 0) + 1;
                          });
                          const priority = ['RED', 'YELLOW', 'SCHEDULED', 'GRAY', 'BLUE', 'BLUE_GREEN', 'DOUBLE_BLUE', 'GREEN', 'DOUBLE_GREEN', 'WARRANTY'];
                          const summary = priority
                            .filter(k => counts[k] > 0)
                            .map(k => ({ color: k, count: counts[k] }));
                          return (
                            <div className="flex items-center gap-1">
                              {summary.map(s => (
                                <span
                                  key={s.color}
                                  className="text-xs flex items-center gap-0.5"
                                  title={`${s.color}: ${s.count}`}
                                >
                                  <span className="text-sm leading-none">{semaphoreDotWithScheduled(s.color)}</span>
                                  <span className="text-[10px] font-bold text-slate-600">{s.count}</span>
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                        {mdfCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => toggleOrderMaterialBadge(group.order_id, 'MDF', e)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition ${
                              activeMaterial === 'MDF'
                                ? 'bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-500'
                                : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200/90'
                            }`}
                            title="Ver instancias MDF de esta OV"
                          >
                            MDF {mdfCount}
                          </button>
                        )}
                        {stoneCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => toggleOrderMaterialBadge(group.order_id, 'PIEDRA', e)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition ${
                              activeMaterial === 'PIEDRA'
                                ? 'bg-violet-100 text-violet-800 border-violet-300 ring-2 ring-violet-500'
                                : 'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200/90'
                            }`}
                            title="Ver instancias Piedra de esta OV"
                          >
                            Piedra {stoneCount}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleOrderExpand(group.order_id)}
                          className="p-1 text-slate-400 hover:text-slate-600"
                          title={isExpanded ? 'Contraer' : 'Expandir'}
                        >
                          <span className={`inline-block transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="flex flex-col divide-y divide-slate-100">
                        {visibleInstances.length === 0 ? (
                          <p className="p-3 text-xs text-slate-500 italic">
                            Activa MDF o Piedra para ver instancias.
                          </p>
                        ) : null}
                        {visibleInstances.map(inst => (
                          <div
                            key={inst.id}
                            className={`p-3 transition border-l-4 ${
                              activeMaterial === 'PIEDRA'
                                ? selectedIds.includes(inst.id)
                                  ? 'bg-violet-100 border-l-violet-400'
                                  : 'bg-violet-50 border-l-violet-400 hover:bg-violet-100/80'
                                : activeMaterial === 'MDF'
                                  ? selectedIds.includes(inst.id)
                                    ? 'bg-amber-100 border-l-amber-400'
                                    : 'bg-amber-50 border-l-amber-400 hover:bg-amber-100/80'
                                  : 'bg-white border-l-transparent hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Checkbox */}
                              <div
                                className="mt-1 cursor-pointer shrink-0"
                                onClick={() => toggleSelection(inst.id)}
                              >
                                {selectedIds.includes(inst.id)
                                  ? <CheckSquare size={18} className="text-blue-600" />
                                  : <Square size={18} className="text-slate-300" />}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-1">
                                    <div
                                      className="cursor-pointer flex-1 min-w-0"
                                      onClick={() => toggleSelection(inst.id)}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-sm leading-none shrink-0" title={`Semáforo: ${effectiveSemaphore(inst)}`}>
                                          {semaphoreDotWithScheduled(effectiveSemaphore(inst))}
                                        </span>
                                        <span className="text-[10px] font-mono font-bold text-indigo-600 shrink-0">
                                          OV-{String(inst.order_id).padStart(4, '0')}
                                        </span>
                                        <h3 className="font-bold text-slate-800 text-sm min-w-0 flex-1 break-words">
                                          {inst.custom_name}
                                        </h3>
                                      </div>
                                      <p className="text-xs text-slate-500">
                                        {inst.product_name}
                                      </p>
                                    </div>
                                  </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: EL SIMULADOR */}
        <div className="w-2/3 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="shrink-0 p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Factory size={18} className="text-slate-500" /> Configuración del Lote
            </h2>
          </div>

          <div className="shrink-0 p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-slate-600">
              Línea activa:{' '}
              <span className="font-bold text-slate-800">
                {batchType === 'MDF' ? 'MDF (simulación de inventario)' : 'Piedra'}
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                Usa los badges MDF / Piedra en cada OV para filtrar y definir el tipo de lote.
              </span>
            </p>
            <Button
              type="button"
              size="lg"
              onClick={handleSimulate}
              disabled={selectedIds.length === 0 || simulating}
              className="px-8 shadow shrink-0"
            >
              {simulating ? 'Calculando...' : 'Ejecutar Simulación'}
            </Button>
          </div>

          {/* RESULTADOS DE LA SIMULACIÓN */}
          <div className="flex-1 min-h-0 p-6 bg-slate-50 overflow-y-auto">
            {!simulationResult ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                <Beaker size={40} className="opacity-20 mb-2" />
                <p>Selecciona órdenes en el radar y ejecuta el simulador</p>
                <p>para ver el cruce de inventario.</p>
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-2">
                <div className={`p-4 rounded-lg mb-6 flex justify-between items-center gap-4 border shadow-sm ${
                  shortages.length > 0
                    ? 'bg-orange-50 border-orange-200 text-orange-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  <div className="flex items-center gap-3">
                    {shortages.length > 0 ? <AlertTriangle size={28} className="text-orange-500"/> : <ShieldCheck size={28} className="text-emerald-500" />}
                    <div>
                      <h3 className="font-black text-lg">
                        {shortages.length > 0 ? 'Falta material núcleo: no se puede crear el lote' : 'Material núcleo completo'}
                      </h3>
                      {shortages.length > 0 ? (
                        <ul className="text-sm font-medium mt-0.5">
                          {shortages.map((s) => (
                            <li key={s.materialId} className="flex items-center gap-2 flex-wrap mt-1">
                              <span>{shortageText(s)}</span>
                              {requestedIds.includes(s.materialId) ? (
                                <span className="text-xs text-emerald-700 font-semibold">Requisición enviada</span>
                              ) : (
                                <Button size="xs" variant="outline" onClick={() => setRequisitionFor(s)}>
                                  Generar requisición a Compras
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm font-medium opacity-90 mt-0.5">
                          Puede crearse el lote. Herrajes y demás pueden quedar en negativo.
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    size="lg"
                    onClick={batchType === 'MDF' ? handleCreateBatch : handleCreateStoneBatch}
                    disabled={creating || shortages.length > 0}
                    title={shortages.length > 0 ? shortages.map(shortageText).join(' · ') : undefined}
                    className={`px-6 shadow ${batchType === 'PIEDRA' ? 'bg-stone-700 hover:bg-stone-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {!creating && <Factory size={18}/>}
                    {creating ? 'Creando lote...' : batchType === 'MDF' ? 'Crear Lote MDF' : 'Crear Lote Piedra'}
                  </Button>
                </div>

                <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Beaker size={16} className="text-slate-400"/> Desglose de Receta vs Inventario Físico</h4>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm max-h-[min(28rem,50vh)] overflow-y-auto">
                  <VTable
                    columns={materialColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                    data={(simulationResult.materials || []) as unknown as Record<string, unknown>[]}
                    className="text-sm [&_tbody_tr]:transition-colors"
                  />
                </div>

              </div>
            )}
          </div>
        </div>

      </div>

      <VConfirmDialog
        isOpen={requisitionFor !== null}
        title="Generar requisición a Compras"
        message={requisitionFor
          ? `¿Generar requisición por ${formatQty(requisitionFor.purchaseQty)} ${requisitionFor.purchaseUnit} de ${requisitionFor.name}?`
          : ''}
        consequence={selectedOrderIds.length === 1
          ? `Compras la verá en sus solicitudes, ligada a ${orderFolios}.`
          : `Compras la verá en sus solicitudes. El lote tiene varias OVs (${orderFolios}): queda sin OV y con la nota.`}
        confirmLabel="Generar requisición"
        onConfirm={createRequisition}
        onCancel={() => setRequisitionFor(null)}
      />
    </div>
  );
}