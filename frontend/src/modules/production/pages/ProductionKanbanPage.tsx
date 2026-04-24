import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { productionService } from '../../../api/production-service';
import axiosClient from '../../../api/axios-client';
import { ProductionBatch } from '../../../types/production';
import { Lock, Package, AlertCircle, ArrowRight, CheckCircle2, Boxes } from 'lucide-react';
import { jsPDF } from 'jspdf';

const STATUS_READY_TO_INSTALL = 'READY_TO_INSTALL';
const STATUS_PACKING = 'PACKING';

type MaterialFilter = 'ALL' | 'MDF' | 'PIEDRA';

const PRODUCTION_READ_ONLY_ROLES = ['ADMIN', 'DESIGN', 'GERENCIA'];

/** Devuelve el badge de urgencia del lote según el peor semáforo de sus instancias. */
function getBatchUrgencyBadge(batch: any): { label: string; className: string } | null {
  const instances = batch.instances || [];
  let hasRed = false;
  let hasYellow = false;
  for (const inst of instances) {
    if (inst.semaphore === 'RED') hasRed = true;
    else if (inst.semaphore === 'YELLOW') hasYellow = true;
  }
  if (hasRed) {
    return {
      label: '🔴 URGENTE',
      className: 'bg-red-100 text-red-700 border-red-300',
    };
  }
  if (hasYellow) {
    return {
      label: '🟡 PRÓXIMO',
      className: 'bg-amber-100 text-amber-700 border-amber-300',
    };
  }
  return null;
}

