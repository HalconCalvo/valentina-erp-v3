import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Play,
  Send,
  XCircle,
  CheckCircle2,
  Check,
  History,
  Loader2,
  Search,
  RefreshCw,
  Pencil,
  Printer,
} from 'lucide-react';
import axiosClient from '@/api/axios-client';
import {
  AuditItemRead,
  AuditSessionRead,
  AuditSessionSummary,
  inventoryService,
} from '@/api/inventory-service';
import { useCurrentUser } from '@/hooks/useSalesDashboard';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import Modal from '@/components/ui/Modal';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VTable, VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import { MaterialForm } from './MaterialForm';

interface MaterialMeta {
  usage_unit: string;
  purchase_unit: string;
  category: string;
}

type MaterialMetaMap = Record<number, MaterialMeta>;

type CaptureSortField = 'material_sku' | 'material_name' | 'material_category';

type CaptureRow = AuditItemRead & { material_category: string };

const PRINT_SORT_OPTIONS: { value: CaptureSortField; label: string }[] = [
  { value: 'material_sku', label: 'SKU' },
  { value: 'material_name', label: 'Nombre' },
  { value: 'material_category', label: 'Categoría' },
];

const compareCaptureRows = (a: CaptureRow, b: CaptureRow, key: CaptureSortField): number => {
  const av = a[key] ?? '';
  const bv = b[key] ?? '';
  return String(av).localeCompare(String(bv), 'es-MX', { numeric: true, sensitivity: 'base' });
};

const sortCaptureRows = (
  items: CaptureRow[],
  key: CaptureSortField,
  direction: 'asc' | 'desc',
): CaptureRow[] => {
  const sorted = [...items].sort((a, b) => compareCaptureRows(a, b, key));
  return direction === 'asc' ? sorted : sorted.reverse();
};

const unitCellsForPrint = (meta: MaterialMeta | undefined): { usage: string; purchase: string } => {
  const usage = meta?.usage_unit?.trim() || '—';
  const purchase = meta?.purchase_unit?.trim() || '—';
  if (usage === purchase) {
    return { usage, purchase: '' };
  }
  return { usage, purchase };
};

const renderUnitsDisplay = (meta: MaterialMeta | undefined): React.ReactNode => {
  if (!meta) return '—';
  const usage = meta.usage_unit?.trim() || '—';
  const purchase = meta.purchase_unit?.trim() || '—';
  if (usage === purchase) {
    return <span className="text-slate-700">{usage}</span>;
  }
  return (
    <span className="text-slate-700">
      <span className="block text-xs">
        <span className="font-bold text-slate-500">Uso:</span> {usage}
      </span>
      <span className="block text-xs mt-0.5">
        <span className="font-bold text-slate-500">Compra:</span> {purchase}
      </span>
    </span>
  );
};

interface PhysicalInventoryModuleProps {
  activeSubSection?: string | null;
  onSubSectionChange?: (section: string | null) => void;
}

type ReasonModalKind = 'cancel' | 'reject';

