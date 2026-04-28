import { useState, useEffect, useRef } from 'react';
import { pettyCashService } from '../../../api/petty-cash-service';
import {
  PettyCashFund,
  PettyCashMovement,
  PettyCashMovementCreate,
  PettyCashMovementUpdate,
  PettyCashCategory,
} from '../../../types/petty_cash';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES: PettyCashCategory[] = [
  'GASOLINA', 'PAPELERÍA', 'LIMPIEZA', 'COMIDA', 'TRANSPORTE',
  'MENSAJERÍA', 'INSUMOS', 'M.O. EXTERNA', 'REFACC Y ACCESORIOS', 'OTRO',
];

const MANAGER_ROLES = ['DIRECTOR', 'GERENCIA'];

function fmt(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
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
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
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

export default function PettyCashPanel({ onRefresh, userRole }: PettyCashPanelProps) {
  const isManager = MANAGER_ROLES.includes(userRole.toUpperCase().trim());

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

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar este movimiento? El saldo será revertido.')) return;
    try {
      await pettyCashService.deleteMovement(id);
      await load();
      onRefresh();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Error al eliminar el movimiento.');
    }
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
      alert('Error al subir el comprobante.');
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

  // ── RENDER ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-slate-400">Cargando caja chica…</div>;
  }
  if (error) {
    return <div className="flex items-center justify-center h-48 text-red-500">{error}</div>;
  }

  const isLow = fund && fund.current_balance <= fund.minimum_balance;

  return (
    <div className="space-y-6">
      {/* Hidden receipt input */}
      <input type="file" ref={receiptRef} className="hidden" accept="image/*,.pdf" onChange={handleUploadReceipt} />

      {/* ── ACTION BAR ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 justify-end">
        {isManager && (
          <button onClick={openConfig}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-bold shadow-sm transition-all transform hover:-translate-y-0.5">
            ⚙️ Configurar Fondo
          </button>
        )}
        <button
          onClick={() => { setFormError(null); setEgresoForm(emptyEgreso()); setEgresoFile(null); setShowEgresoModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all transform hover:-translate-y-0.5">
          ➕ Registrar Egreso
        </button>
        <button
          onClick={() => { setFormError(null); setReposForm(emptyRepos()); setShowReposModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all transform hover:-translate-y-0.5">
          🔄 Registrar Reposición
        </button>
      </div>

      {/* ── FUND CARD ────────────────────────────────────────────────────── */}
      {fund && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {isLow && (
            <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-amber-800 text-sm font-semibold">
              ⚠️ Saldo bajo — Se recomienda reponer el fondo pronto.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo Actual</p>
              <p className={`text-4xl font-black ${isLow ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(fund.current_balance)}</p>
            </div>
            <div className="border-x border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Fondo Configurado</p>
              <p className="text-2xl font-bold text-slate-700">{fmt(fund.fund_amount)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Mínimo Configurado</p>
              <p className="text-2xl font-bold text-slate-700">{fmt(fund.minimum_balance)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── MOVEMENTS TABLE ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-700">Historial de Movimientos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-left">Concepto</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-left">Registrado por</th>
                <th className="px-4 py-3 text-center">Comprobante</th>
                {isManager && <th className="px-4 py-3 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 8 : 7} className="px-4 py-8 text-center text-slate-400">
                    No hay movimientos registrados.
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(m.movement_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      m.movement_type === 'EGRESO' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {m.movement_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{m.category || '—'}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium max-w-xs truncate">{m.concept}</td>
                  <td className={`px-4 py-3 text-right font-bold ${m.movement_type === 'EGRESO' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {m.movement_type === 'EGRESO' ? '−' : '+'}{fmt(m.amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{m.created_by_name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {m.receipt_url ? (
                      <a href={m.receipt_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-semibold transition-colors">
                        📎 Ver
                      </a>
                    ) : (
                      <button
                        onClick={() => { setUploadTarget(m.id); receiptRef.current?.click(); }}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded text-xs font-semibold transition-colors">
                        📤 Subir
                      </button>
                    )}
                  </td>
                  {isManager && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setEditingMovement(m);
                            setEditForm({
                              amount: m.amount,
                              concept: m.concept,
                              category: m.category ?? undefined,
                              notes: m.notes ?? undefined,
                              movement_date: m.movement_date?.slice(0, 10),
                            });
                          }}
                          className="p-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100 hover:bg-amber-100 transition-colors"
                          title="Editar movimiento"
                        >
                          ✏️
                        </button>
                        <button onClick={() => handleDelete(m.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Eliminar">
                          🗑️
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL CONFIGURAR FONDO ────────────────────────────────────────── */}
      {showConfigModal && (
        <Modal title="⚙️ Configurar Fondo" onClose={() => setShowConfigModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto del Fondo ($)</label>
              <input type="number" min={0} step={100} value={configForm.fund_amount}
                onChange={e => setConfigForm(f => ({ ...f, fund_amount: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mínimo para Reponer ($)</label>
              <input type="number" min={0} step={100} value={configForm.minimum_balance}
                onChange={e => setConfigForm(f => ({ ...f, minimum_balance: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={handleUpdateFund} disabled={submitting}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                {submitting ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={() => setShowConfigModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL EGRESO ─────────────────────────────────────────────────── */}
      {showEgresoModal && (
        <Modal title="➕ Registrar Egreso" onClose={() => setShowEgresoModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Concepto *</label>
              <input type="text" value={egresoForm.concept}
                onChange={e => setEgresoForm(f => ({ ...f, concept: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="Ej. Gasolina para entrega" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto ($) *</label>
                <input type="number" min={0.01} step={0.01} value={egresoForm.amount || ''}
                  onChange={e => setEgresoForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label>
                <select value={egresoForm.category || 'OTRO'}
                  onChange={e => setEgresoForm(f => ({ ...f, category: e.target.value as PettyCashCategory }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
              <input type="datetime-local" value={egresoForm.movement_date || todayIso()}
                onChange={e => setEgresoForm(f => ({ ...f, movement_date: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
              <textarea rows={2} value={egresoForm.notes || ''}
                onChange={e => setEgresoForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Comprobante (opcional)</label>
              <input type="file" accept="image/*,.pdf" onChange={e => setEgresoFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-1 file:px-3 file:border-0 file:rounded file:bg-slate-100 file:text-slate-700 file:font-semibold" />
              {egresoFile && <p className="text-xs text-slate-400 mt-1">📎 {egresoFile.name}</p>}
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => handleCreateMovement(true)}
                disabled={submitting || !egresoForm.concept || !egresoForm.amount}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                {submitting ? 'Registrando…' : 'Registrar Egreso'}
              </button>
              <button onClick={() => setShowEgresoModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL REPOSICIÓN ─────────────────────────────────────────────── */}
      {showReposModal && (
        <Modal title="🔄 Registrar Reposición" onClose={() => setShowReposModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Concepto *</label>
              <input type="text" value={reposForm.concept}
                onChange={e => setReposForm(f => ({ ...f, concept: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto ($) *</label>
              <input type="number" min={0.01} step={0.01} value={reposForm.amount || ''}
                onChange={e => setReposForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
              <input type="datetime-local" value={reposForm.movement_date || todayIso()}
                onChange={e => setReposForm(f => ({ ...f, movement_date: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
              <textarea rows={2} value={reposForm.notes || ''}
                onChange={e => setReposForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => handleCreateMovement(false)}
                disabled={submitting || !reposForm.concept || !reposForm.amount}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                {submitting ? 'Registrando…' : 'Registrar Reposición'}
              </button>
              <button onClick={() => setShowReposModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm">
                Cancelar
              </button>
            </div>
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
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Concepto</label>
              <input
                type="text"
                value={editForm.concept ?? ''}
                onChange={e => setEditForm(f => ({ ...f, concept: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount ?? ''}
                onChange={e => setEditForm(f => ({ ...f, amount: parseFloat(e.target.value) }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-400"
              />
            </div>
            {editingMovement.movement_type === 'EGRESO' && (
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Categoría</label>
                <select
                  value={editForm.category ?? 'OTRO'}
                  onChange={e => setEditForm(f => ({ ...f, category: e.target.value as PettyCashCategory }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-400"
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Fecha</label>
              <input
                type="date"
                value={editForm.movement_date ?? ''}
                onChange={e => setEditForm(f => ({ ...f, movement_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Notas</label>
              <textarea
                rows={2}
                value={editForm.notes ?? ''}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>
            {formError && <p className="text-xs text-red-600 font-bold">{formError}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setEditingMovement(null); setEditForm({}); setFormError(null); }}
                className="px-4 py-2 text-xs font-black uppercase border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEdit}
                className="px-4 py-2 text-xs font-black uppercase bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