async function generateHerrajesPDF(
  batch: any,
  config?: { company_name: string; logo_path?: string | null } | null,
  logoB64?: string | null
) {
  const token = localStorage.getItem('token');
  const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api/v1';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ── Header: logo + empresa + título + datos lote ─────────
  const companyName = config?.company_name || 'VALENTINA ERP';

  let logoLoaded = false;
  let logoImgData: string | null = null;
  if (logoB64) {
    logoImgData = logoB64;
    logoLoaded = true;
  }

  const logoH = 16;
  let logoW = logoH; // fallback cuadrado

  // Calcular proporciones reales del logo para no deformar
  if (logoLoaded && logoImgData) {
    try {
      const sizeImg = new Image();
      sizeImg.src = logoImgData;
      await new Promise<void>(resolve => {
        sizeImg.onload = () => resolve();
        setTimeout(resolve, 500); // timeout seguro
      });
      if (sizeImg.naturalWidth && sizeImg.naturalHeight) {
        logoW = logoH * (sizeImg.naturalWidth / sizeImg.naturalHeight);
      }
    } catch { /* usar cuadrado como fallback */ }
  }

  let textX = margin;
  if (logoLoaded && logoImgData) {
    try {
      (doc as any).addImage(logoImgData, 'PNG', margin, margin, logoW, logoH);
      textX = margin + logoW + 4;
    } catch {
      textX = margin;
    }
  }

  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName.toUpperCase(), textX, margin + 7);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('LISTA DE HERRAJES PARA INSTALACIÓN', textX, margin + 13);

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  const batchLabel = batch.folio ? `Lote: ${batch.folio}` : batch.instances?.[0]?.custom_name || '';
  const dateLabel = new Date().toLocaleDateString('es-MX');
  doc.text(`${batchLabel}`, pageWidth - margin, margin + 7, { align: 'right' });
  doc.text(`${batch.batch_type || ''}  ·  ${dateLabel}`, pageWidth - margin, margin + 13, { align: 'right' });

  const headerHeight = margin + logoH + 4;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.line(margin, headerHeight, pageWidth - margin, headerHeight);

  y = headerHeight + 5;

  const instances = batch.instances || [];

  for (let idx = 0; idx < instances.length; idx++) {
    const inst = instances[idx];

    let herrajesData: any = null;
    try {
      const res = await fetch(`${baseUrl}/production/instances/${inst.id}/herrajes`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      herrajesData = await res.json();
    } catch {
      herrajesData = null;
    }

    const herrajes = herrajesData?.herrajes ?? [];

    const blockHeight = 10 + herrajes.length * 7 + 8;
    if (y + blockHeight > 275) {
      doc.addPage();
      y = margin;
    }

    // ── Header instancia ─────────────────────────────────────
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${String(idx + 1).padStart(2, '0')}. ${inst.custom_name || '—'}`, margin + 2, y + 5.5);
    if (inst.order_folio) {
      doc.setFont('helvetica', 'normal');
      doc.text(inst.order_folio, pageWidth - margin - 20, y + 5.5);
    }
    y += 10;

    if (inst.client_name || inst.project_name) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(
        [inst.client_name, inst.project_name].filter(Boolean).join(' · '),
        margin + 2, y
      );
      y += 6;
    }

    if (herrajes.length === 0) {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'italic');
      doc.text('Sin herrajes en la receta de esta instancia.', margin + 2, y);
      y += 7;
    } else {
      // ── Encabezado tabla ────────────────────────────────────
      doc.setFillColor(226, 232, 240);
      doc.rect(margin, y, pageWidth - margin * 2, 6, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('SKU', margin + 2, y + 4.2);
      doc.text('MATERIAL', margin + 32, y + 4.2);
      doc.text('CANT.', pageWidth - margin - 28, y + 4.2);
      doc.text('UNIDAD', pageWidth - margin - 14, y + 4.2);
      y += 7;

      for (let hi = 0; hi < herrajes.length; hi++) {
        const h = herrajes[hi];
        if (y > 275) { doc.addPage(); y = margin; }

        if (hi % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 1, pageWidth - margin * 2, 6.5, 'F');
        }
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.text(h.sku || '—', margin + 2, y + 4);
        const name = h.name?.length > 45 ? h.name.substring(0, 42) + '...' : (h.name || '—');
        doc.text(name, margin + 32, y + 4);
        doc.text(String(h.quantity ?? '—'), pageWidth - margin - 28, y + 4);
        doc.text(h.usage_unit || '—', pageWidth - margin - 14, y + 4);
        y += 6.5;
      }
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    y += 7;
  }

  // ── Footer ───────────────────────────────────────────────────
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `VALENTINA ERP · ${batch.folio} · Página ${p} de ${totalPages}`,
      margin, 290
    );
  }

  doc.save(`herrajes_${batch.folio}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function openBlueprintLinks(batch: any) {
  const token = localStorage.getItem('token');
  const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api/v1';
  const instances = batch.instances || [];
  const opened: Set<string> = new Set();

  for (const inst of instances) {
    try {
      const res = await fetch(`${baseUrl}/production/instances/${inst.id}/blueprint`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.blueprint_path && !opened.has(data.blueprint_path)) {
        opened.add(data.blueprint_path);
        window.open(data.blueprint_path, '_blank');
      }
    } catch {
      // silenciar errores individuales
    }
  }

  if (opened.size === 0) {
    alert('No hay planos disponibles para las instancias de este lote.');
  }
}

export default function ProductionKanbanPage() {
  const navigate = useNavigate();
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
  const isReadOnly = PRODUCTION_READ_ONLY_ROLES.includes(userRole);
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
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [herrajesPreview, setHerrajesPreview] = useState<{
    instId: number;
    instName: string;
    orderFolio: string | null;
    herrajes: any[];
    blueprintPath: string | null;
  } | null>(null);
  const [loadingHerrajesPreview, setLoadingHerrajesPreview] = useState(false);
  const [selectedPackingIds, setSelectedPackingIds] =
    useState<number[]>([]);
  const [movingToReady, setMovingToReady] = useState(false);
  const [readyInstances, setReadyInstances] = useState<any[]>([]);
  const [companyConfig, setCompanyConfig] = useState<{
    company_name: string;
    logo_path?: string | null;
  } | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const batchesForView = useMemo(() => {
    if (materialFilter === 'ALL') return batches;
    return batches.filter((b) => b.batch_type === materialFilter);
  }, [batches, materialFilter]);

  useEffect(() => {
    loadBatches();
    loadReadyInstances();
    // Cargar config de empresa para el PDF
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    fetch(`${baseUrl}/foundations/config`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setCompanyConfig({ company_name: data.company_name, logo_path: data.logo_path }))
      .catch(() => setCompanyConfig({ company_name: 'VALENTINA ERP', logo_path: null }));
    fetch(`${baseUrl}/foundations/logo-base64`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { if (data.base64) setLogoBase64(data.base64); })
      .catch(() => {});
  }, []);

  const loadReadyInstances = async () => {
    try {
      const response = await axiosClient.get('/production/instances/ready');
      setReadyInstances(response.data);
    } catch {
      console.error('Error cargando instancias listas');
    }
  };

  const loadBatches = async () => {
    try {
      setLoading(true);
      const data = await productionService.getBatches();
      setBatches(data);

      const initialBultos: Record<number, {mdf: number; herrajes: number}> = {};
      const initialStone: Record<number, number> = {};
      const initialLabels: Record<number, boolean> = {};

      data.forEach((batch: any) => {
        (batch.instances || []).forEach((inst: any) => {
          if (inst.mdf_bundles || inst.hardware_bundles) {
            initialBultos[inst.id] = {
              mdf: inst.mdf_bundles || 0,
              herrajes: inst.hardware_bundles || 0,
            };
          }
          if (inst.stone_pieces) {
            initialStone[inst.id] = inst.stone_pieces;
          }
          if (inst.declared_bundles && inst.declared_bundles > 0) {
            initialLabels[inst.id] = true;
          }
        });
      });

      setBultosByInstanceId(initialBultos);
      setStoneByInstanceId(initialStone);
      setLabelsRequestedInstanceIds(initialLabels);
    } catch (error) {
      console.error("Error al cargar los lotes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTestBatch = async () => {
    try {
      await productionService.createBatch({
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
    if (isReadOnly) { e.preventDefault(); return; }
    // Restaurada la validación estricta
    if (isLocked) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('batchId', batchId.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (
    e: React.DragEvent, newStatus: string
  ) => {
    e.preventDefault();

    // Intentar mover instancia individual (desde Empaque)
    const instanceIdStr = e.dataTransfer.getData('packingInstanceId');
    if (instanceIdStr && instanceIdStr !== '' && newStatus === STATUS_READY_TO_INSTALL) {
      // Si hay instancias seleccionadas, moverlas todas; si no, solo la arrastrada
      const idsToMove = selectedPackingIds.length > 0
        ? selectedPackingIds
        : [Number(instanceIdStr)];
      await handleMoveToReady(idsToMove);
      return;
    }

    // Fallback: mover lote completo (columnas 1 y 2)
    const batchIdStr = e.dataTransfer.getData('batchId');
    if (!batchIdStr) return;

    const batchId = parseInt(batchIdStr);
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    if (batch.status === newStatus) return;

    if (batch.status === 'IN_PRODUCTION' && newStatus === 'DRAFT') {
      alert("Operación denegada: Un lote en producción no puede regresar a la fila de espera.");
      return;
    }

    const previousBatches = [...batches];
    setBatches(prev => prev.map(b =>
      b.id === batchId ? { ...b, status: newStatus } : b
    ));

    try {
      await productionService.updateBatchStatus(batchId, newStatus);
    } catch (error: any) {
      console.error("Error actualizando estatus:", error);
      alert("No se pudo actualizar el estatus.");
      setBatches(previousBatches);
    }
  };

  const loadHerrajesPreview = async (inst: any) => {
    setLoadingHerrajesPreview(true);
    setHerrajesPreview(null);
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    try {
      const [herrajesRes, blueprintRes] = await Promise.all([
        fetch(`${baseUrl}/production/instances/${inst.id}/herrajes`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${baseUrl}/production/instances/${inst.id}/blueprint`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);
      const herrajesData = herrajesRes.ok ? await herrajesRes.json() : null;
      const blueprintData = blueprintRes.ok ? await blueprintRes.json() : null;
      setHerrajesPreview({
        instId: inst.id,
        instName: inst.custom_name || '—',
        orderFolio: inst.order_folio ?? null,
        herrajes: herrajesData?.herrajes ?? [],
        blueprintPath: blueprintData?.blueprint_path ?? null,
      });
    } catch {
      alert('Error al cargar herrajes. Verifica la conexión.');
    } finally {
      setLoadingHerrajesPreview(false);
    }
  };

  const batchStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      DRAFT: 'Por Producir',
      ON_HOLD: 'En Espera',
      IN_PRODUCTION: 'En Producción',
      PACKING: 'En Empaque',
      READY_TO_INSTALL: 'Listo para Instalar',
    };
    return map[status] ?? status;
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
                draggable={true}
                onDragStart={(e) => handleDragStart(e, batch.id, isLocked)}
                onClick={() => setSelectedBatch(batch)}
                className={`p-4 rounded-lg shadow-sm border transition ${
                  isLocked 
                    ? 'bg-red-50 border-red-300 cursor-pointer hover:shadow-md'
                    : 'bg-white border-gray-200 hover:shadow-md hover:border-blue-300 cursor-pointer'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`font-bold ${isLocked ? 'text-red-800' : 'text-gray-800'}`}>{batch.folio}</span>
                  {isLocked && <Lock size={16} className="text-red-500" title="Anticipo pendiente o Lote vacío" />}
                </div>
                {(() => {
                  const badge = getBatchUrgencyBadge(batch);
                  if (!badge) return null;
                  return (
                    <div className={`text-[10px] font-black px-2 py-1 rounded border flex items-center justify-center mb-2 ${badge.className}`}>
                      {badge.label}
                    </div>
                  );
                })()}

                {isLocked && (
                  <div className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-1 rounded flex items-center gap-1 mb-2">
                    <AlertCircle size={12} /> Bloqueado por Finanzas
                  </div>
                )}

                {(() => {
                  const summary = getBatchSummary(batch);
                  if (!summary) return null;
                  return (
                    <div className="mt-2 space-y-0.5">
                      {summary.ovs.map((ov: string) => (
                        <span key={ov}
                              className="inline-block text-[10px] font-mono
                                         font-bold text-indigo-600 bg-indigo-50
                                         px-1.5 py-0.5 rounded border
                                         border-indigo-100 mr-1">
                          {ov}
                        </span>
                      ))}
                      {summary.clients[0] && (
                        <p className="text-[10px] text-slate-500 truncate">
                          {summary.clients[0]}
                        </p>
                      )}
                      {summary.projects[0] && (
                        <p className="text-[10px] text-slate-400 truncate">
                          {summary.projects[0]}
                        </p>
                      )}
                    </div>
                  );
                })()}

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
              onClick={() => setSelectedBatch(batch)}
              className="bg-white p-4 rounded-lg shadow-sm border border-blue-200 border-l-4 border-l-blue-500 hover:shadow-md cursor-pointer"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-gray-800">{batch.folio}</span>
              </div>

              {(() => {
                const summary = getBatchSummary(batch);
                if (!summary) return null;
                return (
                  <div className="mt-2 space-y-0.5">
                    {summary.ovs.map((ov: string) => (
                      <span key={ov}
                            className="inline-block text-[10px] font-mono
                                       font-bold text-indigo-600 bg-indigo-50
                                       px-1.5 py-0.5 rounded border
                                       border-indigo-100 mr-1">
                        {ov}
                      </span>
                    ))}
                    {summary.clients[0] && (
                      <p className="text-[10px] text-slate-500 truncate">
                        {summary.clients[0]}
                      </p>
                    )}
                    {summary.projects[0] && (
                      <p className="text-[10px] text-slate-400 truncate">
                        {summary.projects[0]}
                      </p>
                    )}
                  </div>
                );
              })()}

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

  const togglePackingSelection = (instanceId: number) => {
    setSelectedPackingIds(prev =>
      prev.includes(instanceId)
        ? prev.filter(id => id !== instanceId)
        : [...prev, instanceId]
    );
  };

  const handleMoveToReady = async (instanceIds: number[]) => {
    console.log('handleMoveToReady llamado con:', instanceIds);
    if (instanceIds.length === 0) return;
    setMovingToReady(true);
    try {
      for (const id of instanceIds) {
        await productionService.markInstanceReady(id);
      }
      setSelectedPackingIds([]);
      // Limpiar estados de bultos de las instancias movidas
      setBultosByInstanceId(prev => {
        const next = { ...prev };
        instanceIds.forEach(id => delete next[id]);
        return next;
      });
      setStoneByInstanceId(prev => {
        const next = { ...prev };
        instanceIds.forEach(id => delete next[id]);
        return next;
      });
      setLabelsRequestedInstanceIds(prev => {
        const next = { ...prev };
        instanceIds.forEach(id => delete next[id]);
        return next;
      });
      // Recargar con pequeño delay para dar tiempo al backend
      await new Promise(resolve => setTimeout(resolve, 100));
      await loadBatches();
      await loadReadyInstances();
    } catch (error: any) {
      console.error('Error:', error);
      alert(
        error?.response?.data?.detail ||
        'Error al mover instancias.'
      );
    } finally {
      setMovingToReady(false);
    }
  };

  const renderColumnEmpaque = () => {
    const status = STATUS_PACKING;
    const columnBatches = batchesForView.filter(b => b.status === status);
    const allInstances = columnBatches.flatMap(batch =>
      (batch.instances || []).map((inst: any) => ({
        ...inst,
        batch_folio: batch.folio,
        batch_type: batch.batch_type,
      }))
    );

    return (
      <div
        className="bg-violet-50/60 p-4 rounded-xl w-[22rem] flex-shrink-0 flex flex-col border border-violet-200"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          // Instancia individual desde Empaque (no aplica aquí)
          // Lote desde En Producción
          const batchIdStr = e.dataTransfer.getData('batchId');
          if (batchIdStr && batchIdStr !== '') {
            handleDrop(e, STATUS_PACKING);
          }
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-violet-900 uppercase tracking-wide text-sm flex items-center gap-2">
            <Boxes size={16} /> 3. En Empaque
          </h2>
          <span className="bg-violet-200 text-violet-900 text-xs font-bold px-2 py-1 rounded-full">
            {allInstances.length}
          </span>
        </div>

        {/* Botón mover seleccionadas */}
        {selectedPackingIds.length > 0 && (
          <button
            type="button"
            onClick={() => {
              console.log('BOTÓN VERDE CLICKEADO', selectedPackingIds);
              handleMoveToReady(selectedPackingIds);
            }}
            disabled={movingToReady}
            className="mb-3 w-full py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={14} />
            {movingToReady
              ? 'Moviendo...'
              : `Mover ${selectedPackingIds.length} a Listo`}
          </button>
        )}

        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {allInstances.length === 0 && (
            <div className="border-2 border-dashed border-violet-200 rounded-lg p-6 text-center text-violet-500 text-sm">
              Sin instancias en empaque
            </div>
          )}
          {allInstances.map((instance: any) => {
            const isStone = instance.batch_type === 'PIEDRA';
            const { mdf, herrajes } = getBultosRow(instance.id);
            const stonePieces = stoneByInstanceId[instance.id] ?? 0;
            const canSolicitar = isStone
              ? stonePieces >= 1
              : mdf > 0 && herrajes > 0;
            const labelsDone = labelsRequestedInstanceIds[instance.id];
            const isSelected = selectedPackingIds.includes(instance.id);

            return (
              <div
                key={`${instance.id}-${instance.batch_folio}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('packingInstanceId', String(instance.id));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className={`p-3 rounded-lg shadow-sm border border-l-4 border-l-violet-400 cursor-grab active:cursor-grabbing transition ${
                  isSelected
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-violet-100'
                }`}
              >
                {/* Checkbox + Info */}
                <div className="flex items-start gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePackingSelection(instance.id)}
                    className="mt-1 shrink-0 cursor-pointer accent-emerald-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {instance.order_folio && (
                        <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                          {instance.order_folio}
                        </span>
                      )}
                      {instance.client_name && (
                        <span className="text-[10px] text-slate-500 truncate">
                          {instance.client_name}
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-gray-800 text-sm truncate">
                      {instance.custom_name}
                    </p>
                    <p className="text-[10px] text-violet-600 font-medium">
                      {instance.batch_folio}
                    </p>
                  </div>
                </div>

                {/* Bultos MDF/Herrajes — solo para lotes no-PIEDRA */}
                {!isStone && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Bultos MDF</span>
                      <input
                        type="number" min={0} step={1}
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                        value={mdf || ''}
                        onChange={(e) => setBultosField(instance.id, 'mdf', e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Bultos Herrajes</span>
                      <input
                        type="number" min={0} step={1}
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                        value={herrajes || ''}
                        onChange={(e) => setBultosField(instance.id, 'herrajes', e.target.value)}
                      />
                    </label>
                  </div>
                )}

                {/* Piezas de Piedra — solo lotes PIEDRA */}
                {isStone && (
                  <div className="mt-2 mb-3 pt-2 border-t border-violet-100">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Piezas de Piedra</span>
                      <div className="flex gap-2">
                        <input
                          type="number" min={1} step={1}
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

                {/* Botón etiquetas */}
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
                        await productionService.requestLabels(
                          instance.id,
                          isStone ? 1 : mdf,
                          isStone ? 1 : herrajes,
                        );
                        setLabelsRequestedInstanceIds(prev => ({
                          ...prev, [instance.id]: true,
                        }));
                      } catch (error: unknown) {
                        const err = error as {
                          response?: { data?: { detail?: unknown } };
                          message?: string
                        };
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
      </div>
    );
  };

  const renderColumn4 = () => {
    const allReady = readyInstances;

    return (
      <div
        className="bg-emerald-50 p-4 rounded-xl w-80 flex-shrink-0 flex flex-col border border-emerald-200"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const instanceIdStr = e.dataTransfer.getData('packingInstanceId');
          if (instanceIdStr && instanceIdStr !== '') {
            const idsToMove = selectedPackingIds.length > 0
              ? selectedPackingIds
              : [Number(instanceIdStr)];
            handleMoveToReady(idsToMove);
            return;
          }
          const batchIdStr = e.dataTransfer.getData('batchId');
          if (batchIdStr && batchIdStr !== '') {
            handleDrop(e, STATUS_READY_TO_INSTALL);
          }
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-emerald-800 uppercase tracking-wide text-sm flex items-center gap-2">
            <CheckCircle2 size={16} /> 4. Listo para Instalarse
          </h2>
          <span className="bg-emerald-200 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">
            {allReady.length}
          </span>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          {allReady.map((instance: any, idx: number) => {
            const isStoneTrack = instance.track === 'PIEDRA';
            const otherLabel = (() => {
              const ots = instance.other_track_status;
              const otherName = isStoneTrack ? 'MDF' : 'Piedra';
              if (!ots) return null;
              if (ots === 'READY_TO_INSTALL' || ots === 'PACKING') {
                return `${otherName}: listo / empacando`;
              }
              if (ots === 'IN_PRODUCTION') {
                return `${otherName}: en producción`;
              }
              if (ots === 'DRAFT' || ots === 'ON_HOLD') {
                return `${otherName}: pendiente`;
              }
              return `${otherName}: ${ots}`;
            })();
            return (
              <div
                key={`${instance.id}-${instance.track}-${idx}`}
                className={`bg-white p-3 rounded-lg shadow-sm border border-l-4 ${
                  isStoneTrack
                    ? 'border-stone-200 border-l-stone-500'
                    : 'border-emerald-200 border-l-emerald-500'
                }`}
              >
                {/* Badge de track */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                    isStoneTrack
                      ? 'bg-stone-100 text-stone-700 border-stone-300'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  }`}>
                    {isStoneTrack ? '🪨 Track Piedra' : '🪵 Track MDF'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mb-1">
                  {instance.order_folio && (
                    <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                      {instance.order_folio}
                    </span>
                  )}
                  {instance.client_name && (
                    <span className="text-[10px] text-slate-500 truncate">
                      {instance.client_name}
                    </span>
                  )}
                </div>
                <p className="font-bold text-gray-800 text-sm">{instance.custom_name}</p>
                <p className="text-[10px] text-emerald-600 font-medium mt-0.5">{instance.batch_folio}</p>

                {otherLabel && (
                  <p className="text-[10px] text-slate-500 mt-1 italic">
                    {otherLabel}
                  </p>
                )}

                {instance.qr_code && (
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded mt-2 w-fit block">
                    QR: {instance.qr_code}
                  </span>
                )}
              </div>
            );
          })}

          {allReady.length === 0 && (
            <div className="border-2 border-dashed border-emerald-200 rounded-lg p-6 text-center text-emerald-500 text-sm">
              Aduana vacía
            </div>
          )}
        </div>
      </div>
    );
  };

  const getBatchSummary = (batch: any) => {
    const instances = batch.instances || [];
    if (instances.length === 0) return null;
    const ovs = [...new Set(
      instances.map((i: any) => i.order_folio).filter(Boolean)
    )] as string[];
    const clients = [...new Set(
      instances.map((i: any) => i.client_name).filter(Boolean)
    )] as string[];
    const projects = [...new Set(
      instances.map((i: any) => i.project_name).filter(Boolean)
    )] as string[];
    return { ovs, clients, projects };
  };

  return (
    <div className="p-6 h-full bg-white">
      <div className="flex justify-between items-center mb-8 
                    border-b pb-4">
        <div>
          <div className="flex items-center">
            <h1 className="text-3xl font-bold text-gray-800">
              Piso de Producción
            </h1>
            {isReadOnly && (
              <span className="text-xs font-bold px-2 py-1 rounded-lg
                               bg-slate-100 text-slate-500 border
                               border-slate-200 ml-2">
                👁 Solo Lectura
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">
            Control de Lotes y Despacho a Logística
          </p>
        </div>
        <button
          onClick={() => navigate('/production')}
          className="flex items-center gap-2 bg-white border
                     border-slate-300 text-slate-700 px-4 py-2
                     rounded-lg font-bold hover:bg-slate-50
                     hover:text-slate-900 transition-all shadow-sm"
        >
          ← Regresar
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

      {selectedBatch && (
        <div
          className="fixed inset-0 z-50 flex items-center 
                     justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedBatch(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border
                       border-slate-200 w-full max-w-2xl mx-4
                       overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between
                            px-6 py-4 bg-slate-50
                            border-b border-slate-200">
              <div>
                <h2 className="text-lg font-black text-slate-800">
                  {selectedBatch.folio}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedBatch.batch_type} ·{' '}
                  {batchStatusLabel(selectedBatch.status)}
                </p>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="text-slate-400 hover:text-slate-600
                           text-lg leading-none p-1"
              >
                ✕
              </button>
            </div>

            {/* Instancias */}
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              {(selectedBatch.instances || []).length === 0 ? (
                <p className="text-slate-400 text-center py-8 italic">
                  Sin instancias asignadas.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {(selectedBatch.instances || []).map((inst: any) => (
                    <div key={inst.id}
                         className="bg-slate-50 rounded-xl border
                                    border-slate-200 overflow-hidden">
                      {/* Cabecera instancia */}
                      <div className="px-4 py-3">
                        {/* OV + Cliente */}
                        <div className="flex items-center gap-2 mb-1">
                          {inst.order_folio && (
                            <span className="text-[10px] font-mono font-bold
                                             text-indigo-600 bg-indigo-50
                                             px-2 py-0.5 rounded border
                                             border-indigo-100">
                              {inst.order_folio}
                            </span>
                          )}
                          {inst.client_name && (
                            <span className="text-xs text-slate-500 truncate">
                              {inst.client_name}
                            </span>
                          )}
                        </div>
                        {/* Nombre instancia */}
                        <p className="font-bold text-slate-800 text-sm">
                          {inst.custom_name || '—'}
                        </p>
                        {/* Material(es) clave — puede haber más de uno */}
                        {inst.key_materials && inst.key_materials.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-1">
                            {inst.key_materials.map((km: any, idx: number) => (
                              <div key={`${km.sku}-${idx}`} className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold uppercase
                                                 tracking-wide text-slate-400">
                                  {selectedBatch.batch_type === 'PIEDRA'
                                    ? '🪨 Piedra' : '🪵 Tablero'}
                                </span>
                                <span className="text-xs font-mono text-slate-600
                                                 bg-white border border-slate-200
                                                 px-2 py-0.5 rounded">
                                  {km.sku}
                                </span>
                                <span className="text-xs text-slate-600 truncate flex-1">
                                  {km.name}
                                </span>
                                <span className="text-xs font-bold text-slate-700
                                                 bg-amber-50 border border-amber-200
                                                 px-2 py-0.5 rounded whitespace-nowrap">
                                  {km.quantity} {km.usage_unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Acciones: Herrajes y Planos */}
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => loadHerrajesPreview(inst)}
                            disabled={loadingHerrajesPreview}
                            className="flex items-center gap-1.5 text-xs font-bold
                                       text-amber-700 bg-amber-50 border border-amber-200
                                       px-3 py-1.5 rounded-lg hover:bg-amber-100 transition
                                       disabled:opacity-50"
                          >
                            📋 Herrajes
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const token = localStorage.getItem('token');
                              const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
                              try {
                                const res = await fetch(
                                  `${baseUrl}/production/instances/${inst.id}/blueprint`,
                                  { headers: { 'Authorization': `Bearer ${token}` } }
                                );
                                const data = await res.json();
                                if (data.blueprint_path) {
                                  window.open(data.blueprint_path, '_blank');
                                } else {
                                  alert('Esta instancia no tiene plano disponible.');
                                }
                              } catch {
                                alert('Error al obtener el plano.');
                              }
                            }}
                            className="flex items-center gap-1.5 text-xs font-bold
                                       text-indigo-700 bg-indigo-50 border border-indigo-200
                                       px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition"
                          >
                            📐 Planos
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100
                            flex justify-end">
              <button
                onClick={() => setSelectedBatch(null)}
                className="px-5 py-2 rounded-xl text-sm font-bold
                           bg-slate-100 hover:bg-slate-200
                           text-slate-700 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de vista previa de herrajes */}
      {herrajesPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setHerrajesPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200
                       w-full max-w-2xl mx-4 overflow-hidden max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-start justify-between">
              <div>
                <h2 className="text-base font-black text-slate-800">
                  📋 Lista de Herrajes para Instalación
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {herrajesPreview.instName}
                  {herrajesPreview.orderFolio && ` · ${herrajesPreview.orderFolio}`}
                </p>
              </div>
              <button
                onClick={() => setHerrajesPreview(null)}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >✕</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {herrajesPreview.herrajes.length === 0 ? (
                <p className="text-slate-400 italic text-sm text-center py-8">
                  Sin herrajes en la receta de esta instancia.
                </p>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
                      <th className="px-3 py-2 font-bold">SKU</th>
                      <th className="px-3 py-2 font-bold">Material</th>
                      <th className="px-3 py-2 font-bold text-right">Cantidad</th>
                      <th className="px-3 py-2 font-bold">Unidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {herrajesPreview.herrajes.map((h: any, i: number) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{h.sku}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{h.name}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-800">{h.quantity}</td>
                        <td className="px-3 py-2 text-slate-500">{h.usage_unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center gap-3">
              {herrajesPreview.blueprintPath ? (
                <a
                  href={herrajesPreview.blueprintPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm
                             font-bold text-indigo-600 border border-indigo-200
                             bg-indigo-50 hover:bg-indigo-100 transition"
                >
                  📐 Ver Plano
                </a>
              ) : (
                <span className="text-xs text-slate-400 italic">Sin plano disponible</span>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setHerrajesPreview(null)}
                  className="px-4 py-2 text-sm text-slate-500 border border-slate-200
                             rounded-xl hover:bg-slate-50 transition"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    if (herrajesPreview) {
                      void generateHerrajesPDF({
                        folio: herrajesPreview.instName,
                        batch_type: '',
                        instances: [{
                          id: herrajesPreview.instId,
                          custom_name: herrajesPreview.instName,
                          order_folio: herrajesPreview.orderFolio,
                          client_name: null,
                        }],
                      }, companyConfig, logoBase64);
                    }
                  }}
                  disabled={herrajesPreview.herrajes.length === 0}
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-amber-600
                             hover:bg-amber-700 text-white transition disabled:opacity-40"
                >
                  🖨️ Imprimir PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
