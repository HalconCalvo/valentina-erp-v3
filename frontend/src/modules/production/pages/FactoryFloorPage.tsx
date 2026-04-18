import React, { useEffect, useMemo, useState } from 'react';
import { productionService } from '../../../api/production-service';
import { ProductionBatch } from '../../../types/production';
import { Lock, Package, AlertCircle, ArrowRight, CheckCircle2, Boxes } from 'lucide-react';

const STATUS_READY_TO_INSTALL = 'READY_TO_INSTALL';
const STATUS_PACKING = 'PACKING';

type MaterialFilter = 'ALL' | 'MDF' | 'PIEDRA';

export default function FactoryFloorPage() {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  /** Bultos por instancia (solo UI; sin persistencia aún). */
  const [bultosByInstanceId, setBultosByInstanceId] = useState<
    Record<number, { mdf: number; herrajes: number }>
  >({});
  /** Instancias cuyas etiquetas ya se solicitaron correctamente al backend. */
  const [labelsRequestedInstanceIds, setLabelsRequestedInstanceIds] = useState<Record<number, boolean>>(
    {}
  );
  const [stoneByInstanceId, setStoneByInstanceId] = useState<Record<number, number>>({});

  const batchesForView = useMemo(() => {
    if (materialFilter === 'ALL') return batches;
    return batches.filter((b) => b.batch_type === materialFilter);
  }, [batches, materialFilter]);

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    try {
      setLoading(true);
      const data = await productionService.getBatches();
      setBatches(data);
    } catch (error) {
      console.error("Error al cargar los lotes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTestBatch = async () => {
    try {
      const randomId = Math.floor(Math.random() * 1000);
      await productionService.createBatch({
        folio: `LOTE-PRUEBA-${randomId}`,
        batch_type: 'ESTANDAR',
        estimated_merma_percent: 5.0
      });
      loadBatches(); 
    } catch (error: any) {
      const serverError = error.response?.data?.detail || error.message;
      alert(`Error del backend al crear lote:\n${JSON.stringify(serverError, null, 2)}`);
    }
  };

  // --- LÓGICA DE DRAG & DROP ---
  const handleDragStart = (e: React.DragEvent, batchId: number, isLocked: boolean) => {
    // Restaurada la validación estricta
    if (isLocked) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('batchId', batchId.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necesario para permitir el "Drop"
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const batchIdStr = e.dataTransfer.getData('batchId');
    if (!batchIdStr) return;
    
    const batchId = parseInt(batchIdStr);
    const batch = batches.find(b => b.id === batchId);
    
    if (!batch) return;
    if (batch.status === newStatus) return;

    // Reglas de Negocio Estrictas
    if (batch.status === 'IN_PRODUCTION' && newStatus === 'DRAFT') {
      alert("Operación denegada: Un lote en producción no puede regresar a la fila de espera.");
      return;
    }

    // Actualización Optimista
    const previousBatches = [...batches];
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: newStatus } : b));

    try {
      await productionService.updateBatchStatus(batchId, newStatus);
    } catch (error: any) {
      console.error("Error actualizando estatus:", error);
      alert("No se pudo actualizar el estatus en el servidor. Revirtiendo cambio.");
      setBatches(previousBatches); // Revertir si falla
    }
  };

  // --- RENDERIZADO DE COLUMNAS HÍBRIDAS ---
  const renderColumn1 = () => {
    const status = 'DRAFT';
    const columnBatches = batchesForView.filter(b => b.status === status);

    return (
      <div 
        className="bg-gray-50 p-4 rounded-xl w-80 flex-shrink-0 flex flex-col border border-gray-200"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-gray-700 uppercase tracking-wide text-sm">1. Lote por Producir</h2>
          <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-1 rounded-full">{columnBatches.length}</span>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {columnBatches.map(batch => {
            const isLocked = !batch.is_payment_cleared;
            return (
              <div 
                key={batch.id} 
                draggable={true} // Forzado a true temporalmente para la prueba
                onDragStart={(e) => handleDragStart(e, batch.id, isLocked)}
                className={`p-4 rounded-lg shadow-sm border transition ${
                  isLocked 
                    ? 'bg-red-50 border-red-300 cursor-grab active:cursor-grabbing' // Cursor modificado para la prueba
                    : 'bg-white border-gray-200 hover:shadow-md hover:border-blue-300 cursor-grab active:cursor-grabbing'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`font-bold ${isLocked ? 'text-red-800' : 'text-gray-800'}`}>{batch.folio}</span>
                  {isLocked && <Lock size={16} className="text-red-500" title="Anticipo pendiente o Lote vacío" />}
                </div>
                
                {isLocked && (
                  <div className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-1 rounded flex items-center gap-1 mb-2">
                    <AlertCircle size={12} /> Bloqueado por Finanzas
                  </div>
                )}

                <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100/50">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${isLocked ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {batch.batch_type}
                  </span>
                  <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                    <Package size={12}/> {batch.instances?.length || 0} items
                  </span>
                </div>
              </div>
            );
          })}
          {columnBatches.length === 0 && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-400 text-sm">
              Fila de espera vacía
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderColumn2 = () => {
    const status = 'IN_PRODUCTION';
    const columnBatches = batchesForView.filter(b => b.status === status);

    return (
      <div 
        className="bg-blue-50/50 p-4 rounded-xl w-80 flex-shrink-0 flex flex-col border border-blue-100"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-blue-800 uppercase tracking-wide text-sm flex items-center gap-2">
            <ArrowRight size={16} /> 2. En Producción
          </h2>
          <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">{columnBatches.length}</span>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {columnBatches.map(batch => (
            <div 
              key={batch.id} 
              draggable
              onDragStart={(e) => handleDragStart(e, batch.id, false)}
              className="bg-white p-4 rounded-lg shadow-sm border border-blue-200 border-l-4 border-l-blue-500 hover:shadow-md cursor-grab active:cursor-grabbing"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-gray-800">{batch.folio}</span>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {batch.batch_type}
                </span>
                <span className="text-xs font-medium text-blue-600 flex items-center gap-1">
                  En proceso...
                </span>
              </div>
            </div>
          ))}
          {columnBatches.length === 0 && (
            <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 text-center text-blue-400 text-sm">
              Máquinas detenidas
            </div>
          )}
        </div>
      </div>
    );
  };

  const getBultosRow = (instanceId: number) =>
    bultosByInstanceId[instanceId] ?? { mdf: 0, herrajes: 0 };

  const setBultosField = (instanceId: number, field: 'mdf' | 'herrajes', raw: string) => {
    const n = parseFloat(raw);
    const value = Number.isFinite(n) && n >= 0 ? n : 0;
    setBultosByInstanceId((prev) => {
      const cur = prev[instanceId] ?? { mdf: 0, herrajes: 0 };
      return {
        ...prev,
        [instanceId]: { ...cur, [field]: value },
      };
    });
  };

  const setStonePieces = (instanceId: number, raw: string) => {
    const n = parseInt(raw);
    const value = Number.isFinite(n) && n >= 1 ? n : 0;
    setStoneByInstanceId((prev) => ({ ...prev, [instanceId]: value }));
  };

  const handleDeclareStonePieces = async (instanceId: number) => {
    const pieces = stoneByInstanceId[instanceId];
    if (!pieces || pieces < 1) {
      alert('Ingresa al menos 1 pieza de piedra.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const baseUrl = import.meta.env.VITE_API_URL
        || 'http://localhost:8000/api/v1';
      const response = await fetch(
        `${baseUrl}/production/instances/${instanceId}/stone_pieces`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ stone_pieces: pieces }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        alert(`Error: ${err.detail}`);
        return;
      }
      alert(`✅ ${pieces} piezas de piedra declaradas correctamente.`);
    } catch {
      alert('Error al declarar piezas. Verifica la conexión.');
    }
  };

  const renderColumnEmpaque = () => {
    const status = STATUS_PACKING;
    const columnBatches = batchesForView.filter((b) => b.status === status);
    const instanceCount = columnBatches.reduce((n, b) => n + (b.instances?.length ?? 0), 0);

    return (
      <div
        className="bg-violet-50/60 p-4 rounded-xl w-[22rem] flex-shrink-0 flex flex-col border border-violet-200"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-violet-900 uppercase tracking-wide text-sm flex items-center gap-2">
            <Boxes size={16} /> 3. En Empaque
          </h2>
          <span className="bg-violet-200 text-violet-900 text-xs font-bold px-2 py-1 rounded-full">
            {instanceCount}
          </span>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          {columnBatches.map((batch) => (
            <div key={batch.id} className="space-y-2">
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, batch.id, false)}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-violet-100/80 border border-violet-200 text-xs font-bold text-violet-900 cursor-grab active:cursor-grabbing"
              >
                <span className="truncate">Lote {batch.folio}</span>
                <span className="text-[10px] font-medium text-violet-600 shrink-0">
                  Arrastrar → Listo
                </span>
              </div>
              {(batch.instances || []).map((instance) => {
                const { mdf, herrajes } = getBultosRow(instance.id);
                const canSolicitar = mdf > 0 && herrajes > 0;
                const labelsDone = labelsRequestedInstanceIds[instance.id];
                return (
                  <div
                    key={instance.id}
                    className="bg-white p-3 rounded-lg shadow-sm border border-violet-100 border-l-4 border-l-violet-400"
                  >
                    <p className="font-bold text-gray-800 text-sm mb-3">{instance.custom_name}</p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Bultos MDF</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                          value={mdf || ''}
                          onChange={(e) => setBultosField(instance.id, 'mdf', e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Bultos Herrajes</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                          value={herrajes || ''}
                          onChange={(e) => setBultosField(instance.id, 'herrajes', e.target.value)}
                        />
                      </label>
                    </div>
                    {batch.batch_type === 'PIEDRA' && (
                      <div className="mt-3 pt-3 border-t border-violet-100">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">
                            Piezas de Piedra
                          </span>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                              value={stoneByInstanceId[instance.id] || ''}
                              onChange={(e) => setStonePieces(instance.id, e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => handleDeclareStonePieces(instance.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition"
                            >
                              🪨 Declarar
                            </button>
                          </div>
                        </label>
                      </div>
                    )}
                    {labelsDone ? (
                      <p className="w-full py-2 text-center text-xs font-bold text-emerald-600">
                        ✓ Etiquetas solicitadas
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={!canSolicitar}
                        onClick={async () => {
                          try {
                            await productionService.requestLabels(instance.id, mdf, herrajes);
                            setLabelsRequestedInstanceIds((prev) => ({
                              ...prev,
                              [instance.id]: true,
                            }));
                          } catch (error: unknown) {
                            const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
                            const detail = err.response?.data?.detail;
                            const msg =
                              typeof detail === 'string'
                                ? detail
                                : JSON.stringify(detail ?? err.message ?? error);
                            alert(msg);
                          }
                        }}
                        className="w-full py-2 rounded-lg text-xs font-bold border transition disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 text-white border-violet-600 hover:bg-violet-700"
                      >
                        🏷️ Solicitar Etiquetas
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {columnBatches.length === 0 && (
            <div className="border-2 border-dashed border-violet-200 rounded-lg p-6 text-center text-violet-500 text-sm">
              Sin lotes en empaque
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderColumn4 = () => {
    const status = STATUS_READY_TO_INSTALL;
    const finishedBatches = batchesForView.filter(b => b.status === status);
    
    // Extracción de productos de los lotes terminados
    const readyInstances = finishedBatches.flatMap(b => b.instances || []);

    return (
      <div 
        className="bg-emerald-50 p-4 rounded-xl w-80 flex-shrink-0 flex flex-col border border-emerald-200"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-emerald-800 uppercase tracking-wide text-sm flex items-center gap-2">
            <CheckCircle2 size={16} /> 4. Listo para Instalarse
          </h2>
          <span className="bg-emerald-200 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">{readyInstances.length}</span>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {readyInstances.map(instance => (
            <div 
              key={instance.id} 
              className="bg-white p-3 rounded-lg shadow-sm border border-emerald-200 border-l-4 border-l-emerald-500"
            >
              <div className="flex flex-col">
                <span className="font-bold text-gray-800 text-sm">{instance.custom_name}</span>
                <span className="text-[10px] text-gray-400 font-mono mt-1">ID Producto: #{instance.id}</span>
                {instance.qr_code && (
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded mt-2 w-fit">
                    QR: {instance.qr_code}
                  </span>
                )}
              </div>
            </div>
          ))}
          
          {readyInstances.length === 0 && (
            <div className="border-2 border-dashed border-emerald-200 rounded-lg p-6 text-center text-emerald-500 text-sm">
              Aduana vacía
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full bg-white">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Piso de Producción</h1>
          <p className="text-gray-500 mt-1">Control de Lotes y Despacho a Logística</p>
        </div>
        <button
          onClick={handleCreateTestBatch}
          className="bg-slate-800 text-white font-semibold px-4 py-2 rounded-lg shadow hover:bg-slate-900 transition"
        >
          + Inyectar Lote de Prueba
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide mr-2">Material</span>
        {(['ALL', 'MDF', 'PIEDRA'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMaterialFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
              materialFilter === key
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {key === 'ALL' ? 'Todos' : key}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <p className="text-gray-500 font-medium animate-pulse">Consultando piso de fábrica...</p>
        </div>
      ) : (
        <div className="flex gap-6 overflow-x-auto pb-4 h-[calc(100vh-200px)]">
          {renderColumn1()}
          {renderColumn2()}
          {renderColumnEmpaque()}
          {renderColumn4()}
        </div>
      )}
    </div>
  );
}