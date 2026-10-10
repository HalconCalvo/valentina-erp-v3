import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Play,
  Send,
  XCircle,
  CheckCircle2,
  Check,
  History,
  Search,
  RefreshCw,
  Pencil,
  Printer,
  RotateCcw,
  Lock,
} from 'lucide-react';
import axiosClient from '@/api/axios-client';
import {
  AuditItemRead,
  AuditSessionRead,
  AuditSessionSummary,
  inventoryService,
  type PeriodLockRead,
  type UncapturedWithStockDetail,
} from '@/api/inventory-service';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useCurrentUser } from '@/hooks/useSalesDashboard';
import { Input } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VTable, VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import { MaterialForm } from './MaterialForm';
import { formatMoney } from '@/utils/format';

interface MaterialMeta {
  usage_unit: string;
  purchase_unit: string;
  category: string;
  provider: string;
}

type MaterialMetaMap = Record<number, MaterialMeta>;

type CaptureRow = AuditItemRead & { material_category: string; material_provider: string | null };

type PrintSortKey = 'category' | 'sku' | 'name' | 'provider';

const PRINT_SORT_OPTIONS: { value: PrintSortKey; label: string }[] = [
  { value: 'category', label: 'Categoría' },
  { value: 'sku', label: 'SKU' },
  { value: 'name', label: 'Descripción' },
  { value: 'provider', label: 'Proveedor' },
];

const NO_PROVIDER = 'Sin proveedor';

const compareText = (a: string, b: string): number => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });

/** Empty values (e.g. materials without supplier) always go last. */
const compareWithBlanksLast = (a: string, b: string): number => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compareText(a, b);
};

/** Blind count list order for printing: chosen field first, then SKU. */
const sortForPrint = (rows: CaptureRow[], key: PrintSortKey): CaptureRow[] => {
  const field = (row: CaptureRow): string => {
    if (key === 'category') return row.material_category;
    if (key === 'provider') return row.material_provider ?? '';
    if (key === 'name') return row.material_name || '';
    return row.material_sku || '';
  };
  return [...rows].sort(
    (a, b) => compareWithBlanksLast(field(a), field(b)) || compareText(a.material_sku || '', b.material_sku || ''),
  );
};

// Printed list always shows both units (even when they are the same); "—" only when not captured.
const unitCellsForPrint = (meta: MaterialMeta | undefined): { usage: string; purchase: string } => ({
  usage: meta?.usage_unit?.trim() || '—',
  purchase: meta?.purchase_unit?.trim() || '—',
});

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
  REABIERTA: 'Reabierta',
  CANCELADA: 'Cancelada',
};

const APPROVAL_REASON_LABELS: Record<string, string> = {
  PERCENT: 'Diferencia > 5%',
  ZERO_THEORETICAL: 'Existencia teórica 0',
  NEGATIVE_THEORETICAL: 'Existencia teórica negativa',
  VALUE: 'Valor > umbral',
};

const formatReasons = (reasons?: string | null): string =>
  (reasons || '')
    .split(',')
    .filter(Boolean)
    .map((r) => APPROVAL_REASON_LABELS[r] || r)
    .join(' · ') || '—';



const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Default cut: last day of the previous month (business dates are entered in local time). */
const defaultCutDate = (): string => {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
};

const formatCutDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

type UncapturedRow = { sku: string; name: string };

