import { useState, useEffect, useRef, useMemo } from 'react';
import { pettyCashService } from '../../../api/petty-cash-service';
import { VReasonDialog } from '@/components/ui/VReasonDialog';
import { TableActionEditIcon } from '@/lib/tableActionIcons';
import { toast } from '@/components/ui/VToast';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import {
  PettyCashFund,
  PettyCashMovement,
  PettyCashMovementCreate,
  PettyCashMovementUpdate,
  PettyCashCategory,
} from '../../../types/petty_cash';
import { formatDateTime, formatMoney } from '@/utils/format';
import UiModal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Wallet } from 'lucide-react';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES: PettyCashCategory[] = [
  'PLANTA', 'COMUNICACIONES', 'COMBUSTIBLES', 'TRANSPORTE',
  'INSUMOS', 'MAQUINARIA', 'EXTERNOS', 'MAQUILA', 'OTRO',
];

// D41 (17:04): Administración registers and sets the fund, Dirección also cancels; Gerencia only sees
const OPERATE_ROLES = ['DIRECTOR', 'ADMIN'];

function fmt(n: number) {
  return formatMoney(n);
}


function todayIso() {
  return new Date().toISOString().substring(0, 16);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return <UiModal isOpen size="md" overlayZIndex={50} onClose={onClose} title={title}>{children}</UiModal>;
}

