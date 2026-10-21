import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { productionService, getInventoryConflict, type StockShortage } from '../../../api/production-service';
import axiosClient from '../../../api/axios-client';
import { ProductionBatch } from '../../../types/production';
import { Lock, Package, AlertCircle, ArrowRight, CheckCircle2, Boxes, Factory, LogOut, Home, Search, Eye, Tag, Gem, PackageCheck, ClipboardList, Ruler } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import { RecordHistoryButton } from '@/components/audit/RecordHistoryButton';
import { houseLabel, matchesSearch } from '@/utils/houseLabel';
import { Input } from '@/components/ui/Input';
import { VTable, VTableColumn } from '@/components/ui/VTable';
import { ReversalDialog, ShortageDialog, type ReversalInput } from '../components/BatchInventoryDialogs';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ModalFooter } from '@/components/ui/ModalFooter';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { formatDate, formatQty } from '@/utils/format';
const STATUS_READY_TO_INSTALL = 'READY_TO_INSTALL'; // batch status (its instances become READY)
const STATUS_PACKING = 'PACKING';

type MaterialFilter = 'ALL' | 'MDF' | 'PIEDRA';

const PRODUCTION_READ_ONLY_ROLES = ['ADMIN', 'DESIGN', 'MANAGER'];
const INVENTORY_AUTHORIZER_ROLES = ['DIRECTOR', 'MANAGER'];
const POST_PRODUCTION_STATUSES = ['IN_PRODUCTION', 'PACKING', 'READY_TO_INSTALL', 'FINISHED'];
const LOADED_INSTANCE_STATUSES = ['CARGADO', 'INSTALLED', 'CLOSED', 'WARRANTY'];

type ShortageState = { batchId: number; newStatus: string; batchFolio: string; shortages: StockShortage[] };
type ReversalState =
  | { kind: 'batch'; batchId: number; newStatus: string; batchFolio: string }
  | { kind: 'instance'; batchId: number; batchFolio: string; instanceId: number; instanceName: string; discharged: boolean };

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
      label: 'Urgente',
      className: 'bg-red-50 text-red-700 border-red-200',
    };
  }
  if (hasYellow) {
    return {
      label: 'Próximo',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }
  return null;
}

async function generateHerrajesPDF(
  batch: any,
  config?: { company_name: string; logo_path?: string | null } | null,
  logoB64?: string | null
) {

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
  const dateLabel = formatDate(new Date());
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
      herrajesData = (await axiosClient.get(`/production/instances/${inst.id}/herrajes`)).data;
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
  const instances = batch.instances || [];
  const opened: Set<string> = new Set();

  for (const inst of instances) {
    try {
      const { data } = await axiosClient.get(`/production/instances/${inst.id}/blueprint`);
      if (data.blueprint_path && !opened.has(data.blueprint_path)) {
        opened.add(data.blueprint_path);
        window.open(data.blueprint_path, '_blank');
      }
    } catch {
      // silenciar errores individuales
    }
  }

  if (opened.size === 0) {
    toast.warning('No hay planos disponibles para las instancias de este lote.');
  }
}

