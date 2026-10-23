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
import { Package, CheckSquare, Square, AlertTriangle, ShieldCheck, Factory, Beaker, Calculator, ChevronDown } from 'lucide-react';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { VEmptyState } from '@/components/ui/VEmptyState';

/** Semaphore color as dots (guide v2: no emojis). */
const DOT_CLASS: Record<string, string> = {
  RED: 'bg-red-500', YELLOW: 'bg-amber-400', GRAY: 'bg-slate-300', BLUE: 'bg-blue-500', GREEN: 'bg-emerald-500',
  SCHEDULED: 'bg-violet-500',
};
const DOT_PARTS: Record<string, string[]> = {
  BLUE_GREEN: ['BLUE', 'GREEN'], DOUBLE_BLUE: ['BLUE', 'BLUE'], DOUBLE_GREEN: ['GREEN', 'GREEN'],
};

function SemaphoreDot({ color }: { color: string }) {
  if (color === 'WARRANTY') return <AlertTriangle size={12} className="text-amber-500 shrink-0" />;
  const parts = DOT_PARTS[color] ?? [color];
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {parts.map((part, i) => (
        <span key={i} className={`inline-block h-2.5 w-2.5 rounded-full ${DOT_CLASS[part] ?? DOT_CLASS.GRAY}`} />
      ))}
    </span>
  );
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
      sortable: true,
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
      sortable: true,
      align: 'right',
      render: (mat) => <span className="tabular-nums font-medium text-slate-600 text-right block">{formatQty(mat.required_qty)}</span>,
    },
    {
      key: 'available_qty',
      label: 'Existencia física',
      sortable: true,
      align: 'right',
      render: (mat) => <span className="tabular-nums font-bold text-slate-800 text-right block">{formatQty(mat.available_qty)}</span>,
    },
    {
      key: 'status',
      label: 'Estado',
      align: 'center',
      render: (mat) => (
        <div className="flex justify-center">
          {mat.status_color === 'RED' && <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">Faltante crítico</span>}
          {mat.status_color === 'YELLOW' && <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Faltante menor</span>}
          {mat.client_supplied && <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-200">Lo pone el cliente</span>}
          {mat.status_color === 'GREEN' && !mat.client_supplied && <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Suficiente</span>}
        </div>
      ),
    },
  ], []);

  return (
    // Guide v2 (tanda 1): full width, standard header; the two panels keep their layout
    <div className="flex flex-col h-full min-h-0 w-full p-8 pb-8 gap-6 animate-fadeIn">
      <div className="shrink-0">
        <VPageHeader
          icon={Calculator}
          title="Simulador y lotificación"
          subtitle="Agrupa productos pagados y cruza recetas contra el inventario físico."
          loading={loadingRadar}
          onRefresh={() => void loadPendingInstances()}
          onBack={() => navigate('/design')}
          backLabel="Regresar a Diseño e Ingeniería"
        />
      </div>

      <div className="flex flex-1 min-h-0 gap-6 items-stretch">
        {/* COLUMNA IZQUIERDA: EL RADAR */}
        <div className="w-1/3 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="shrink-0 p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Package size={18} className="text-indigo-600" /> Órdenes pendientes
              </h2>
              <span className="text-xs font-bold text-indigo-700 tabular-nums">
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
              <VEmptyState icon={<Package />} title="No hay órdenes pendientes pagadas." />
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
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleOrderExpand(group.order_id)}
                        className="flex-1 min-w-0 h-auto p-0 block text-left font-normal whitespace-normal hover:bg-transparent hover:opacity-90"
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
                      </Button>
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
                                  <SemaphoreDot color={s.color} />
                                  <span className="text-[10px] font-bold text-slate-600">{s.count}</span>
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                        {mdfCount > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={(e) => toggleOrderMaterialBadge(group.order_id, 'MDF', e)}
                            className={`h-auto text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition ${
                              activeMaterial === 'MDF'
                                ? 'bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-500'
                                : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200/90'
                            }`}
                            title="Ver instancias MDF de esta OV"
                          >
                            MDF {mdfCount}
                          </Button>
                        )}
                        {stoneCount > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={(e) => toggleOrderMaterialBadge(group.order_id, 'PIEDRA', e)}
                            className={`h-auto text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition ${
                              activeMaterial === 'PIEDRA'
                                ? 'bg-violet-100 text-violet-800 border-violet-300 ring-2 ring-violet-500'
                                : 'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200/90'
                            }`}
                            title="Ver instancias Piedra de esta OV"
                          >
                            Piedra {stoneCount}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => toggleOrderExpand(group.order_id)}
                          className="text-slate-400 hover:text-slate-600"
                          title={isExpanded ? 'Contraer' : 'Expandir'}
                          aria-label={isExpanded ? 'Contraer' : 'Expandir'}
                        >
                          <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </Button>
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
                                        <span className="leading-none shrink-0" title={`Semáforo: ${effectiveSemaphore(inst)}`}>
                                          <SemaphoreDot color={effectiveSemaphore(inst)} />
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
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Factory size={18} className="text-indigo-600" /> Configuración del lote
            </h2>
          </div>

          <div className="shrink-0 p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-slate-600">
              Línea activa:{' '}
              <span className="font-bold text-slate-800">
                {batchType === 'MDF' ? 'MDF (simulación de inventario)' : 'Piedra'}
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                Usa las etiquetas MDF / Piedra en cada OV para filtrar y definir el tipo de lote.
              </span>
            </p>
            {/* One colored button per screen: once there is a result, "Crear lote" is the main action */}
            <Button
              type="button"
              variant={simulationResult ? 'outline' : 'default'}
              onClick={handleSimulate}
              disabled={selectedIds.length === 0 || simulating}
              className="shrink-0"
            >
              {simulating ? 'Procesando...' : 'Ejecutar simulación'}
            </Button>
          </div>

          {/* RESULTADOS DE LA SIMULACIÓN */}
          <div className="flex-1 min-h-0 p-6 bg-slate-50 overflow-y-auto">
            {!simulationResult ? (
              <VEmptyState
                icon={<Beaker />}
                title="Sin simulación"
                description="Selecciona órdenes en el radar y ejecuta el simulador para ver el cruce de inventario."
              />
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
                      <h3 className="font-bold text-base">
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
                    onClick={batchType === 'MDF' ? handleCreateBatch : handleCreateStoneBatch}
                    disabled={creating || shortages.length > 0}
                    title={shortages.length > 0 ? shortages.map(shortageText).join(' · ') : undefined}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {!creating && <Factory size={16}/>}
                    {creating ? 'Procesando...' : batchType === 'MDF' ? 'Crear lote MDF' : 'Crear lote Piedra'}
                  </Button>
                </div>

                <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Beaker size={16} className="text-indigo-600"/> Desglose de receta vs. inventario físico</h4>
                <VTable
                  columns={materialColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                  data={(simulationResult.materials || []) as unknown as Record<string, unknown>[]}
                  headerStyle="report"
                  maxHeight="min(28rem,50vh)"
                  className="shadow-sm"
                  emptyState={{ icon: <Beaker />, title: 'La simulación no trajo materiales.' }}
                />

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