const STATUS_LABELS: Record<string, string> = {
  EN_CAPTURA: 'En captura',
  ESPERANDO_AUTORIZACION: 'Esperando autorización',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const formatQty = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const variancePercent = (systemQty: number, variance: number): number => {
  if (Math.abs(systemQty) < 0.0001) {
    return Math.abs(variance) > 0.0001 ? 100 : 0;
  }
  return (variance / systemQty) * 100;
};

export const PhysicalInventoryModule: React.FC<PhysicalInventoryModuleProps> = () => {
  const { data: currentUser } = useCurrentUser();
  const userRole = String(currentUser?.role ?? '').toUpperCase().trim();
  const canApprove = userRole === 'DIRECTOR' || userRole === 'MANAGER';

  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState<AuditSessionRead | null>(null);
  const [history, setHistory] = useState<AuditSessionSummary[]>([]);
  const [viewingClosedId, setViewingClosedId] = useState<number | null>(null);
  const [closedAudit, setClosedAudit] = useState<AuditSessionRead | null>(null);

  const [search, setSearch] = useState('');
  const [draftQty, setDraftQty] = useState<Record<number, string>>({});
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [materialMetaMap, setMaterialMetaMap] = useState<MaterialMetaMap>({});
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printSortField, setPrintSortField] = useState<CaptureSortField>('material_sku');
  const [printSortDirection, setPrintSortDirection] = useState<'asc' | 'desc'>('asc');

  const [reasonModal, setReasonModal] = useState<{ open: boolean; kind: ReasonModalKind }>({
    open: false,
    kind: 'cancel',
  });
  const [reasonText, setReasonText] = useState('');
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [approveAllConfirm, setApproveAllConfirm] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);

  const loadMaterialMeta = useCallback(async () => {
    try {
      const response = await axiosClient.get('/foundations/materials');
      const materials = Array.isArray(response.data) ? response.data : [];
      const map: MaterialMetaMap = {};
      materials.forEach(
        (m: {
          id: number;
          usage_unit?: string;
          purchase_unit?: string;
          category?: string;
        }) => {
          map[m.id] = {
            usage_unit: m.usage_unit?.trim() || '—',
            purchase_unit: m.purchase_unit?.trim() || '—',
            category: m.category?.trim() || '—',
          };
        },
      );
      setMaterialMetaMap(map);
    } catch {
      setMaterialMetaMap({});
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const sessions = await inventoryService.listAuditSessions();
      setHistory(
        sessions.filter((s) => s.status === 'CERRADA' || s.status === 'CANCELADA'),
      );
    } catch {
      setHistory([]);
    }
  }, []);

  const refreshActive = useCallback(async () => {
    setLoading(true);
    try {
      const active = await inventoryService.getActiveAudit();
      setAudit(active);
      if (active) {
        const drafts: Record<number, string> = {};
        active.items.forEach((item) => {
          if (item.counted_quantity !== null && item.counted_quantity !== undefined) {
            drafts[item.id] = String(item.counted_quantity);
          }
        });
        setDraftQty(drafts);
        setViewingClosedId(null);
        setClosedAudit(null);
      }
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al cargar sesión activa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaterialMeta();
    void refreshActive();
    void loadHistory();
  }, [loadMaterialMeta, refreshActive, loadHistory]);

  const handleStartSession = async () => {
    setProcessing(true);
    try {
      const session = await inventoryService.createAuditSession();
      setAudit(session);
      setDraftQty({});
      toast.success('Sesión de conteo iniciada.');
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo iniciar la sesión.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveItem = async (item: AuditItemRead, quantityStr?: string) => {
    if (!audit) return;
    const raw = quantityStr ?? draftQty[item.id] ?? '';
    const qty = parseFloat(raw);
    if (Number.isNaN(qty) || qty < 0) {
      toast.warning('Captura una cantidad válida.');
      return;
    }
    setSavingItemId(item.id);
    try {
      await inventoryService.captureCount(audit.id, item.id, qty);
      const updated = await inventoryService.getAuditDetail(audit.id);
      setAudit(updated);
      toast.success(`${item.material_sku || item.material_name} guardado.`);
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al guardar captura.');
    } finally {
      setSavingItemId(null);
    }
  };

  const handleSubmit = async () => {
    if (!audit) return;
    setProcessing(true);
    try {
      const result = await inventoryService.submitAudit(audit.id);
      setAudit(result.status === 'CERRADA' ? null : result);
      if (result.status === 'CERRADA') {
        setClosedAudit(result);
        setViewingClosedId(result.id);
        await loadHistory();
        toast.success('Conteo enviado. Todos los ajustes se aplicaron automáticamente.');
      } else {
        toast.success('Conteo enviado. Hay materiales pendientes de aprobación.');
      }
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al enviar conteo.');
    } finally {
      setProcessing(false);
      setSubmitConfirm(false);
    }
  };

  const handleApproveItem = async (item: AuditItemRead) => {
    if (!audit) return;
    setSavingItemId(item.id);
    try {
      await inventoryService.approveAuditItem(audit.id, item.id);
      const updated = await inventoryService.getAuditDetail(audit.id);
      if (updated.status === 'CERRADA') {
        setAudit(null);
        setClosedAudit(updated);
        setViewingClosedId(updated.id);
        await loadHistory();
        toast.success('Material aprobado. Sesión cerrada.');
      } else {
        setAudit(updated);
        toast.success('Material aprobado.');
      }
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al aprobar material.');
    } finally {
      setSavingItemId(null);
    }
  };

  const handleApproveAll = async () => {
    if (!audit) return;
    setProcessing(true);
    try {
      const updated = await inventoryService.approveAllAudit(audit.id);
      setAudit(null);
      setClosedAudit(updated);
      setViewingClosedId(updated.id);
      await loadHistory();
      toast.success('Todos los materiales aprobados. Sesión cerrada.');
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al aprobar sesión.');
    } finally {
      setProcessing(false);
      setApproveAllConfirm(false);
    }
  };

  const handleReasonConfirm = async () => {
    if (!audit || !reasonText.trim()) {
      toast.warning('El motivo es obligatorio.');
      return;
    }
    setProcessing(true);
    try {
      if (reasonModal.kind === 'cancel') {
        await inventoryService.cancelAudit(audit.id, reasonText.trim());
        setAudit(null);
        await loadHistory();
        toast.success('Sesión cancelada.');
      } else {
        const updated = await inventoryService.rejectAudit(audit.id, reasonText.trim());
        setAudit(updated);
        toast.success('Sesión rechazada. Regresó a captura.');
      }
      setReasonModal({ open: false, kind: 'cancel' });
      setReasonText('');
    } catch (e: unknown) {
      const detail =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Error al procesar la acción.');
    } finally {
      setProcessing(false);
    }
  };

  const openHistorySession = async (entry: AuditSessionSummary) => {
    setProcessing(true);
    try {
      const detail = await inventoryService.getAuditDetail(entry.id);
      setClosedAudit(detail);
      setViewingClosedId(entry.id);
    } catch {
      toast.error('No se pudo cargar el detalle de la sesión.');
    } finally {
      setProcessing(false);
    }
  };

  const filteredCaptureItems = useMemo((): CaptureRow[] => {
    if (!audit) return [];
    const term = search.trim().toLowerCase();
    return audit.items
      .filter((item) => {
        if (!term) return true;
        const name = (item.material_name || '').toLowerCase();
        const sku = (item.material_sku || '').toLowerCase();
        const category = (materialMetaMap[item.material_id]?.category || '').toLowerCase();
        return name.includes(term) || sku.includes(term) || category.includes(term);
      })
      .map((item) => ({
        ...item,
        material_category: materialMetaMap[item.material_id]?.category ?? '—',
      }));
  }, [audit, search, materialMetaMap]);

  const printCaptureRows = useMemo((): CaptureRow[] => {
    if (!audit) return [];
    const rows: CaptureRow[] = audit.items.map((item) => ({
      ...item,
      material_category: materialMetaMap[item.material_id]?.category ?? '—',
    }));
    return sortCaptureRows(rows, printSortField, printSortDirection);
  }, [audit, materialMetaMap, printSortField, printSortDirection]);

  const pendingApprovalItems = useMemo(() => {
    if (!audit) return [];
    return audit.items.filter(
      (item) =>
        item.requires_approval &&
        !item.approved_at &&
        Math.abs(item.variance ?? 0) > 0.0001,
    );
  }, [audit]);

  const allCaptured =
    audit != null &&
    audit.items.length > 0 &&
    audit.items.every((item) => item.captured || item.counted_quantity !== null);

  const openPrintPreview = () => {
    setPrintSortField('material_sku');
    setPrintSortDirection('asc');
    setPrintPreviewOpen(true);
  };

  const captureColumns: VTableColumn<CaptureRow>[] = [
    {
      key: 'material_sku',
      label: 'SKU',
      sortable: true,
      width: '120px',
      render: (row) => <span className="font-mono text-xs">{row.material_sku || '—'}</span>,
    },
    {
      key: 'material_name',
      label: 'Material',
      sortable: true,
      render: (row) => <span className="font-medium">{row.material_name || '—'}</span>,
    },
    {
      key: 'material_category',
      label: 'Categoría',
      sortable: true,
      width: '120px',
      render: (row) => (
        <span className="text-xs font-bold uppercase text-slate-600">{row.material_category}</span>
      ),
    },
    {
      key: 'units',
      label: 'Unidades',
      width: '120px',
      render: (row) => renderUnitsDisplay(materialMetaMap[row.material_id]),
    },
    {
      key: 'counted_quantity',
      label: 'Cantidad contada',
      width: '220px',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step="any"
            value={draftQty[row.id] ?? ''}
            onChange={(e) => setDraftQty((prev) => ({ ...prev, [row.id]: e.target.value }))}
            onBlur={() => {
              const val = draftQty[row.id];
              if (val !== undefined && val !== '') {
                void handleSaveItem(row, val);
              }
            }}
            placeholder="0.00"
            className="max-w-[120px]"
            disabled={savingItemId === row.id || processing}
          />
          <button
            type="button"
            title="Guardar captura"
            disabled={savingItemId === row.id || processing}
            onClick={() => void handleSaveItem(row)}
            className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
          >
            {savingItemId === row.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          </button>
        </div>
      ),
    },
    {
      key: 'edit_material',
      label: '',
      width: '48px',
      render: (row) => (
        <button
          type="button"
          title="Editar material"
          disabled={processing}
          onClick={() => setEditingMaterialId(row.material_id)}
          className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
        >
          <Pencil size={16} />
        </button>
      ),
    },
  ];

  const approvalColumns: VTableColumn<AuditItemRead>[] = [
    {
      key: 'material_name',
      label: 'Material',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.material_name}</div>
          <div className="font-mono text-xs text-slate-400">{row.material_sku}</div>
        </div>
      ),
    },
    {
      key: 'counted_quantity',
      label: 'Contado',
      render: (row) => formatQty(row.counted_quantity),
    },
    {
      key: 'system_quantity',
      label: 'Sistema',
      render: (row) => formatQty(row.system_quantity),
    },
    {
      key: 'variance',
      label: 'Diferencia',
      render: (row) => {
        const v = row.variance ?? 0;
        const color = v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-slate-500';
        return <span className={`font-bold ${color}`}>{formatQty(v)}</span>;
      },
    },
    {
      key: 'variance_pct',
      label: '% Dif.',
      render: (row) => {
        const pct = variancePercent(row.system_quantity ?? 0, row.variance ?? 0);
        return <span className="font-bold text-amber-700">{formatQty(pct)}%</span>;
      },
    },
  ];

  const closedColumns: VTableColumn<AuditItemRead>[] = [
    {
      key: 'material_sku',
      label: 'SKU',
      render: (row) => <span className="font-mono text-xs">{row.material_sku}</span>,
    },
    {
      key: 'material_name',
      label: 'Material',
      render: (row) => row.material_name,
    },
    {
      key: 'system_quantity',
      label: 'Sistema',
      render: (row) => formatQty(row.system_quantity),
    },
    {
      key: 'counted_quantity',
      label: 'Contado',
      render: (row) => formatQty(row.counted_quantity),
    },
    {
      key: 'variance',
      label: 'Ajuste',
      render: (row) => {
        const v = row.variance ?? 0;
        if (Math.abs(v) <= 0.0001) return '—';
        const color = v > 0 ? 'text-emerald-600' : 'text-red-600';
        return <span className={`font-bold ${color}`}>{formatQty(v)}</span>;
      },
    },
    {
      key: 'resolved',
      label: 'Estado',
      render: (row) =>
        row.resolved ? (
          <span className="text-emerald-600 font-bold text-xs uppercase">Aplicado</span>
        ) : (
          <span className="text-slate-400 text-xs uppercase">Sin ajuste</span>
        ),
    },
  ];

  if (loading) {
    return (
      <VEmptyState
        icon={<Loader2 className="animate-spin text-slate-300" size={48} />}
        title="Cargando inventario físico..."
      />
    );
  }

  if (viewingClosedId && closedAudit) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-800">
              Sesión #{closedAudit.id} — {STATUS_LABELS[closedAudit.status] || closedAudit.status}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {closedAudit.items_captured} de {closedAudit.items_total} materiales capturados
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setViewingClosedId(null);
              setClosedAudit(null);
              void refreshActive();
            }}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            <Play size={16} /> Nueva sesión
          </button>
        </div>

        {closedAudit.status === 'CERRADA' ? (
          <VTable columns={closedColumns} data={closedAudit.items as AuditItemRead[]} />
        ) : (
          <VEmptyState
            icon={<XCircle className="text-red-300" size={48} />}
            title="Sesión cancelada"
            description={closedAudit.notes || 'Esta sesión fue cancelada y no generó ajustes.'}
          />
        )}
      </div>
    );
  }

  if (audit?.status === 'EN_CAPTURA') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-orange-700">Sesión #{audit.id}</p>
            <p className="text-sm text-orange-800 font-medium mt-1">
              Conteo ciego — {audit.items_captured} / {audit.items_total} capturados
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={processing}
              onClick={openPrintPreview}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Printer size={16} /> Imprimir lista
            </button>
            <button
              type="button"
              disabled={!allCaptured || processing}
              onClick={() => setSubmitConfirm(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send size={16} /> Enviar para aprobación
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={() => setReasonModal({ open: true, kind: 'cancel' })}
              className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle size={16} /> Cancelar sesión
            </button>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="pl-9"
          />
        </div>

        <VTable
          columns={captureColumns}
          data={filteredCaptureItems}
          defaultSortKey="material_sku"
          defaultSortDirection="asc"
          emptyState={{
            title: 'Sin materiales',
            description: 'No hay materiales activos para contar.',
          }}
        />

        <VConfirmDialog
          isOpen={submitConfirm}
          title="Enviar conteo"
          message="¿Enviar el conteo para procesamiento?"
          consequence="Diferencias ≤5% se ajustarán automáticamente. Diferencias mayores requerirán aprobación de Dirección o Gerencia."
          confirmLabel="Enviar"
          onConfirm={() => void handleSubmit()}
          onCancel={() => setSubmitConfirm(false)}
        />

        {reasonModal.open && (
          <Modal
            isOpen
            onClose={() => {
              if (processing) return;
              setReasonModal({ open: false, kind: 'cancel' });
              setReasonText('');
            }}
            title="Cancelar sesión de conteo"
            size="sm"
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Indica el motivo de la cancelación.</p>
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                La sesión quedará cancelada con trazabilidad. No se aplicarán ajustes.
              </div>
              <Input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Motivo obligatorio..."
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => {
                    setReasonModal({ open: false, kind: 'cancel' });
                    setReasonText('');
                  }}
                  className="rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-300 disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={processing || !reasonText.trim()}
                  onClick={() => void handleReasonConfirm()}
                  className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {processing ? 'Procesando...' : 'Confirmar cancelación'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {printPreviewOpen && (
          <Modal
            isOpen
            onClose={() => setPrintPreviewOpen(false)}
            title="Vista previa — lista de conteo"
            size="xl"
          >
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #physical-inventory-print-preview,
                #physical-inventory-print-preview * { visibility: visible; }
                #physical-inventory-print-preview {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                }
              }
            `}</style>

            <div className="space-y-4 print:hidden">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[220px] flex-1">
                  <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">
                    Ordenar por
                  </label>
                  <SearchableSelect
                    items={PRINT_SORT_OPTIONS}
                    value={printSortField}
                    onChange={(v) => setPrintSortField(v as CaptureSortField)}
                    getLabel={(o) => o.label}
                    getValue={(o) => o.value}
                    placeholder="Campo de orden..."
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500 mb-1 block">
                    Dirección
                  </label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPrintSortDirection('asc')}
                      className={`px-4 py-2.5 text-sm font-bold ${
                        printSortDirection === 'asc'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Ascendente
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintSortDirection('desc')}
                      className={`px-4 py-2.5 text-sm font-bold border-l border-slate-200 ${
                        printSortDirection === 'desc'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Descendente
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
                {/* Excepción: tabla nativa para vista previa e impresión (@media print). */}
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-500">
                        SKU
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-500">
                        Material
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-500">
                        Categoría
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-500">
                        Unidad uso
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-500">
                        Unidad compra
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase text-slate-500 w-28">
                        Cantidad
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {printCaptureRows.map((item) => {
                      const units = unitCellsForPrint(materialMetaMap[item.material_id]);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs">
                            {item.material_sku || '—'}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">{item.material_name || '—'}</td>
                          <td className="border-b border-slate-100 px-3 py-2 text-xs uppercase text-slate-600">
                            {item.material_category}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">{units.usage}</td>
                          <td className="border-b border-slate-100 px-3 py-2">{units.purchase || '—'}</td>
                          <td className="border-b border-slate-100 px-3 py-2 h-8" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPrintPreviewOpen(false)}
                  className="rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  <Printer size={16} /> Imprimir
                </button>
              </div>
            </div>

            <div id="physical-inventory-print-preview" className="hidden print:block">
              <div className="p-8">
                <h1 className="text-xl font-black text-slate-900 mb-1">
                  Inventario Físico — Sesión #{audit.id} —{' '}
                  {new Date().toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h1>
                <p className="text-sm text-slate-600 mb-2">Conteo ciego — anotar cantidades físicas</p>
                <p className="text-xs text-slate-500 mb-6">
                  Orden: {PRINT_SORT_OPTIONS.find((o) => o.value === printSortField)?.label}{' '}
                  ({printSortDirection === 'asc' ? 'ascendente' : 'descendente'})
                </p>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border border-slate-400 px-3 py-2 text-left font-bold">SKU</th>
                      <th className="border border-slate-400 px-3 py-2 text-left font-bold">Material</th>
                      <th className="border border-slate-400 px-3 py-2 text-left font-bold">Categoría</th>
                      <th className="border border-slate-400 px-3 py-2 text-left font-bold">Unidad uso</th>
                      <th className="border border-slate-400 px-3 py-2 text-left font-bold">Unidad compra</th>
                      <th className="border border-slate-400 px-3 py-2 text-left font-bold w-32">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printCaptureRows.map((item) => {
                      const units = unitCellsForPrint(materialMetaMap[item.material_id]);
                      return (
                        <tr key={item.id}>
                          <td className="border border-slate-300 px-3 py-2 font-mono text-xs">
                            {item.material_sku || '—'}
                          </td>
                          <td className="border border-slate-300 px-3 py-2">{item.material_name || '—'}</td>
                          <td className="border border-slate-300 px-3 py-2 text-xs uppercase">
                            {item.material_category}
                          </td>
                          <td className="border border-slate-300 px-3 py-2">{units.usage}</td>
                          <td className="border border-slate-300 px-3 py-2">{units.purchase}</td>
                          <td className="border border-slate-300 px-3 py-2 h-8" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-12 pt-4 border-t border-slate-400">
                  <p className="text-sm font-bold text-slate-800">Firma del contador:</p>
                  <div className="mt-8 border-b border-slate-800 w-64" />
                </div>
              </div>
            </div>
          </Modal>
        )}

        {editingMaterialId != null && (
          <MaterialForm
            materialId={editingMaterialId}
            onCancel={() => setEditingMaterialId(null)}
            onCreated={() => {
              setEditingMaterialId(null);
              void loadMaterialMeta();
              toast.success('Material actualizado.');
            }}
          />
        )}
      </div>
    );
  }

  if (audit?.status === 'ESPERANDO_AUTORIZACION') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">Sesión #{audit.id}</p>
            <p className="text-sm text-amber-900 font-medium mt-1">
              {audit.items_pending_approval} material(es) con diferencia &gt;5% pendientes de aprobación
            </p>
          </div>
          {canApprove && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={processing || pendingApprovalItems.length === 0}
                onClick={() => setApproveAllConfirm(true)}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 size={16} /> Aprobar todos
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => setReasonModal({ open: true, kind: 'reject' })}
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle size={16} /> Rechazar
              </button>
            </div>
          )}
        </div>

        {!canApprove && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Esperando aprobación de Dirección o Gerencia.
          </div>
        )}

        <VTable
          columns={approvalColumns}
          data={pendingApprovalItems as AuditItemRead[]}
          actions={
            canApprove
              ? (row) => [
                  {
                    label: 'Aprobar material',
                    icon: <Check size={16} />,
                    onClick: () => void handleApproveItem(row),
                    hidden: savingItemId === row.id,
                  },
                ]
              : undefined
          }
          emptyState={{
            icon: <CheckCircle2 className="text-emerald-300" size={48} />,
            title: 'Sin excepciones pendientes',
            description: 'Todos los materiales fueron procesados.',
          }}
        />

        <VConfirmDialog
          isOpen={approveAllConfirm}
          title="Aprobar todos los materiales"
          message="¿Aprobar todos los ajustes pendientes?"
          consequence="Se aplicarán los ajustes de inventario y la sesión se cerrará."
          confirmLabel="Aprobar todos"
          onConfirm={() => void handleApproveAll()}
          onCancel={() => setApproveAllConfirm(false)}
        />

        {reasonModal.open && reasonModal.kind === 'reject' && (
          <Modal
            isOpen
            onClose={() => {
              if (processing) return;
              setReasonModal({ open: false, kind: 'cancel' });
              setReasonText('');
            }}
            title="Rechazar conteo"
            size="sm"
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Indica el motivo del rechazo.</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                La sesión regresará a captura para corrección.
              </div>
              <Input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Motivo obligatorio..."
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => {
                    setReasonModal({ open: false, kind: 'cancel' });
                    setReasonText('');
                  }}
                  className="rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-300 disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={processing || !reasonText.trim()}
                  onClick={() => void handleReasonConfirm()}
                  className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {processing ? 'Procesando...' : 'Confirmar rechazo'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <ClipboardCheck size={48} className="mx-auto text-orange-400 mb-4" />
        <h3 className="text-xl font-black text-slate-800">Inventario Físico por Sesiones</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto">
          Inicia una sesión de conteo ciego. Captura las cantidades físicas de todos los materiales
          y envía para procesamiento automático o aprobación.
        </p>
        <button
          type="button"
          disabled={processing}
          onClick={() => void handleStartSession()}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {processing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          Iniciar conteo físico
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-slate-500" />
          <h4 className="text-sm font-black uppercase tracking-widest text-slate-600">
            Historial de sesiones
          </h4>
          <button
            type="button"
            title="Actualizar"
            onClick={() => void loadHistory()}
            className="ml-auto rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {history.length === 0 ? (
          <VEmptyState
            title="Sin historial"
            description="Las sesiones cerradas o canceladas aparecerán aquí."
          />
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => void openHistorySession(entry)}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
              >
                <div>
                  <span className="font-bold text-slate-800">Sesión #{entry.id}</span>
                  <span
                    className={`ml-3 text-xs font-bold uppercase ${
                      entry.status === 'CERRADA' ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {STATUS_LABELS[entry.status] || entry.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  {entry.items_captured}/{entry.items_total} capturados
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhysicalInventoryModule;