export default function ProductionKanbanPage() {
  const navigate = useNavigate();
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
  const isReadOnly = PRODUCTION_READ_ONLY_ROLES.includes(userRole);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingLabelsId, setRequestingLabelsId] = useState<number | null>(null);
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>('ALL');
  /** Bultos por instancia (solo UI; sin persistencia aún). */
  const [bultosByInstanceId, setBultosByInstanceId] = useState<
    Record<number, { mdf: number; herrajes: number }>
  >({});
  /** Etiquetas ya solicitadas, por casa y tipo de lote (H33: "<id>-MDF" / "<id>-PIEDRA"). */
  const [labelsRequestedInstanceIds, setLabelsRequestedInstanceIds] = useState<Record<string, boolean>>(
    {}
  );
  const labelsKey = (instanceId: number, isStone: boolean) => `${instanceId}-${isStone ? 'PIEDRA' : 'MDF'}`;
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
  const [dispatchingHardware, setDispatchingHardware] = useState<number | null>(null);
  const [readyInstances, setReadyInstances] = useState<any[]>([]);
  const [companyConfig, setCompanyConfig] = useState<{
    company_name: string;
    logo_path?: string | null;
  } | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [pendingDispatchInst, setPendingDispatchInst] = useState<any | null>(null);
  const [shortageState, setShortageState] = useState<ShortageState | null>(null);
  const [reversalState, setReversalState] = useState<ReversalState | null>(null);
  const canAuthorizeInventory = INVENTORY_AUTHORIZER_ROLES.includes(userRole);

  // H26: search by OV, client, project or house; a batch shows only its matching houses.
  const [search, setSearch] = useState('');
  const instanceMatches = (inst: any) =>
    matchesSearch(search, [inst.order_folio, inst.client_name, inst.project_name, inst.custom_name, inst.street,
      inst.lot, houseLabel(inst)]);
  const batchesForView = useMemo(() => {
    const byMaterial = materialFilter === 'ALL' ? batches : batches.filter((b) => b.batch_type === materialFilter);
    if (!search.trim()) return byMaterial;
    return byMaterial
      .map((b) => (matchesSearch(search, [b.folio]) ? b : { ...b, instances: (b.instances || []).filter(instanceMatches) }))
      .filter((b) => (b.instances || []).length > 0 || matchesSearch(search, [b.folio]));
  }, [batches, materialFilter, search]);

  // Overflow del main controlado en MainLayout via FIXED_LAYOUT_ROUTES

  useEffect(() => {
    loadBatches();
    loadReadyInstances();
    // Cargar config de empresa para el PDF
    axiosClient.get('/foundations/config')
      .then(({ data }) => setCompanyConfig({ company_name: data.company_name, logo_path: data.logo_path }))
      .catch(() => setCompanyConfig({ company_name: 'VALENTINA ERP', logo_path: null }));
    axiosClient.get('/foundations/logo-base64')
      .then(({ data }) => { if (data.base64) setLogoBase64(data.base64); })
      .catch(() => {});
  }, []);

  const loadReadyInstances = async () => {
    try {
      const response = await axiosClient.get('/production/instances/ready');
      setReadyInstances(response.data);
    } catch {
      toast.error('Error al cargar instancias listas para instalar.');
    }
  };

  const loadBatches = async () => {
    try {
      setLoading(true);
      const data = await productionService.getBatches();
      setBatches(data);

      const initialBultos: Record<number, {mdf: number; herrajes: number}> = {};
      const initialStone: Record<number, number> = {};
      const initialLabels: Record<string, boolean> = {};

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
          if ((inst.mdf_bundles || 0) + (inst.hardware_bundles || 0) > 0) {
            initialLabels[`${inst.id}-MDF`] = true;
          }
          if (inst.stone_pieces && inst.stone_pieces > 0) {
            initialLabels[`${inst.id}-PIEDRA`] = true;
          }
        });
      });

      // H30: a reload (e.g. after "Herrajes surtidos") keeps what was typed and not requested yet.
      setBultosByInstanceId((prev) => ({ ...prev, ...initialBultos }));
      setStoneByInstanceId((prev) => ({ ...prev, ...initialStone }));
      setLabelsRequestedInstanceIds(initialLabels);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Error al cargar los lotes.');
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
      toast.error(typeof serverError === 'string' ? serverError : 'Error del backend al crear lote.');
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
      await handleMoveToReady([Number(instanceIdStr)]);
      return;
    }

    // Fallback: mover lote completo (columnas 1 y 2)
    const batchIdStr = e.dataTransfer.getData('batchId');
    if (!batchIdStr) return;

    const batchId = parseInt(batchIdStr);
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    if (batch.status === newStatus) return;

    if (batch.status === 'IN_PRODUCTION' && newStatus === 'DRAFT' && !canAuthorizeInventory) {
      toast.warning('Operación denegada: solo Dirección o Gerencia pueden regresar un lote en producción.');
      return;
    }

    const previousBatches = [...batches];
    setBatches(prev => prev.map(b =>
      b.id === batchId ? { ...b, status: newStatus } : b
    ));

    try {
      await productionService.updateBatchStatus(batchId, newStatus);
    } catch (error: any) {
      setBatches(previousBatches);
      const conflict = getInventoryConflict(error);
      if (conflict?.code === 'INSUFFICIENT_STOCK') {
        setShortageState({ batchId, newStatus, batchFolio: batch.folio, shortages: conflict.shortages ?? [] });
      } else if (conflict?.code === 'ADVANCE_REQUIRED') {
        toast.error(conflict.message);
      } else if (conflict?.code === 'REVERSAL_REQUIRED') {
        setReversalState({ kind: 'batch', batchId, newStatus, batchFolio: batch.folio });
      } else {
        toast.error(error?.response?.data?.detail || 'No se pudo actualizar el estatus.');
      }
    }
  };

  const handleAuthorizeShortage = async (reason: string) => {
    if (!shortageState) return;
    try {
      await productionService.updateBatchStatus(shortageState.batchId, shortageState.newStatus, { override_reason: reason });
      toast.success(`Lote ${shortageState.batchFolio} en producción con material en negativo autorizado.`);
      setShortageState(null);
      await loadBatches();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'No se pudo autorizar la entrada a producción.');
    }
  };

  const handleConfirmReversal = async ({ reason, disposition }: ReversalInput) => {
    if (!reversalState) return;
    const reversal = disposition ? { reason, disposition } : undefined;
    try {
      if (reversalState.kind === 'batch') {
        await productionService.updateBatchStatus(reversalState.batchId, reversalState.newStatus, { reversal });
        toast.success(`Lote ${reversalState.batchFolio} regresó a espera.`);
      } else {
        await productionService.removeInstanceFromBatch(reversalState.batchId, reversalState.instanceId, reason, reversal);
        toast.success(`${reversalState.instanceName} salió del lote ${reversalState.batchFolio}.`);
        setSelectedBatch(null);
      }
      setReversalState(null);
      await loadBatches();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : detail?.message || 'No se pudo completar la operación.');
    }
  };

  const executeDispatchHardware = async (inst: any) => {
    setDispatchingHardware(inst.id);
    try {
      await productionService.dispatchHardware(inst.id);
      setSelectedBatch((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          instances: prev.instances.map((i: any) =>
            i.id === inst.id
              ? { ...i, hardware_dispatched: true, hardware_dispatched_at: new Date().toISOString() }
              : i
          ),
        };
      });
      await loadBatches();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Error al marcar herrajes como surtidos.');
    } finally {
      setDispatchingHardware(null);
    }
  };

  const handleDispatchHardware = (inst: any) => {
    if (inst.hardware_dispatched) return;
    setPendingDispatchInst(inst);
  };

  const loadHerrajesPreview = async (inst: any) => {
    setLoadingHerrajesPreview(true);
    setHerrajesPreview(null);
    try {
      const [herrajesRes, blueprintRes] = await Promise.allSettled([
        axiosClient.get(`/production/instances/${inst.id}/herrajes`),
        axiosClient.get(`/production/instances/${inst.id}/blueprint`),
      ]);
      const herrajesData = herrajesRes.status === 'fulfilled' ? herrajesRes.value.data : null;
      const blueprintData = blueprintRes.status === 'fulfilled' ? blueprintRes.value.data : null;
      setHerrajesPreview({
        instId: inst.id,
        instName: inst.custom_name || '—',
        orderFolio: inst.order_folio ?? null,
        herrajes: herrajesData?.herrajes ?? [],
        blueprintPath: blueprintData?.blueprint_path ?? null,
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Error al cargar herrajes. Verifica la conexión.');
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
      FINISHED: 'Terminado',
      DEAD: 'Terminado',
      CANCELLED: 'Cancelado',
    };
    return map[status] ?? status;
  };

  // --- RENDERIZADO DE COLUMNAS HÍBRIDAS ---
  // Guide v2: white columns. Material colors are information and stay (Gabriel 20/10): MDF amber, Piedra violet,
  // blocked red — on batch and house cards and on the type label.
  const columnClass = 'bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex-shrink-0 flex flex-col h-full min-h-0';
  const isStoneType = (type?: string) => (type || '').toUpperCase() === 'PIEDRA';
  const materialCardColor = (type?: string, locked = false) => (locked
    ? 'bg-red-50 border-red-300'
    : isStoneType(type) ? 'bg-violet-50 border-violet-100 border-l-violet-500' : 'bg-amber-50 border-amber-100 border-l-amber-500');
  const cardClass = (type?: string, locked = false) =>
    `p-4 rounded-lg shadow-sm border border-l-4 transition hover:shadow-md cursor-pointer ${materialCardColor(type, locked)}`;
  const labelClass = 'inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border';
  const typeLabelClass = (type?: string, locked = false) => (locked
    ? `${labelClass} bg-red-100 text-red-700 border-red-200`
    : isStoneType(type) ? `${labelClass} bg-violet-100 text-violet-700 border-violet-200`
    : `${labelClass} bg-amber-100 text-amber-700 border-amber-200`);
  const ovLabelClass = 'inline-block text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 mr-1';
  const columnScrollStyle = { maxHeight: 'calc(100vh - 340px)' };

  const renderColumnHeader = (title: string, count: number, icon?: React.ReactNode) => (
    <div className="flex shrink-0 justify-between items-center mb-4">
      <h2 className="font-bold text-slate-700 text-sm flex items-center gap-2">{icon}{title}</h2>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 tabular-nums">
        {count}
      </span>
    </div>
  );

  const renderBatchSummary = (batch: any) => {
    const summary = getBatchSummary(batch);
    if (!summary) return null;
    return (
      <div className="mt-2 space-y-0.5">
        {summary.ovs.map((ov: string) => (
          <span key={ov} className={ovLabelClass}>{ov}</span>
        ))}
        {summary.clients[0] && (
          <p className="text-[10px] text-slate-500 truncate">{summary.clients[0]}</p>
        )}
        {summary.projects[0] && (
          <p className="text-[10px] text-slate-400 truncate">{summary.projects[0]}</p>
        )}
        {summary.houses.length > 0 && (
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1" title={summary.houses.join(' · ')}>
            <Home size={12} className="text-slate-400 shrink-0" />
            <span className="truncate">
              {summary.houses.slice(0, 4).join(' · ')}{summary.houses.length > 4 ? ` +${summary.houses.length - 4}` : ''}
            </span>
          </p>
        )}
      </div>
    );
  };

  const renderOvGroupSummary = (group: { folio: string; client: string; project: string; instances: any[] }) => (
    <summary className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border-b border-indigo-100 cursor-pointer list-none hover:bg-indigo-100 transition-colors">
      <span className="text-xs font-black text-indigo-900">{group.folio}</span>
      <span className="text-[10px] text-slate-600 flex-1 truncate">{group.project} — {group.client}</span>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-indigo-800 border border-indigo-100 shrink-0 tabular-nums">
        {group.instances.length}
      </span>
    </summary>
  );

  const renderColumn1 = () => {
    const status = 'DRAFT';
    const columnBatches = batchesForView.filter(b => b.status === status);

    return (
      <div
        className={`${columnClass} w-80`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        {renderColumnHeader('Lote por producir', columnBatches.length)}
        <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={columnScrollStyle}>
          {columnBatches.map(batch => {
            const isLocked = !batch.is_payment_cleared;
            const badge = getBatchUrgencyBadge(batch);
            return (
              <div
                key={batch.id}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, batch.id, isLocked)}
                onClick={() => setSelectedBatch(batch)}
                className={cardClass(batch.batch_type, isLocked)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`font-bold ${isLocked ? 'text-red-800' : 'text-slate-800'}`}>{batch.folio}</span>
                  {isLocked && <Lock size={16} className="text-red-500" title="Anticipo pendiente o Lote vacío" />}
                </div>
                {(badge || isLocked) && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {badge && <span className={`${labelClass} ${badge.className}`}>{badge.label}</span>}
                    {isLocked && (
                      <span className={`${labelClass} bg-red-50 text-red-700 border-red-200`}>
                        <AlertCircle size={12} /> Bloqueado por Finanzas
                      </span>
                    )}
                  </div>
                )}

                {renderBatchSummary(batch)}

                <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200/60">
                  <span className={typeLabelClass(batch.batch_type, isLocked)}>{batch.batch_type}</span>
                  <span className="text-xs font-medium text-slate-500 flex items-center gap-1 tabular-nums">
                    <Package size={12}/> {batch.instances?.length || 0} items
                  </span>
                </div>
              </div>
            );
          })}
          {columnBatches.length === 0 && <VEmptyState icon={<Package />} title="Fila de espera vacía" />}
        </div>
      </div>
    );
  };

  const renderColumn2 = () => {
    const status = 'IN_PRODUCTION';
    const columnBatches = batchesForView.filter(b => b.status === status);

    return (
      <div
        className={`${columnClass} w-80`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, status)}
      >
        {renderColumnHeader('En producción', columnBatches.length, <ArrowRight size={16} className="text-indigo-600" />)}
        <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={columnScrollStyle}>
          {columnBatches.map(batch => (
            <div
              key={batch.id}
              draggable
              onDragStart={(e) => handleDragStart(e, batch.id, false)}
              onClick={() => setSelectedBatch(batch)}
              className={cardClass(batch.batch_type)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-800">{batch.folio}</span>
              </div>

              {renderBatchSummary(batch)}

              <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200/60">
                <span className={typeLabelClass(batch.batch_type)}>{batch.batch_type}</span>
                <span className="text-xs font-medium text-slate-500">En proceso...</span>
              </div>
            </div>
          ))}
          {columnBatches.length === 0 && <VEmptyState icon={<Factory />} title="Máquinas detenidas" />}
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
      toast.warning('Ingresa al menos 1 pieza de piedra.');
      return;
    }
    try {
      await axiosClient.patch(`/production/instances/${instanceId}/stone_pieces`, { stone_pieces: pieces });
      toast.success(`${pieces} piezas de piedra declaradas correctamente.`);
      setLabelsRequestedInstanceIds((prev) => ({ ...prev, [`${instanceId}-PIEDRA`]: true }));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al declarar piezas de piedra.');
    }
  };

  const handleMoveToReady = async (instanceIds: number[]) => {
    if (instanceIds.length === 0) return;
    try {
      for (const id of instanceIds) {
        const moved = await productionService.markInstanceReady(id);
        // H56: moved to Listo without printing; the request stays in the print center
        if (moved?.unprinted?.length) {
          toast.warning(`${moved.custom_name}: falta imprimir ${moved.unprinted.join(' y ')}. Sigue en el Centro de Impresión.`);
        }
      }
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
        instanceIds.forEach(id => { delete next[`${id}-MDF`]; delete next[`${id}-PIEDRA`]; });
        return next;
      });
      // Recargar con pequeño delay para dar tiempo al backend
      await new Promise(resolve => setTimeout(resolve, 100));
      await loadBatches();
      await loadReadyInstances();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Error al mover instancias.');
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
        className={`${columnClass} w-[22rem]`}
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
        {renderColumnHeader('En empaque', allInstances.length, <Boxes size={16} className="text-indigo-600" />)}

        <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={columnScrollStyle}>
          {allInstances.length === 0 && <VEmptyState icon={<Boxes />} title="Sin instancias en empaque" />}
          {(() => {
            const ovMap = new Map<string, { folio: string; client: string; project: string; instances: any[] }>();
            for (const inst of allInstances) {
              const key = inst.order_folio || 'Sin OV';
              if (!ovMap.has(key)) ovMap.set(key, { folio: key, client: inst.client_name || '—', project: inst.project_name || '—', instances: [] });
              ovMap.get(key)!.instances.push(inst);
            }
            const groups = Array.from(ovMap.values()).sort((a, b) => a.folio.localeCompare(b.folio));
            return groups.map(group => (
              <details key={group.folio} className="rounded-lg border border-slate-200 overflow-hidden" open={groups.length === 1}>
                {renderOvGroupSummary(group)}
                <div className="flex flex-col gap-3 p-2 bg-white">
                  {group.instances.map((instance: any) => {
            const isStone = instance.batch_type === 'PIEDRA';
            const { mdf, herrajes } = getBultosRow(instance.id);
            const stonePieces = stoneByInstanceId[instance.id] ?? 0;
            const canSolicitar = isStone
              ? stonePieces >= 1
              : mdf > 0 && herrajes > 0;
            const labelsDone = labelsRequestedInstanceIds[labelsKey(instance.id, isStone)];

            return (
              <div
                key={instance.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('packingInstanceId', String(instance.id));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className={`p-3 rounded-lg shadow-sm border border-l-4 cursor-grab active:cursor-grabbing transition ${materialCardColor(instance.batch_type)}`}
              >
                <div className="flex items-start gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {instance.order_folio && <span className={ovLabelClass}>{instance.order_folio}</span>}
                      {instance.client_name && (
                        <span className="text-[10px] text-slate-500 truncate">{instance.client_name}</span>
                      )}
                    </div>
                    <p className="font-bold text-slate-800 text-sm truncate">{instance.custom_name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={typeLabelClass(instance.batch_type)}>{instance.batch_type}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{instance.batch_folio}</span>
                    </div>
                  </div>
                </div>

                {/* Bultos MDF/Herrajes — solo para lotes no-PIEDRA */}
                {!isStone && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-500">Bultos MDF</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="w-full"
                        value={mdf || ''}
                        onChange={(e) => setBultosField(instance.id, 'mdf', e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-500">Bultos herrajes</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="w-full"
                        value={herrajes || ''}
                        onChange={(e) => setBultosField(instance.id, 'herrajes', e.target.value)}
                      />
                    </label>
                  </div>
                )}

                {/* Piezas de Piedra — solo lotes PIEDRA */}
                {isStone && (
                  <div className="mt-2 mb-3 pt-2 border-t border-slate-100">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-500">Piezas de piedra</span>
                      {/* H52: one button below declares the pieces and requests the manifest */}
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={stoneByInstanceId[instance.id] || ''}
                        onChange={(e) => setStonePieces(instance.id, e.target.value)}
                      />
                    </label>
                  </div>
                )}

                {/* Botón etiquetas */}
                {labelsDone ? (
                  <p className="w-full py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
                    <CheckCircle2 size={14} />
                    {isStone ? 'Piezas declaradas y manifiesto solicitado' : 'Etiquetas solicitadas'}
                  </p>
                ) : (
                  <Button
                    type="button"
                    disabled={!canSolicitar || requestingLabelsId === instance.id}
                    onClick={async () => {
                      setRequestingLabelsId(instance.id);
                      try {
                        if (isStone) {
                          // Stone has no bundle labels: its pieces go on the manifest (never touch MDF bundles).
                          await handleDeclareStonePieces(instance.id);
                          return;
                        }
                        await productionService.requestLabels(instance.id, mdf, herrajes);
                        setLabelsRequestedInstanceIds(prev => ({
                          ...prev, [labelsKey(instance.id, false)]: true,
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
                        toast.error(typeof detail === 'string' ? detail : msg || 'Error al solicitar etiquetas.');
                      } finally {
                        setRequestingLabelsId(null);
                      }
                    }}
                    size="sm"
                    className="w-full text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    {requestingLabelsId === instance.id
                      ? 'Procesando...'
                      : isStone
                        ? <><Gem size={14} /> Declarar y solicitar manifiesto</>
                        : <><Tag size={14} /> Solicitar etiquetas</>}
                  </Button>
                )}

                {/* Herrajes: also dispatchable while packing (the batch detail is not reachable from this column) */}
                {!isStone && (instance.hardware_dispatched ? (
                  <p className="w-full mt-2 py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
                    <CheckCircle2 size={14} /> Herrajes surtidos
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDispatchHardware(instance)}
                    disabled={dispatchingHardware === instance.id}
                    className="w-full mt-2 text-xs"
                  >
                    <PackageCheck size={14} />
                    {dispatchingHardware === instance.id ? 'Procesando...' : 'Marcar herrajes surtidos'}
                  </Button>
                ))}
              </div>
            );
                  })}
                </div>
              </details>
            ));
          })()}
        </div>
      </div>
    );
  };

  const renderColumn4 = () => {
    const allReady = readyInstances.filter(instanceMatches);

    return (
      <div
        className="bg-emerald-50 p-4 rounded-xl w-80 flex-shrink-0 flex flex-col h-full min-h-0 border border-emerald-200"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const instanceIdStr = e.dataTransfer.getData('packingInstanceId');
          if (instanceIdStr && instanceIdStr !== '') {
            void handleMoveToReady([Number(instanceIdStr)]);
            return;
          }
          const batchIdStr = e.dataTransfer.getData('batchId');
          if (batchIdStr && batchIdStr !== '') {
            handleDrop(e, STATUS_READY_TO_INSTALL);
          }
        }}
      >
        {/* Gabriel 20/10: this column keeps exactly its green of before */}
        <div className="flex shrink-0 justify-between items-center mb-4">
          <h2 className="font-bold text-emerald-800 text-sm flex items-center gap-2">
            <CheckCircle2 size={16} /> Listo para instalarse
          </h2>
          <span className="bg-emerald-200 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full tabular-nums">
            {allReady.length}
          </span>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={columnScrollStyle}>
          {allReady.length === 0 && (
            <div className="border-2 border-dashed border-emerald-200 rounded-lg p-6 text-center text-emerald-500 text-sm">
              Andén vacío
            </div>
          )}
          {(() => {
            const ovMap = new Map<string, { folio: string; client: string; project: string; instances: any[] }>();
            for (const inst of allReady) {
              const key = inst.order_folio || 'Sin OV';
              if (!ovMap.has(key)) ovMap.set(key, { folio: key, client: inst.client_name || '—', project: inst.project_name || '—', instances: [] });
              ovMap.get(key)!.instances.push(inst);
            }
            const groups = Array.from(ovMap.values()).sort((a, b) => a.folio.localeCompare(b.folio));
            return groups.map(group => (
              <details key={group.folio} className="rounded-lg border border-emerald-200 overflow-hidden" open={groups.length === 1}>
                <summary className="flex items-center gap-2 px-3 py-2 bg-emerald-100 cursor-pointer list-none hover:bg-emerald-200 transition-colors">
                  <span className="text-xs font-black text-emerald-800">{group.folio}</span>
                  <span className="text-[10px] text-emerald-600 flex-1 truncate">{group.project} — {group.client}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 shrink-0 tabular-nums">{group.instances.length}</span>
                </summary>
                <div className="flex flex-col gap-3 p-2 bg-white">
                  {group.instances.map((instance: any, idx: number) => {
            const isStoneTrack = instance.track === 'PIEDRA';
            const otherLabel = (() => {
              const ots = instance.other_track_status;
              const otherName = isStoneTrack ? 'MDF' : 'Piedra';
              if (!ots) return null;
              // H54: DEAD / FINISHED = every house of that batch already left packing
              if (ots === 'DEAD' || ots === 'FINISHED') {
                return `${otherName}: lista`;
              }
              if (ots === 'READY_TO_INSTALL' || ots === 'PACKING') {
                return `${otherName}: listo / empacando`;
              }
              if (ots === 'IN_PRODUCTION') {
                return `${otherName}: en producción`;
              }
              if (ots === 'DRAFT' || ots === 'ON_HOLD' || ots === 'PLANNED') {
                return `${otherName}: pendiente`;
              }
              if (ots === 'CANCELLED') {
                return `${otherName}: lote cancelado`;
              }
              return `${otherName}: ${ots}`;
            })();
            return (
              <div
                key={`${instance.id}-${instance.track}-${idx}`}
                className={`p-3 rounded-lg shadow-sm border border-l-4 ${materialCardColor(instance.batch_type)}`}
              >
                {/* Badge de track */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={typeLabelClass(isStoneTrack ? 'PIEDRA' : 'MDF')}>
                    {isStoneTrack ? 'Track piedra' : 'Track MDF'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mb-1">
                  {instance.order_folio && <span className={ovLabelClass}>{instance.order_folio}</span>}
                  {instance.client_name && (
                    <span className="text-[10px] text-slate-500 truncate">{instance.client_name}</span>
                  )}
                </div>
                <p className="font-bold text-slate-800 text-sm">{instance.custom_name}</p>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">{instance.batch_folio}</p>

                {otherLabel && (
                  <p className="text-[10px] text-slate-500 mt-1">{otherLabel}</p>
                )}

                {instance.qr_code && (
                  <span className="text-xs font-mono font-semibold bg-slate-50 border border-slate-200 text-slate-600 px-2 py-1 rounded mt-2 w-fit block">
                    QR: {instance.qr_code}
                  </span>
                )}
              </div>
            );
                  })}
                </div>
              </details>
            ));
          })()}
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
    const houses = [...new Set(instances.map((i: any) => houseLabel(i)).filter(Boolean))] as string[];
    return { ovs, clients, projects, houses };
  };

  // Guide v2: full-width board; MainLayout fixes the height for this route, so the page scrolls inside itself.
  return (
    <div className="h-full overflow-y-auto">
    <div className="p-8 w-full pb-24 space-y-6 animate-fadeIn">
      <VPageHeader
        icon={Factory}
        title="Piso de producción"
        subtitle="Control de lotes y despacho a campo."
        loading={loading}
        actions={isReadOnly ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
            <Eye size={12} /> Solo lectura
          </span>
        ) : undefined}
        onBack={() => navigate('/production')}
        backLabel="Regresar a Producción"
      />

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Material</label>
            <div className="flex flex-wrap gap-2">
              {(['ALL', 'MDF', 'PIEDRA'] as const).map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  onClick={() => setMaterialFilter(key)}
                  className={materialFilter === key ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800' : undefined}
                >
                  {key === 'ALL' ? 'Todos' : key === 'PIEDRA' ? 'Piedra' : 'MDF'}
                </Button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-500 mb-1">Buscar</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-slate-400" />
              </div>
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar OV, cliente o casa..."
                className="pl-10 text-sm font-medium"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <span className="text-sm text-slate-400 font-bold animate-pulse">Cargando...</span>
        </div>
      ) : (
        <div
          className="flex gap-6 pb-4 overflow-x-auto"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollSnapType: 'x mandatory'
          }}
        >
          {renderColumn1()}
          {renderColumn2()}
          {renderColumnEmpaque()}
          {renderColumn4()}
        </div>
      )}

      {selectedBatch && (
        <Modal
          isOpen
          size="lg"
          overlayZIndex={50}
          onClose={() => setSelectedBatch(null)}
          title={selectedBatch.folio}
          subtitle={`${selectedBatch.batch_type} · ${batchStatusLabel(selectedBatch.status)}`}
          headerActions={
            <RecordHistoryButton tableName="production_batches" recordId={selectedBatch.id} label={selectedBatch.folio} />
          }
          footer={<ModalFooter onCancel={() => setSelectedBatch(null)} cancelLabel="Cerrar" />}
        >
              {(selectedBatch.instances || []).length === 0 ? (
                <VEmptyState icon={<Package />} title="Sin instancias asignadas." />
              ) : (
                <div className="flex flex-col gap-3">
                  {(selectedBatch.instances || []).map((inst: any) => (
                    <div key={inst.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      {/* Cabecera instancia */}
                      <div className="px-4 py-3">
                        {/* OV + Cliente */}
                        <div className="flex items-center gap-2 mb-1">
                          {inst.order_folio && <span className={ovLabelClass}>{inst.order_folio}</span>}
                          {inst.client_name && (
                            <span className="text-xs text-slate-500 truncate">{inst.client_name}</span>
                          )}
                        </div>
                        {/* Nombre instancia */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-800 text-sm">{inst.custom_name || '—'}</p>
                          {!isReadOnly && !LOADED_INSTANCE_STATUSES.includes(inst.production_status) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title="Sacar del lote"
                              onClick={() => setReversalState({
                                kind: 'instance',
                                batchId: selectedBatch.id,
                                batchFolio: selectedBatch.folio,
                                instanceId: inst.id,
                                instanceName: inst.custom_name || `Instancia ${inst.id}`,
                                discharged: POST_PRODUCTION_STATUSES.includes(selectedBatch.status),
                              })}
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <LogOut size={16} />
                            </Button>
                          )}
                        </div>
                        {/* Material(es) clave — puede haber más de uno */}
                        {inst.key_materials && inst.key_materials.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-1">
                            {inst.key_materials.map((km: any, idx: number) => (
                              <div key={`${km.sku}-${idx}`} className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold text-slate-500">
                                  {selectedBatch.batch_type === 'PIEDRA' ? 'Piedra' : 'Tablero'}
                                </span>
                                <span className="text-xs font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                                  {km.sku}
                                </span>
                                <span className="text-xs text-slate-600 truncate flex-1">{km.name}</span>
                                <span className="text-xs font-bold text-slate-800 tabular-nums whitespace-nowrap">
                                  {formatQty(km.quantity)} {km.usage_unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Acciones: Herrajes y Planos */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => loadHerrajesPreview(inst)}
                            disabled={loadingHerrajesPreview}
                            className="text-xs"
                          >
                            <ClipboardList size={14} /> {loadingHerrajesPreview ? 'Procesando...' : 'Herrajes'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Ver planos"
                            onClick={async () => {
                              try {
                                const { data } = await axiosClient.get(`/production/instances/${inst.id}/blueprint`);
                                if (data.blueprint_path) {
                                  window.open(data.blueprint_path, '_blank');
                                } else {
                                  toast.warning('Esta instancia no tiene plano disponible.');
                                }
                              } catch {
                                toast.error('Error al obtener el plano.');
                              }
                            }}
                            className="text-xs"
                          >
                            <Ruler size={14} /> Planos
                          </Button>
                          {inst.hardware_dispatched ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle2 size={14} /> Herrajes surtidos
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleDispatchHardware(inst)}
                              disabled={dispatchingHardware === inst.id}
                              className="text-xs"
                            >
                              <PackageCheck size={14} /> {dispatchingHardware === inst.id ? 'Procesando...' : 'Marcar surtido'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </Modal>
      )}

      {/* Modal de vista previa de herrajes */}
      {herrajesPreview && (
        <Modal
          isOpen
          size="lg"
          overlayZIndex={60}
          onClose={() => setHerrajesPreview(null)}
          title="Lista de herrajes para instalación"
          subtitle={`${herrajesPreview.instName}${herrajesPreview.orderFolio ? ` · ${herrajesPreview.orderFolio}` : ''}`}
          footer={
            <ModalFooter
              onCancel={() => setHerrajesPreview(null)}
              cancelLabel="Cerrar"
              confirmLabel="Imprimir PDF"
              disabled={herrajesPreview.herrajes.length === 0}
              onConfirm={() => {
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
            >
              {herrajesPreview.blueprintPath ? (
                <a
                  href={herrajesPreview.blueprintPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <Ruler size={14} /> Ver plano
                </a>
              ) : (
                <span className="text-xs text-slate-400">Sin plano disponible</span>
              )}
            </ModalFooter>
          }
        >
                <VTable
                  columns={[
                    {
                      key: 'sku',
                      label: 'SKU',
                      sortable: true,
                      render: (row) => (
                        <span className="font-mono text-xs text-slate-500">{String(row.sku ?? '')}</span>
                      ),
                    },
                    {
                      key: 'name',
                      label: 'Material',
                      sortable: true,
                      render: (row) => (
                        <span className="font-medium text-slate-800">{String(row.name ?? '')}</span>
                      ),
                    },
                    {
                      key: 'quantity',
                      label: 'Cantidad',
                      sortable: true,
                      align: 'right',
                      sortValue: (row) => Number(row.quantity ?? 0),
                      render: (row) => (
                        <span className="block text-right font-bold text-slate-800 tabular-nums">{row.quantity == null ? '' : formatQty(Number(row.quantity))}</span>
                      ),
                    },
                    {
                      key: 'usage_unit',
                      label: 'Unidad',
                      render: (row) => <span className="text-slate-500">{String(row.usage_unit ?? '')}</span>,
                    },
                  ] satisfies VTableColumn<Record<string, unknown>>[]}
                  data={herrajesPreview.herrajes.map((h: Record<string, unknown>, i: number) => ({
                    ...h,
                    id: i,
                  }))}
                  headerStyle="report"
                  stickyHeader={false}
                  className="shadow-sm"
                  emptyState={{ icon: <ClipboardList />, title: 'Sin herrajes en la receta de esta instancia.' }}
                />
        </Modal>
      )}

      {pendingDispatchInst && (
        <VConfirmDialog
          isOpen={pendingDispatchInst !== null}
          title="Marcar herrajes surtidos"
          message={`¿Confirmas que los herrajes de "${pendingDispatchInst.custom_name}" ya fueron surtidos a producción?`}
          consequence="Los herrajes, accesorios, electro y vidrio de la receta se descargarán del almacén (pueden quedar en negativo si falta existencia). La instancia quedará marcada como surtida y no podrás revertirlo desde el Kanban."
          variant="default"
          confirmLabel="Sí, marcar surtido"
          onConfirm={async () => {
            const inst = pendingDispatchInst;
            setPendingDispatchInst(null);
            await executeDispatchHardware(inst);
          }}
          onCancel={() => setPendingDispatchInst(null)}
        />
      )}

      <ShortageDialog
        isOpen={shortageState !== null}
        batchFolio={shortageState?.batchFolio ?? ''}
        shortages={shortageState?.shortages ?? []}
        canAuthorize={canAuthorizeInventory}
        onAuthorize={handleAuthorizeShortage}
        onClose={() => setShortageState(null)}
      />

      <ReversalDialog
        isOpen={reversalState !== null}
        title={
          reversalState?.kind === 'instance'
            ? `Sacar ${reversalState.instanceName} del lote`
            : `Regresar lote ${reversalState?.batchFolio ?? ''} a espera`
        }
        message={
          reversalState?.kind === 'instance'
            ? `La instancia saldrá del lote ${reversalState.batchFolio}.`
            : 'El lote ya descargó la receta del almacén al entrar a producción.'
        }
        requireDisposition={reversalState?.kind === 'batch' || (reversalState?.kind === 'instance' && reversalState.discharged)}
        confirmLabel={reversalState?.kind === 'instance' ? 'Sacar del lote' : 'Regresar a espera'}
        onConfirm={handleConfirmReversal}
        onClose={() => setReversalState(null)}
      />
    </div>
    </div>
  );
}
