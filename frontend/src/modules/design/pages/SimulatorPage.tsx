import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { designService, PendingInstance, SimulateBatchResponse } from '../../../api/design-service';
import { productionService } from '../../../api/production-service';
// IMPORTACIÓN CORREGIDA: Se agregaron Calculator y RefreshCw
import { Package, CheckSquare, Square, AlertTriangle, ShieldCheck, Factory, Beaker, ArrowLeft, Calculator, RefreshCw } from 'lucide-react';

export default function SimulatorPage() {
  const navigate = useNavigate(); 
  
  const [pendingInstances, setPendingInstances] = useState<PendingInstance[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchType, setBatchType] = useState<'MDF' | 'PIEDRA'>('MDF');
  
  const [simulationResult, setSimulationResult] = useState<SimulateBatchResponse | null>(null);
  const [loadingRadar, setLoadingRadar] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadPendingInstances();
  }, []);

  const loadPendingInstances = async () => {
    setLoadingRadar(true);
    try {
      const data = await designService.getPendingInstances();
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
      const randomId = Math.floor(Math.random() * 10000);
      const newBatch = await productionService.createBatch({
        folio: `LOTE-${batchType}-${randomId}`,
        batch_type: batchType,
        estimated_merma_percent: 5.0
      });

      for (const instanceId of selectedIds) {
        await productionService.assignInstanceToBatch(newBatch.id, instanceId);
      }

      if (simulationResult.suggested_status === 'AMBAR') {
        await productionService.updateBatchStatus(newBatch.id, 'AMBAR');
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

  return (
    <div className="p-8 h-full bg-slate-50 flex flex-col max-w-7xl mx-auto animate-in fade-in duration-300">
      
      {/* BOTÓN REGRESAR GENERAL */}
      <button 
          onClick={() => navigate('/design')}
          className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold transition-colors mb-6 bg-indigo-50 px-4 py-2 rounded-lg w-fit shadow-sm"
      >
          <ArrowLeft size={18} /> Regresar al Panel Principal
      </button>

      <div className="mb-6 pb-4 border-b border-slate-200">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <Calculator className="text-blue-500" /> Simulador y Lotificación
        </h1>
        <p className="text-slate-500 mt-1">Agrupa productos pagados y cruza recetas contra el inventario físico.</p>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden min-h-[600px]">
        
        {/* COLUMNA IZQUIERDA: EL RADAR */}
        <div className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-bold text-slate-700 flex items-center gap-2">
              <Package size={18} className="text-slate-500" /> Órdenes Pendientes
            </h2>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">
              {pendingInstances.length} piezas
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {loadingRadar ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                <RefreshCw className="animate-spin" size={24} />
                <p className="text-sm">Escaneando ventas...</p>
              </div>
            ) : pendingInstances.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                 <Package size={32} className="mb-2 opacity-50"/>
                 <p className="text-sm">No hay órdenes pendientes pagadas.</p>
              </div>
            ) : (
              pendingInstances.map(inst => (
                <div 
                  key={inst.id}
                  onClick={() => toggleSelection(inst.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                    selectedIds.includes(inst.id) 
                      ? 'bg-blue-50 border-blue-400 shadow-sm' 
                      : 'bg-white border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="mt-1">
                    {selectedIds.includes(inst.id) ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : (
                      <Square size={18} className="text-slate-300" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">{inst.custom_name}</h3>
                    <p className="text-xs text-slate-500">{inst.product_name}</p>
                    <p className="text-[10px] font-mono text-slate-400 mt-1">Proyecto: {inst.order_project_name}</p>
                  </div>
                </div>
              ))
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
                  <label className={`flex-1 p-3 border rounded-lg cursor-pointer flex items-center justify-center gap-2 font-bold transition ${batchType === 'MDF' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                    <input type="radio" name="bType" className="hidden" checked={batchType === 'MDF'} onChange={() => {setBatchType('MDF'); setSimulationResult(null);}} />
                    Lote MDF / Tablero
                  </label>
                  <label className={`flex-1 p-3 border rounded-lg cursor-pointer flex items-center justify-center gap-2 font-bold transition ${batchType === 'PIEDRA' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                    <input type="radio" name="bType" className="hidden" checked={batchType === 'PIEDRA'} onChange={() => {setBatchType('PIEDRA'); setSimulationResult(null);}} />
                    Lote PIEDRA
                  </label>
                </div>
              </div>
              
              <div className="flex items-end pt-6">
                <button 
                  onClick={handleSimulate}
                  disabled={selectedIds.length === 0 || simulating}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                >
                  {simulating ? <><RefreshCw className="animate-spin" size={18}/> Calculando...</> : 'Ejecutar Simulación'}
                </button>
              </div>
            </div>
          </div>

          {/* RESULTADOS DE LA SIMULACIÓN */}
          <div className="flex-1 p-6 bg-slate-50 overflow-y-auto">
            {!simulationResult ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                <Beaker size={40} className="opacity-20 mb-2" />
                <p>Selecciona órdenes en el radar y ejecuta el simulador</p>
                <p>para ver el cruce de inventario.</p>
              </div>
            ) : (
              <div className="animate-in slide-in-from-bottom-2">
                <div className={`p-4 rounded-lg mb-6 flex justify-between items-center border shadow-sm ${
                  simulationResult.suggested_status === 'AMBAR' 
                    ? 'bg-orange-50 border-orange-200 text-orange-800' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  <div className="flex items-center gap-3">
                    {simulationResult.suggested_status === 'AMBAR' ? <AlertTriangle size={28} className="text-orange-500"/> : <ShieldCheck size={28} className="text-emerald-500" />}
                    <div>
                      <h3 className="font-black text-lg">
                        Veredicto: {simulationResult.suggested_status === 'AMBAR' ? 'LOTE EN ÁMBAR (Faltantes Críticos)' : 'LOTE EN VERDE (Suficiencia)'}
                      </h3>
                      <p className="text-sm font-medium opacity-90 mt-0.5">
                        {simulationResult.suggested_status === 'AMBAR' 
                          ? 'Falta material núcleo. Nacerá bloqueado para Sierras/CNC.' 
                          : 'Material núcleo completo. Puede avanzar a Sierras.'}
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleCreateBatch}
                    disabled={creating}
                    className={`px-6 py-3 rounded-lg font-bold shadow text-white transition flex items-center gap-2 ${
                      simulationResult.suggested_status === 'AMBAR' 
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
    </div>
  );
}