/** Modal footer (guide v2): secondary on the left, primary on the right. */
function ModalFooter({ onCancel, onConfirm, confirmLabel, disabled, busy }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean; busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
      <Button type="button" onClick={onConfirm} disabled={disabled || busy}>{busy ? 'Procesando...' : confirmLabel}</Button>
    </div>
  );
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface PettyCashPanelProps {
  onBack: () => void;
  onRefresh: () => void;
  userRole: string;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function PettyCashPanel({ onBack, onRefresh, userRole }: PettyCashPanelProps) {
  const role = userRole.toUpperCase().trim();
  const canOperate = OPERATE_ROLES.includes(role);
  const canCancel = role === 'DIRECTOR';

  const [fund, setFund] = useState<PettyCashFund | null>(null);
  const [movements, setMovements] = useState<PettyCashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [showReposModal, setShowReposModal] = useState(false);

  const [configForm, setConfigForm] = useState({ fund_amount: 0, minimum_balance: 0 });

  const emptyEgreso = (): PettyCashMovementCreate => ({
    movement_type: 'EGRESO', amount: 0, concept: '', category: 'OTRO', notes: '', movement_date: todayIso(),
  });
  const emptyRepos = (): PettyCashMovementCreate => ({
    movement_type: 'REPOSICION', amount: 0, concept: 'Reposición de fondo', notes: '', movement_date: todayIso(),
  });

  const [egresoForm, setEgresoForm] = useState<PettyCashMovementCreate>(emptyEgreso());
  const [reposForm, setReposForm] = useState<PettyCashMovementCreate>(emptyRepos());
  const [egresoFile, setEgresoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingMovement, setEditingMovement] = useState<PettyCashMovement | null>(null);
  const [editForm, setEditForm] = useState<PettyCashMovementUpdate>({});

  const receiptRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // ── DATA LOAD ──────────────────────────────────────────────────────────────

  const load = async () => {
    try {
      setLoading(true);
      const [f, m] = await Promise.all([
        pettyCashService.getFund(),
        pettyCashService.getMovements({ limit: 100 }),
      ]);
      setFund(f);
      setMovements(m);
      setError(null);
    } catch {
      setError('Error al cargar los datos de caja chica.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── HANDLERS ──────────────────────────────────────────────────────────────

  const handleUpdateFund = async () => {
    try {
      setSubmitting(true);
      setFormError(null);
      const updated = await pettyCashService.updateFund(configForm);
      setFund(updated);
      setShowConfigModal(false);
      onRefresh();
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Error al actualizar el fondo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMovement = async (isEgreso: boolean) => {
    const form = isEgreso ? egresoForm : reposForm;
    try {
      setSubmitting(true);
      setFormError(null);
      const created = await pettyCashService.createMovement(form);
      if (isEgreso && egresoFile) {
        try { await pettyCashService.uploadReceipt(created.id, egresoFile); } catch { /* no-op */ }
      }
      setShowEgresoModal(false);
      setShowReposModal(false);
      setEgresoFile(null);
      await load();
      onRefresh();
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Error al registrar el movimiento.');
    } finally {
      setSubmitting(false);
    }
  };

  const executeCancel = async (id: number, reason: string): Promise<boolean> => {
    try {
      await pettyCashService.cancelMovement(id, reason);
      toast.success('Movimiento cancelado; el saldo del fondo se revirtió.');
      await load();
      onRefresh();
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al cancelar el movimiento.');
      return false;
    }
  };

  const handleDelete = (id: number) => {
    setPendingDeleteId(id);
  };

  const handleEdit = async () => {
    if (!editingMovement) return;
    try {
      await pettyCashService.updateMovement(editingMovement.id, editForm);
      setEditingMovement(null);
      setEditForm({});
      await load();
      onRefresh();
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Error al actualizar movimiento.');
    }
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    try {
      await pettyCashService.uploadReceipt(uploadTarget, file);
      await load();
    } catch {
      toast.error('Error al subir el comprobante.');
    } finally {
      setUploadTarget(null);
      if (receiptRef.current) receiptRef.current.value = '';
    }
  };

  const openConfig = () => {
    if (fund) setConfigForm({ fund_amount: fund.fund_amount, minimum_balance: fund.minimum_balance });
    setFormError(null);
    setShowConfigModal(true);
  };

  const movementColumns = useMemo((): VTableColumn<PettyCashMovement>[] => [
    {
      key: 'movement_date',
      label: 'Fecha',
      render: (m) => <span className="text-slate-600 whitespace-nowrap">{formatDateTime(m.movement_date)}</span>,
    },
    {
      key: 'movement_type',
      label: 'Tipo',
      render: (m) => (
        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${
          m.movement_type === 'EGRESO' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {m.movement_type === 'EGRESO' ? 'Egreso' : 'Reposición'}
        </span>
      ),
    },
    {
      key: 'category',
      label: 'Categoría',
      render: (m) => <span className="text-slate-600">{m.category || '—'}</span>,
    },
    {
      key: 'concept',
      label: 'Concepto',
      render: (m) => (
        <span className={`font-medium max-w-xs truncate block ${m.is_cancelled ? 'text-slate-400 line-through' : 'text-slate-800'}`}
          title={m.is_cancelled ? `Cancelado: ${m.cancel_reason ?? ''}` : undefined}>
          {m.is_cancelled && <span className="mr-2 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 no-underline">Cancelado</span>}
          {m.concept}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Monto',
      render: (m) => (
        <span className={`block text-right tabular-nums font-bold ${m.movement_type === 'EGRESO' ? 'text-red-600' : 'text-emerald-700'}`}>
          {m.movement_type === 'EGRESO' ? fmt(-m.amount) : fmt(m.amount)}
        </span>
      ),
    },
    {
      key: 'created_by_name',
      label: 'Registrado por',
      render: (m) => <span className="text-slate-500">{m.created_by_name || '—'}</span>,
    },
    {
      key: 'receipt_url',
      label: 'Comprobante',
      render: (m) => (
        m.receipt_url ? (
          <a href={m.receipt_url} target="_blank" rel="noopener noreferrer"
            className="font-semibold text-indigo-600 hover:text-indigo-800">
            Ver
          </a>
        ) : canOperate ? (
          <Button type="button" variant="outline" size="sm" onClick={() => { setUploadTarget(m.id); receiptRef.current?.click(); }}>
            Subir
          </Button>
        ) : <span className="text-xs text-slate-400">—</span>
      ),
    },
  ], [canOperate]);

  // ── RENDER ─────────────────────────────────────────────────────────────────
  // Third-wave pilot (guide v2): own standard header (Treasury hides its own for this section), white KPI cards,
  // the table with its loading and empty states, standard Modal and Button.

  const isLow = fund && fund.current_balance <= fund.minimum_balance;
  const kpi = (label: string, value: string, tone: string) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-black tabular-nums mt-1 ${tone}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Input type="file" ref={receiptRef} className="hidden" accept="image/*,.pdf" onChange={handleUploadReceipt} />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 text-slate-800">
            <Wallet className="text-indigo-600" size={32} /> Caja Chica
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Saldo del fondo y sus egresos y reposiciones.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {loading && <span className="text-xs text-slate-400 font-bold animate-pulse">Cargando...</span>}
          {canOperate && (<>
            <Button type="button" variant="outline" onClick={openConfig}>Configurar Fondo</Button>
            <Button type="button" variant="outline"
              onClick={() => { setFormError(null); setReposForm(emptyRepos()); setShowReposModal(true); }}>
              Registrar Reposición
            </Button>
            <Button type="button"
              onClick={() => { setFormError(null); setEgresoForm(emptyEgreso()); setEgresoFile(null); setShowEgresoModal(true); }}>
              Registrar Egreso
            </Button>
          </>)}
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft size={16} /> Regresar a Tesorería
          </Button>
        </div>
      </div>

      {error && <p className="text-sm font-bold text-red-600">{error}</p>}

      {fund && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {kpi('Saldo actual', fmt(fund.current_balance), isLow ? 'text-red-600' : 'text-emerald-700')}
            {kpi('Fondo configurado', fmt(fund.fund_amount), 'text-slate-800')}
            {kpi('Mínimo para reponer', fmt(fund.minimum_balance), 'text-slate-800')}
          </div>
          {isLow && <p className="text-sm font-bold text-amber-700">Saldo bajo: conviene reponer el fondo pronto.</p>}
        </div>
      )}

      <VTable
        columns={movementColumns as unknown as VTableColumn<Record<string, unknown>>[]}
        data={movements as unknown as Record<string, unknown>[]}
        isLoading={loading && movements.length === 0}
        emptyState={{ title: 'No hay movimientos registrados.' }}
        className="shadow-sm [&_th]:text-sm [&_th]:normal-case [&_th]:tracking-normal [&_th]:text-slate-600"
        actions={canOperate ? (row) => {
          const m = row as unknown as PettyCashMovement;
          if (m.is_cancelled) return [];
          return [
            {
              label: '',
              title: 'Editar movimiento',
              icon: <TableActionEditIcon />,
              onClick: () => {
                setEditingMovement(m);
                setEditForm({
                  amount: m.amount,
                  concept: m.concept,
                  category: m.category ?? undefined,
                  notes: m.notes ?? undefined,
                  movement_date: m.movement_date?.slice(0, 10),
                });
              },
            },
            ...(canCancel ? [{
              label: 'Cancelar',
              title: 'Cancelar movimiento',
              variant: 'danger' as const,
              onClick: () => handleDelete(m.id),
            }] : []),
          ];
        } : undefined}
      />

      {/* ── MODAL CONFIGURAR FONDO ────────────────────────────────────────── */}
      {showConfigModal && (
        <Modal title="Configurar Fondo" onClose={() => setShowConfigModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto del Fondo ($)</label>
              <Input type="number" min={0} step={100} value={configForm.fund_amount}
                onChange={e => setConfigForm(f => ({ ...f, fund_amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mínimo para Reponer ($)</label>
              <Input type="number" min={0} step={100} value={configForm.minimum_balance}
                onChange={e => setConfigForm(f => ({ ...f, minimum_balance: parseFloat(e.target.value) || 0 }))} />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <ModalFooter onCancel={() => setShowConfigModal(false)} onConfirm={handleUpdateFund}
              confirmLabel="Guardar" busy={submitting} />
          </div>
        </Modal>
      )}

      {/* ── MODAL EGRESO ─────────────────────────────────────────────────── */}
      {showEgresoModal && (
        <Modal title="Registrar Egreso" onClose={() => setShowEgresoModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Concepto *</label>
              <Input type="text" value={egresoForm.concept}
                onChange={e => setEgresoForm(f => ({ ...f, concept: e.target.value }))}
                placeholder="Ej. Gasolina para entrega" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto ($) *</label>
                <Input type="number" min={0.01} step={0.01} value={egresoForm.amount || ''}
                  onChange={e => setEgresoForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label>
                <SearchableSelect
                  items={CATEGORIES}
                  value={egresoForm.category || 'OTRO'}
                  onChange={(value) => setEgresoForm(f => ({ ...f, category: value as PettyCashCategory }))}
                  getLabel={(c) => c}
                  getValue={(c) => c}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
              <Input type="datetime-local" value={egresoForm.movement_date || todayIso()}
                onChange={e => setEgresoForm(f => ({ ...f, movement_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
              <textarea rows={2} value={egresoForm.notes || ''}
                onChange={e => setEgresoForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Comprobante (opcional)</label>
              <Input type="file" accept="image/*,.pdf" onChange={e => setEgresoFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-1 file:px-3 file:border-0 file:rounded file:bg-slate-100 file:text-slate-700 file:font-semibold" />
              {egresoFile && <p className="text-xs text-slate-400 mt-1">{egresoFile.name}</p>}
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <ModalFooter onCancel={() => setShowEgresoModal(false)} onConfirm={() => handleCreateMovement(true)}
              confirmLabel="Registrar Egreso" busy={submitting} disabled={!egresoForm.concept || !egresoForm.amount} />
          </div>
        </Modal>
      )}

      {/* ── MODAL REPOSICIÓN ─────────────────────────────────────────────── */}
      {showReposModal && (
        <Modal title="Registrar Reposición" onClose={() => setShowReposModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Concepto *</label>
              <Input type="text" value={reposForm.concept}
                onChange={e => setReposForm(f => ({ ...f, concept: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto ($) *</label>
              <Input type="number" min={0.01} step={0.01} value={reposForm.amount || ''}
                onChange={e => setReposForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
              <Input type="datetime-local" value={reposForm.movement_date || todayIso()}
                onChange={e => setReposForm(f => ({ ...f, movement_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
              <textarea rows={2} value={reposForm.notes || ''}
                onChange={e => setReposForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <ModalFooter onCancel={() => setShowReposModal(false)} onConfirm={() => handleCreateMovement(false)}
              confirmLabel="Registrar Reposición" busy={submitting} disabled={!reposForm.concept || !reposForm.amount} />
          </div>
        </Modal>
      )}

      {/* ── MODAL EDITAR MOVIMIENTO ───────────────────────────────────────── */}
      {editingMovement && (
        <Modal
          title={`Editar ${editingMovement.movement_type === 'EGRESO' ? 'Egreso' : 'Reposición'}`}
          onClose={() => { setEditingMovement(null); setEditForm({}); setFormError(null); }}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Concepto</label>
              <Input
                type="text"
                value={editForm.concept ?? ''}
                onChange={e => setEditForm(f => ({ ...f, concept: e.target.value }))}
                className="font-bold text-slate-700 focus-visible:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount ?? ''}
                onChange={e => setEditForm(f => ({ ...f, amount: parseFloat(e.target.value) }))}
                className="font-bold text-slate-700 focus-visible:border-amber-400"
              />
            </div>
            {editingMovement.movement_type === 'EGRESO' && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label>
                <SearchableSelect
                  items={CATEGORIES}
                  value={editForm.category ?? 'OTRO'}
                  onChange={(value) => setEditForm(f => ({ ...f, category: value as PettyCashCategory }))}
                  getLabel={(c) => c}
                  getValue={(c) => c}
                  className="font-bold text-slate-700 focus:ring-amber-400 focus:border-amber-400"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
              <Input
                type="date"
                value={editForm.movement_date ?? ''}
                onChange={e => setEditForm(f => ({ ...f, movement_date: e.target.value }))}
                className="font-bold text-slate-700 focus-visible:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
              <textarea
                rows={2}
                value={editForm.notes ?? ''}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>
            {formError && <p className="text-xs text-red-600 font-bold">{formError}</p>}
            <ModalFooter onCancel={() => { setEditingMovement(null); setEditForm({}); setFormError(null); }}
              onConfirm={handleEdit} confirmLabel="Guardar Cambios" />
          </div>
        </Modal>
      )}
      {pendingDeleteId !== null && (
        <VReasonDialog
          title="Cancelar movimiento"
          description="El movimiento no se elimina: queda cancelado con su motivo, fecha y usuario, y el saldo del fondo se revierte."
          label="Motivo de la cancelación *"
          requiredMessage="El motivo de la cancelación es obligatorio."
          confirmLabel="Cancelar movimiento"
          danger
          onConfirm={(reason) => executeCancel(pendingDeleteId, reason)}
          onClose={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