const uncapturedColumns: VTableColumn<UncapturedRow>[] = [
  { key: 'sku', label: 'SKU', render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
  { key: 'name', label: 'Material', render: (r) => r.name },
];

const errorDetail = (e: unknown, fallback: string): string => {
  const response = (e as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  if (!response) return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  const detail = response.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: string }).msg) : '')).filter(Boolean);
    return messages.length ? `Datos inválidos: ${messages.join('; ')}` : fallback;
  }
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: string }).message);
  return `${fallback} (código ${response.status ?? '—'})`;
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
  const isDirector = userRole === 'DIRECTOR';

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
  const [printSort, setPrintSort] = useState<PrintSortKey>('category');

  const [reasonModal, setReasonModal] = useState<{ open: boolean; kind: ReasonModalKind }>({
    open: false,
    kind: 'cancel',
  });
  const [reasonText, setReasonText] = useState('');
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [approveAllConfirm, setApproveAllConfirm] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);
  const [cutDate, setCutDate] = useState<string>(defaultCutDate());
  const [periodLock, setPeriodLock] = useState<PeriodLockRead | null>(null);
  const [uncapturedWithStock, setUncapturedWithStock] = useState<UncapturedWithStockDetail | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [closeAgainConfirm, setCloseAgainConfirm] = useState(false);
  const [recountItem, setRecountItem] = useState<AuditItemRead | null>(null);
  const [recountQty, setRecountQty] = useState('');

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
          provider_name?: string | null;
        }) => {
          map[m.id] = {
            usage_unit: m.usage_unit?.trim() || '—',
            purchase_unit: m.purchase_unit?.trim() || '—',
            category: m.category?.trim() || '—',
            provider: m.provider_name?.trim() || '',
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
        sessions.filter((s) => s.status === 'CERRADA' || s.status === 'CANCELADA' || s.status === 'REABIERTA'),
      );
    } catch {
      setHistory([]);
    }
  }, []);

  const loadLockAndSettings = useCallback(async () => {
    try {
      const [lock, settings] = await Promise.all([
        inventoryService.getPeriodLock(),
        inventoryService.getAuditSettings(),
      ]);
      setPeriodLock(lock);
      setThreshold(settings.inventory_audit_value_threshold);
      setThresholdDraft(String(settings.inventory_audit_value_threshold));
    } catch {
      setPeriodLock(null);
    }
  }, []);

  const refreshActive = useCallback(async () => {
    setLoading(true);
    try {
      const active = await inventoryService.getActiveAudit();
      if (active?.status === 'REABIERTA') {
        setAudit(null);
        setClosedAudit(active);
        setViewingClosedId(active.id);
        return;
      }
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
      toast.error(errorDetail(e, 'Error al cargar sesión activa.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaterialMeta();
    void refreshActive();
    void loadHistory();
    void loadLockAndSettings();
  }, [loadMaterialMeta, refreshActive, loadHistory, loadLockAndSettings]);

  // A session started by another user appears when this tab becomes visible again (only on the start
  // screen, so nothing being captured is reloaded).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !audit && !viewingClosedId && !processing) {
        void refreshActive();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [audit, viewingClosedId, processing, refreshActive]);

  const handleStartSession = async () => {
    setProcessing(true);
    try {
      const session = await inventoryService.createAuditSession(cutDate);
      setAudit(session);
      setDraftQty({});
      toast.success(`Sesión de conteo iniciada con corte al ${formatCutDate(cutDate)}.`);
    } catch (e: unknown) {
      if ((e as { response?: { status?: number } })?.response?.status === 409) {
        // Another user already started (or reopened) a session: show it instead of the start screen.
        toast.warning(errorDetail(e, 'Ya existe una sesión activa.'));
        await refreshActive();
      } else {
        toast.error(errorDetail(e, 'No se pudo iniciar la sesión.'));
      }
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
      toast.error(errorDetail(e, 'Error al guardar captura.'));
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
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      if (detail && typeof detail === 'object' && (detail as { code?: string }).code === 'UNCAPTURED_WITH_STOCK') {
        setUncapturedWithStock(detail as UncapturedWithStockDetail);
      } else {
        toast.error(errorDetail(e, 'Error al enviar conteo.'));
      }
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
      toast.error(errorDetail(e, 'Error al aprobar material.'));
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
      toast.error(errorDetail(e, 'Error al aprobar sesión.'));
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
      toast.error(errorDetail(e, 'Error al procesar la acción.'));
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
    } catch (e: unknown) {
      toast.error(errorDetail(e, 'No se pudo cargar el detalle de la sesión.'));
    } finally {
      setProcessing(false);
    }
  };

  const reloadClosed = async (auditId: number) => {
    const detail = await inventoryService.getAuditDetail(auditId);
    setClosedAudit(detail);
    setViewingClosedId(detail.id);
    await Promise.all([loadHistory(), loadLockAndSettings()]);
  };

  const handleReopen = async () => {
    if (!closedAudit || !reasonText.trim()) return;
    setProcessing(true);
    try {
      await inventoryService.reopenAudit(closedAudit.id, reasonText.trim());
      await reloadClosed(closedAudit.id);
      setReopenOpen(false);
      setReasonText('');
      toast.success('Corte reabierto. Ya puedes recontar materiales.');
    } catch (e: unknown) {
      toast.error(errorDetail(e, 'No se pudo reabrir el corte.'));
    } finally {
      setProcessing(false);
    }
  };

  const handleCloseAgain = async () => {
    if (!closedAudit) return;
    setProcessing(true);
    try {
      await inventoryService.closeAuditAgain(closedAudit.id);
      await reloadClosed(closedAudit.id);
      toast.success('Corte cerrado de nuevo.');
    } catch (e: unknown) {
      toast.error(errorDetail(e, 'No se pudo cerrar el corte.'));
    } finally {
      setProcessing(false);
      setCloseAgainConfirm(false);
    }
  };

  const handleRecount = async () => {
    if (!closedAudit || !recountItem) return;
    const qty = parseFloat(recountQty);
    if (Number.isNaN(qty) || qty < 0 || !reasonText.trim()) {
      toast.warning('Captura una cantidad válida y el motivo.');
      return;
    }
    setProcessing(true);
    try {
      await inventoryService.recountAuditItem(closedAudit.id, recountItem.id, qty, reasonText.trim());
      await reloadClosed(closedAudit.id);
      setRecountItem(null);
      setRecountQty('');
      setReasonText('');
      toast.success('Reconteo aplicado con fecha del corte.');
    } catch (e: unknown) {
      toast.error(errorDetail(e, 'No se pudo aplicar el reconteo.'));
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveThreshold = async () => {
    const value = parseFloat(thresholdDraft);
    if (Number.isNaN(value) || value <= 0) {
      toast.warning('El umbral debe ser mayor a cero.');
      return;
    }
    setSavingThreshold(true);
    try {
      const saved = await inventoryService.updateAuditSettings(value);
      setThreshold(saved.inventory_audit_value_threshold);
      toast.success('Umbral por valor actualizado.');
    } catch (e: unknown) {
      toast.error(errorDetail(e, 'No se pudo guardar el umbral.'));
    } finally {
      setSavingThreshold(false);
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
        const provider = (materialMetaMap[item.material_id]?.provider || '').toLowerCase();
        return name.includes(term) || sku.includes(term) || category.includes(term) || provider.includes(term);
      })
      .map((item) => ({
        ...item,
        material_category: materialMetaMap[item.material_id]?.category ?? '—',
        material_provider: materialMetaMap[item.material_id]?.provider || null,
      }));
  }, [audit, search, materialMetaMap]);

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

  const handlePrintBlindList = () => {
    window.print();
  };

  const rowsForPrint = useMemo(() => sortForPrint(filteredCaptureItems, printSort), [filteredCaptureItems, printSort]);

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
      key: 'material_provider',
      label: 'Proveedor',
      sortable: true,
      width: '160px',
      render: (row) =>
        row.material_provider ? (
          <span className="text-xs text-slate-600">{row.material_provider}</span>
        ) : (
          <span className="text-xs italic text-slate-400">{NO_PROVIDER}</span>
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
            <Check size={16} />
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
        const theoretical = row.system_quantity ?? 0;
        if (theoretical <= 0.0001) return <span className="text-slate-400">—</span>;
        const pct = variancePercent(theoretical, row.variance ?? 0);
        return <span className="font-bold text-amber-700">{formatQty(pct)}%</span>;
      },
    },
    {
      key: 'valued_difference',
      label: 'Valor',
      render: (row) => <span className="font-bold">{formatMoney(row.valued_difference)}</span>,
    },
    {
      key: 'approval_reason',
      label: 'Motivo',
      render: (row) => <span className="text-xs font-bold text-amber-800">{formatReasons(row.approval_reason)}</span>,
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
      key: 'unit_cost_at_cut',
      label: 'Costo al corte',
      render: (row) => (row.unit_cost_at_cut != null ? formatMoney(row.unit_cost_at_cut) : '—'),
    },
    {
      key: 'valued_difference',
      label: 'Valor',
      render: (row) => (Math.abs(row.valued_difference ?? 0) > 0.004 ? formatMoney(row.valued_difference) : '—'),
    },
    {
      key: 'resolved',
      label: 'Estado',
      render: (row) =>
        row.auto_zero ? (
          <span className="text-slate-500 text-xs uppercase">Sin existencia (0)</span>
        ) : row.adjustment_movement_id ? (
          <span className="text-emerald-600 font-bold text-xs uppercase">Ajustado</span>
        ) : (
          <span className="text-slate-400 text-xs uppercase">Sin diferencia</span>
        ),
    },
  ];

  if (loading) {
    return (
      <VEmptyState
        icon={<ClipboardCheck className="text-slate-300" size={48} />}
        title="Cargando inventario físico..."
      />
    );
  }

  if (viewingClosedId && closedAudit) {
    const isReopened = closedAudit.status === 'REABIERTA';
    const hasAdjustments = closedAudit.status === 'CERRADA' || isReopened;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-800">
              Sesión #{closedAudit.id} — {STATUS_LABELS[closedAudit.status] || closedAudit.status}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Corte al {formatCutDate(closedAudit.cut_date)} (23:59:59 hora Mérida) · {closedAudit.items_captured} de{' '}
              {closedAudit.items_total} materiales capturados
              {closedAudit.total_valued_difference != null && (
                <> · Diferencia valuada total: <strong>{formatMoney(closedAudit.total_valued_difference)}</strong></>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDirector && closedAudit.status === 'CERRADA' && (
              <Button variant="outline" disabled={processing} onClick={() => setReopenOpen(true)}>
                <RotateCcw size={16} /> Reabrir corte
              </Button>
            )}
            {isDirector && isReopened && (
              <Button disabled={processing} onClick={() => setCloseAgainConfirm(true)}>
                <Lock size={16} /> Volver a cerrar
              </Button>
            )}
            {!isReopened && (
              <Button
                disabled={processing}
                onClick={() => {
                  setViewingClosedId(null);
                  setClosedAudit(null);
                  void refreshActive();
                }}
              >
                <Play size={16} /> Nueva sesión
              </Button>
            )}
          </div>
        </div>

        {isReopened && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            El periodo está abierto. Los reconteos generan un movimiento inverso del ajuste anterior y un ajuste nuevo,
            ambos con fecha del corte. Al terminar, vuelve a cerrar el corte.
          </div>
        )}

        {hasAdjustments ? (
          <VTable
            columns={closedColumns}
            data={closedAudit.items as AuditItemRead[]}
            actions={
              isReopened && canApprove
                ? (row) => [
                    {
                      label: 'Recontar',
                      title: 'Recontar material',
                      icon: <RotateCcw size={16} />,
                      onClick: () => {
                        const item = row as unknown as AuditItemRead;
                        setRecountItem(item);
                        setRecountQty(String(item.counted_quantity ?? ''));
                        setReasonText('');
                      },
                    },
                  ]
                : undefined
            }
          />
        ) : (
          <VEmptyState
            icon={<XCircle className="text-red-300" size={48} />}
            title="Sesión cancelada"
            description={closedAudit.notes || 'Esta sesión fue cancelada y no generó ajustes.'}
          />
        )}

        <Modal
          isOpen={reopenOpen}
          onClose={() => {
            if (processing) return;
            setReopenOpen(false);
            setReasonText('');
          }}
          title={`Reabrir corte al ${formatCutDate(closedAudit.cut_date)}`}
          size="sm"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Se desbloquean los movimientos con fecha igual o anterior al corte hasta que lo vuelvas a cerrar.
              Queda registrado quién reabrió y por qué.
            </div>
            <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Motivo obligatorio..." />
            <div className="flex justify-end gap-3">
              <Button variant="outline" disabled={processing} onClick={() => setReopenOpen(false)}>Volver</Button>
              <Button variant="destructive" disabled={processing || !reasonText.trim()} onClick={() => void handleReopen()}>
                {processing ? 'Procesando…' : 'Reabrir'}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={recountItem !== null}
          onClose={() => {
            if (processing) return;
            setRecountItem(null);
          }}
          title={`Recontar ${recountItem?.material_name ?? ''}`}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Conteo anterior: <strong>{formatQty(recountItem?.counted_quantity)}</strong>. El ajuste anterior se revierte y
              se calcula uno nuevo contra la existencia al corte.
            </p>
            <Input type="number" min={0} step="any" value={recountQty} onChange={(e) => setRecountQty(e.target.value)} placeholder="Nueva cantidad contada" />
            <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Motivo obligatorio..." />
            <div className="flex justify-end gap-3">
              <Button variant="outline" disabled={processing} onClick={() => setRecountItem(null)}>Volver</Button>
              <Button disabled={processing || !reasonText.trim() || recountQty === ''} onClick={() => void handleRecount()}>
                {processing ? 'Procesando…' : 'Aplicar reconteo'}
              </Button>
            </div>
          </div>
        </Modal>

        <VConfirmDialog
          isOpen={closeAgainConfirm}
          title="Volver a cerrar el corte"
          message={`¿Cerrar de nuevo el corte al ${formatCutDate(closedAudit.cut_date)}?`}
          consequence="Los movimientos con fecha igual o anterior al corte volverán a quedar bloqueados."
          confirmLabel="Cerrar corte"
          onConfirm={() => void handleCloseAgain()}
          onCancel={() => setCloseAgainConfirm(false)}
        />
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
              Conteo ciego al {formatCutDate(audit.cut_date)} — {audit.items_captured} / {audit.items_total} capturados
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48" title="Orden de la lista impresa">
              <SearchableSelect
                items={PRINT_SORT_OPTIONS}
                value={printSort}
                onChange={(value) => setPrintSort((value || 'category') as PrintSortKey)}
                getLabel={(option) => `Imprimir por: ${option.label}`}
                getValue={(option) => option.value}
                placeholder="Ordenar lista impresa por"
              />
            </div>
            <button
              type="button"
              disabled={processing}
              onClick={handlePrintBlindList}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Printer size={16} /> Imprimir lista
            </button>
            <button
              type="button"
              disabled={processing}
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
          consequence={
            `${allCaptured ? '' : 'Los materiales sin capturar que no tienen existencia al corte se toman como 0; si alguno tiene existencia, el envío se bloquea. '}` +
            `Diferencias de hasta 5% y de valor hasta ${formatMoney(audit.value_threshold)} se ajustan automáticamente con fecha del corte. ` +
            'Las demás requieren aprobación de Dirección o Gerencia.'
          }
          confirmLabel="Enviar"
          onConfirm={() => void handleSubmit()}
          onCancel={() => setSubmitConfirm(false)}
        />

        <Modal
          isOpen={uncapturedWithStock !== null}
          onClose={() => setUncapturedWithStock(null)}
          title="Faltan materiales por contar"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {uncapturedWithStock?.message} Cuéntalos (si no hay, captura 0) y vuelve a enviar.
            </p>
            <VTable
              columns={uncapturedColumns}
              data={uncapturedWithStock?.materials ?? []}
            />
            <div className="flex justify-end">
              <Button onClick={() => setUncapturedWithStock(null)}>Entendido</Button>
            </div>
          </div>
        </Modal>

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

        <style>{`
          @media print {
            body * { visibility: hidden; }
            #physical-inventory-print, #physical-inventory-print * { visibility: visible; }
            #physical-inventory-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              display: block !important;
            }
          }
        `}</style>

        <div id="physical-inventory-print" className="hidden print:block">
          <div className="p-8">
            <h1 className="text-xl font-black text-slate-900 mb-1">
              Inventario Físico — Sesión #{audit.id} — Corte al {formatCutDate(audit.cut_date)}
            </h1>
            <p className="text-sm text-slate-600 mb-6">
              Conteo ciego — anotar cantidades físicas · Ordenada por{' '}
              {PRINT_SORT_OPTIONS.find((o) => o.value === printSort)?.label.toLowerCase()}
            </p>
            {/* Excepción: tabla nativa para impresión (@media print). */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold">SKU</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold">Material</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold">Categoría</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold">Proveedor</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold">Unidad uso</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold">Unidad compra</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold w-32">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {rowsForPrint.map((item) => {
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
                      <td className="border border-slate-300 px-3 py-2 text-xs">{item.material_provider || NO_PROVIDER}</td>
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
              Corte al {formatCutDate(audit.cut_date)} — {audit.items_pending_approval} material(es) pendientes de
              aprobación (diferencia &gt; 5%, existencia 0 o negativa, o valor &gt; {formatMoney(audit.value_threshold)})
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
        <h3 className="text-xl font-black text-slate-800">Inventario Físico con Fecha de Corte</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto">
          El conteo se compara contra la existencia teórica al corte (23:59:59 hora Mérida). Los movimientos posteriores
          al corte se respetan y el ajuste queda con la fecha del corte.
        </p>
        {periodLock?.locked && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
            <Lock size={14} /> Periodo cerrado al {periodLock.locked_until_local}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-end justify-center gap-3">
          <div className="text-left">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Fecha de corte</label>
            <Input type="date" value={cutDate} max={toIsoDate(new Date())} onChange={(e) => setCutDate(e.target.value)} />
          </div>
          <Button disabled={processing || !cutDate} onClick={() => void handleStartSession()}>
            <Play size={18} /> {processing ? 'Iniciando…' : 'Iniciar conteo físico'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[16rem]">
          <p className="text-sm font-black text-slate-700">Umbral por valor para aprobación</p>
          <p className="text-xs text-slate-500 mt-1">
            Una diferencia cuyo valor supere este monto requiere aprobación de Dirección o Gerencia, aunque sea de 5% o menos.
            {threshold != null && <> Actual: <strong>{formatMoney(threshold)}</strong>.</>}
          </p>
        </div>
        {isDirector && (
          <div className="flex items-end gap-2">
            <Input type="number" min={0} step="0.01" value={thresholdDraft} onChange={(e) => setThresholdDraft(e.target.value)} className="max-w-[10rem]" />
            <Button variant="outline" disabled={savingThreshold} onClick={() => void handleSaveThreshold()}>
              {savingThreshold ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        )}
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
                  <span className="ml-2 text-xs text-slate-500">Corte {formatCutDate(entry.cut_date)}</span>
                  <span
                    className={`ml-3 text-xs font-bold uppercase ${
                      entry.status === 'CERRADA' ? 'text-emerald-600' : entry.status === 'REABIERTA' ? 'text-amber-600' : 'text-red-600'
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
