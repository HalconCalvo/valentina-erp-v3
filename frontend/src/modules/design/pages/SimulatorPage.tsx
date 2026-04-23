import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { designService, PendingInstance, SimulateBatchResponse } from '../../../api/design-service';
import { productionService } from '../../../api/production-service';
import { planningService } from '../../../api/planning-service';
// IMPORTACIÓN CORREGIDA: Se agregaron Calculator y RefreshCw
import { Package, CheckSquare, Square, AlertTriangle, ShieldCheck, Factory, Beaker, ArrowLeft, Calculator, RefreshCw, Pencil, Check, X, Tag } from 'lucide-react';

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
  
  const [pendingInstances, setPendingInstances] = useState<PendingInstance[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchType, setBatchType] = useState<'MDF' | 'PIEDRA'>('MDF');
  
  const [simulationResult, setSimulationResult] = useState<SimulateBatchResponse | null>(null);
  const [loadingRadar, setLoadingRadar] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── Renombrado inline ───────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // ── Bautizo masivo de selección ────────────────────────────────────
  const [showMassBaptism, setShowMassBaptism] = useState(false);
  const [baptismNames, setBaptismNames] = useState<Record<number, string>>({});

  // ── Agrupación por OV ───────────────────────────────────────────────
  const [expandedOrderIds, setExpandedOrderIds] =
    useState<Set<number>>(new Set());

  const toggleOrderExpand = (orderId: number) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  useEffect(() => {
    loadPendingInstances();
    setSelectedIds([]);
    setSimulationResult(null);
  }, [batchType]);

  const loadPendingInstances = async () => {
    setLoadingRadar(true);
    try {
      const data = await designService.getPendingInstances(batchType);
      setPendingInstances(data);
    } catch (error) {
      console.error("Error cargando el radar:", error);
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

  const handleSimulate = async () => {
    if (selectedIds.length === 0) return alert("Selecciona al menos una instancia");
    
    setSimulating(true);
    try {
      const result = await designService.simulateBatch(selectedIds, batchType);
      setSimulationResult(result);
    } catch (error) {
      console.error("Error en la simulación:", error);
      alert("Error al simular el lote. Verifica la conexión.");
    } finally {
      setSimulating(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!simulationResult) return;
    
    setCreating(true);
    try {
      const newBatch = await productionService.createBatch({
        batch_type: batchType,
        estimated_merma_percent: 5.0
      });

      for (const instanceId of selectedIds) {
        await productionService.assignInstanceToBatch(newBatch.id, instanceId);
      }

      if (simulationResult.suggested_status === 'ON_HOLD') {
        await productionService.updateBatchStatus(newBatch.id, 'ON_HOLD');
      }

      alert(`¡Lote ${newBatch.folio} inyectado con éxito en Producción!`);
      
      setSelectedIds([]);
      setSimulationResult(null);
      loadPendingInstances();

    } catch (error) {
      console.error("Error creando el lote:", error);
      alert("Hubo un error al inyectar el lote en fábrica.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateStoneBatch = async () => {
    if (selectedIds.length === 0) return;
    setCreating(true);
    try {
      const newBatch = await productionService.createBatch({
        batch_type: 'PIEDRA',
        estimated_merma_percent: 0.0,
      });

      for (const instanceId of selectedIds) {
        await productionService.assignInstanceToBatch(
          newBatch.id, instanceId
        );
      }

      alert(`✅ Lote ${newBatch.folio} de Piedra creado en Producción.`);
      setSelectedIds([]);
      setSimulationResult(null);
      loadPendingInstances();
    } catch (error: any) {
      const serverError = error.response?.data?.detail || error.message;
      alert(`Error al crear lote de Piedra:\n${JSON.stringify(serverError, null, 2)}`);
    } finally {
      setCreating(false);
    }
  };

  // ── Helpers de renombrado ───────────────────────────────────────────
  const startEdit = (inst: PendingInstance) => {
    setEditingId(inst.id);
    setEditingName(inst.custom_name);
  };

  const cancelEdit = () => { setEditingId(null); setEditingName(''); };

  const saveEdit = async (instId: number) => {
    if (!editingName.trim()) return;
    setSavingName(true);
    try {
      await planningService.updateInstance(instId, { custom_name: editingName.trim() });
      // Update local list immediately
      setPendingInstances(prev =>
        prev.map(p => p.id === instId ? { ...p, custom_name: editingName.trim() } : p)
      );
      setEditingId(null);
    } catch {
      alert('Error al guardar el alias. Intenta de nuevo.');
    } finally {
      setSavingName(false);
    }
  };

  const openMassBaptism = () => {
    const selected = pendingInstances.filter(p => selectedIds.includes(p.id));
    const initial: Record<number, string> = {};
    selected.forEach(p => { initial[p.id] = p.custom_name; });
    setBaptismNames(initial);
    setShowMassBaptism(true);
  };

  const saveMassBaptism = async () => {
    setSavingName(true);
    try {
      await Promise.all(
        Object.entries(baptismNames).map(([id, name]) =>
          planningService.updateInstance(Number(id), { custom_name: name })
        )
      );
      setPendingInstances(prev =>
        prev.map(p => baptismNames[p.id] !== undefined
          ? { ...p, custom_name: baptismNames[p.id] }
          : p
        )
      );
      setShowMassBaptism(false);
    } catch {
      alert('Error al guardar los alias. Intenta de nuevo.');
    } finally {
      setSavingName(false);
    }
  };

  const instancesByOrder = useMemo(() => {
    const groups = new Map<number, {
      order_id: number;
      order_project_name: string;
      client_name: string | null;
      instances: typeof pendingInstances;
    }>();
    for (const inst of pendingInstances) {
      if (!groups.has(inst.order_id)) {
        groups.set(inst.order_id, {
          order_id: inst.order_id,
          order_project_name: inst.order_project_name,
          client_name: inst.client_name ?? null,
          instances: [],
        });
      }
      groups.get(inst.order_id)!.instances.push(inst);
    }
    return Array.from(groups.values());
  }, [pendingInstances]);

  return (
    <div className="p-8 h-full bg-slate-50 flex flex-col max-w-7xl mx-auto animate-in fade-in duration-300">
      
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate('/design')}
          className="flex items-center gap-2 bg-white border 
                   border-slate-300 text-slate-700 px-4 py-2 
                   rounded-lg font-bold hover:bg-slate-50 
                   hover:text-indigo-600 transition-all shadow-sm"
        >
          <ArrowLeft size={18} /> Regresar
        </button>
      </div>

      <div className="mb-6 pb-4 border-b border-slate-200">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <Calculator className="text-blue-500" /> Simulador y Lotificación
        </h1>
        <p className="text-slate-500 mt-1">Agrupa productos pagados y cruza recetas contra el inventario físico.</p>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden min-h-[600px]">
        
        {/* COLUMNA IZQUIERDA: EL RADAR */}
        <div className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-slate-700 flex items-center gap-2">
                <Package size={18} className="text-slate-500" /> Órdenes Pendientes
              </h2>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">
                {pendingInstances.length} piezas
              </span>
            </div>
            {/* Bautizo Masivo de selección */}
            {selectedIds.length > 0 && (
              <button
                onClick={openMassBaptism}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
              >
                <Tag size={13} /> Bautizo Masivo ({selectedIds.length} seleccionadas)
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {loadingRadar ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                <RefreshCw className="animate-spin" size={24} />
                <p className="text-sm">Escaneando ventas...</p>
              </div>
            ) : instancesByOrder.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Package size={32} className="mb-2 opacity-50"/>
                <p className="text-sm">No hay órdenes pendientes pagadas.</p>
              </div>
            ) : (
              instancesByOrder.map(group => {
                const isExpanded = expandedOrderIds.has(group.order_id);
                const selectedInGroup = group.instances.filter(
                  i => selectedIds.includes(i.id)
                ).length;
                return (
                  <div key={group.order_id}
                       className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Tarjeta OV — clickeable para expandir */}
                    <button
                      type="button"
                      onClick={() => toggleOrderExpand(group.order_id)}
                      className="w-full text-left p-3 bg-slate-50 hover:bg-slate-100 transition flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">
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
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                          // Contar semáforos efectivos de las instancias del grupo
                          const counts: Record<string, number> = {};
                          group.instances.forEach(i => {
                            const s = effectiveSemaphore(i);
                            counts[s] = (counts[s] ?? 0) + 1;
                          });
                          // Mostrar en orden de prioridad: RED, YELLOW, SCHEDULED, otros
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
                        <span className="text-[10px] text-slate-400">
                          {group.instances.length} inst.
                        </span>
                        <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      </div>
                    </button>

                    {/* Instancias expandibles */}
                    {isExpanded && (
                      <div className="flex flex-col divide-y divide-slate-100">
                        {group.instances.map(inst => (
                          <div
                            key={inst.id}
                            className={`p-3 transition ${
                              selectedIds.includes(inst.id)
                                ? 'bg-blue-50'
                                : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Checkbox */}
                              <div
                                className="mt-1 cursor-pointer shrink-0"
                                onClick={() => {
                                  if (editingId !== inst.id)
                                    toggleSelection(inst.id);
                                }}
                              >
                                {selectedIds.includes(inst.id)
                                  ? <CheckSquare size={18} className="text-blue-600" />
                                  : <Square size={18} className="text-slate-300" />}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                {editingId === inst.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editingName}
                                      onChange={e => setEditingName(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveEdit(inst.id);
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="flex-1 text-sm border border-indigo-300 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                    <button
                                      onClick={() => saveEdit(inst.id)}
                                      disabled={savingName}
                                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                    >
                                      <Check size={15} />
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"
                                    >
                                      <X size={15} />
                                    </button>
                                  </div>
                                ) : (
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
                                        <h3 className="font-bold text-slate-800 text-sm truncate">
                                          {inst.custom_name}
                                        </h3>
                                      </div>
                                      <p className="text-xs text-slate-500">
                                        {inst.product_name}
                                      </p>
                                    </div>
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        startEdit(inst);
                                      }}
                                      className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition shrink-0"
                                      title="Renombrar instancia"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  </div>
                                )}
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
        <div className="w-2/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-bold text-slate-700 flex items-center gap-2">
              <Factory size={18} className="text-slate-500" /> Configuración del Lote
            </h2>
          </div>

          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Línea de Producción:</label>
                <div className="flex gap-4">
                  <label className={`flex-1 p-3 border rounded-lg cursor-pointer flex flex-col items-center justify-center gap-1 font-bold transition ${batchType === 'MDF' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                    <input type="radio" name="bType" className="hidden" checked={batchType === 'MDF'} onChange={() => {setBatchType('MDF'); setSimulationResult(null);}} />
                    <span>Lote MDF</span>
                    <span className={`text-[10px] font-normal ${batchType === 'MDF' ? 'text-slate-300' : 'text-slate-400'}`}>
                      Requiere simulación de inventario
                    </span>
                  </label>
                  <label className={`flex-1 p-3 border rounded-lg cursor-pointer flex flex-col items-center justify-center gap-1 font-bold transition ${batchType === 'PIEDRA' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                    <input type="radio" name="bType" className="hidden" checked={batchType === 'PIEDRA'} onChange={() => {setBatchType('PIEDRA'); setSimulationResult(null);}} />
                    <span>Lote Piedra</span>
                    <span className={`text-[10px] font-normal ${batchType === 'PIEDRA' ? 'text-slate-300' : 'text-slate-400'}`}>
                      Creación directa sin simulación
                    </span>
                  </label>
                </div>
              </div>
              
              <div className="flex items-end pt-6">
                {batchType === 'MDF' ? (
                  <button
                    onClick={handleSimulate}
                    disabled={selectedIds.length === 0 || simulating}
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    {simulating
                      ? <><RefreshCw className="animate-spin" size={18}/> Calculando...</>
                      : 'Ejecutar Simulación'}
                  </button>
                ) : (
                  <button
                    onClick={handleCreateStoneBatch}
                    disabled={selectedIds.length === 0 || creating}
                    className="bg-stone-700 text-white px-8 py-3 rounded-lg font-bold shadow hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    {creating
                      ? <><RefreshCw className="animate-spin" size={18}/> Creando...</>
                      : <><Factory size={18}/> Crear Lote Piedra</>}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* RESULTADOS DE LA SIMULACIÓN */}
          <div className="flex-1 p-6 bg-slate-50 overflow-y-auto">
            {!simulationResult ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                {batchType === 'MDF' ? (
                  <>
                    <Beaker size={40} className="opacity-20 mb-2" />
                    <p>Selecciona órdenes en el radar y ejecuta el simulador</p>
                    <p>para ver el cruce de inventario.</p>
                  </>
                ) : (
                  <>
                    <Factory size={40} className="opacity-20 mb-2" />
                    <p className="font-semibold text-slate-500">
                      Lote de Piedra
                    </p>
                    <p>Selecciona las instancias y haz clic en</p>
                    <p><b>Crear Lote Piedra</b> para enviarlo directamente a Producción.</p>
                    <p className="text-xs mt-2 text-slate-300">
                      No se requiere simulación de inventario.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-2">
                <div className={`p-4 rounded-lg mb-6 flex justify-between items-center border shadow-sm ${
                  simulationResult.suggested_status === 'ON_HOLD' 
                    ? 'bg-orange-50 border-orange-200 text-orange-800' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  <div className="flex items-center gap-3">
                    {simulationResult.suggested_status === 'ON_HOLD' ? <AlertTriangle size={28} className="text-orange-500"/> : <ShieldCheck size={28} className="text-emerald-500" />}
                    <div>
                      <h3 className="font-black text-lg">
                        Veredicto: {simulationResult.suggested_status === 'ON_HOLD' ? 'LOTE EN ÁMBAR (Faltantes Críticos)' : 'LOTE EN VERDE (Suficiencia)'}
                      </h3>
                      <p className="text-sm font-medium opacity-90 mt-0.5">
                        {simulationResult.suggested_status === 'ON_HOLD' 
                          ? 'Falta material núcleo. Nacerá bloqueado para Sierras/CNC.' 
                          : 'Material núcleo completo. Puede avanzar a Sierras.'}
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleCreateBatch}
                    disabled={creating}
                    className={`px-6 py-3 rounded-lg font-bold shadow text-white transition flex items-center gap-2 ${
                      simulationResult.suggested_status === 'ON_HOLD' 
                        ? 'bg-orange-600 hover:bg-orange-700' 
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {creating ? <RefreshCw className="animate-spin" size={18}/> : <Factory size={18}/>}
                    {creating ? 'Inyectando...' : `Confirmar Lote ${simulationResult.suggested_status}`}
                  </button>
                </div>

                <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2"><Beaker size={16} className="text-slate-400"/> Desglose de Receta vs Inventario Físico</h4>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-3 font-bold">Material (SKU)</th>
                        <th className="p-3 font-bold text-right">Requerido</th>
                        <th className="p-3 font-bold text-right">Existencia Fís.</th>
                        <th className="p-3 font-bold text-center">Estatus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {simulationResult.materials.map(mat => (
                        <tr key={mat.material_id} className={mat.status_color === 'RED' ? 'bg-red-50/50' : mat.status_color === 'YELLOW' ? 'bg-amber-50/50' : ''}>
                          <td className="p-3">
                            <span className="font-bold text-slate-800">{mat.name}</span>
                            <span className="block text-xs text-slate-400 mt-0.5">{mat.sku} • {mat.category}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-medium text-slate-600">{mat.required_qty}</td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800">{mat.available_qty}</td>
                          <td className="p-3 flex justify-center">
                            {mat.status_color === 'RED' && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded border border-red-200 shadow-sm">FALTANTE CRÍTICO</span>}
                            {mat.status_color === 'YELLOW' && <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded border border-amber-200 shadow-sm">FALTANTE MENOR</span>}
                            {mat.status_color === 'GREEN' && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded border border-emerald-200 shadow-sm">SUFICIENTE</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Modal de Bautizo Masivo ─────────────────────────────────── */}
      {showMassBaptism && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Tag size={18} className="text-indigo-600" />
                Bautizo Masivo
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Asigna aliases a las {selectedIds.length} instancias seleccionadas antes de crear el lote.
              </p>
            </div>

            {/* Instance list */}
            <div className="px-6 py-4 max-h-80 overflow-y-auto space-y-2.5">
              {pendingInstances
                .filter(p => selectedIds.includes(p.id))
                .map((inst, idx) => (
                  <div key={inst.id} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400 truncate">{inst.product_name} · {inst.order_project_name}</p>
                      <input
                        type="text"
                        value={baptismNames[inst.id] ?? inst.custom_name}
                        onChange={e => setBaptismNames(prev => ({ ...prev, [inst.id]: e.target.value }))}
                        placeholder="Alias / Ubicación..."
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition mt-0.5"
                      />
                    </div>
                  </div>
                ))}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowMassBaptism(false)}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={saveMassBaptism}
                disabled={savingName}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50"
              >
                {savingName ? 'Guardando...' : `Guardar ${selectedIds.length} aliases`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}