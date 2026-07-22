import React, { useState, useEffect } from 'react';
import axiosClient from '../../../api/axios-client';

export const AllPurchaseOrdersModule: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('TODOS');
    const [selected, setSelected] = useState<any | null>(null);
    const [correctModal, setCorrectModal] = useState<{ item: any } | null>(null);
    const [realQty, setRealQty] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosClient.get('/purchases/orders/');
            setOrders(Array.isArray(res.data) ? res.data : []);
        } catch { setOrders([]); }
        finally { setLoading(false); }
    };

    const submitCorrection = async () => {
        if (!selected || !correctModal) return;
        const q = Number(realQty);
        if (realQty === '' || isNaN(q) || q < 0) { setError('Indica la cantidad realmente recibida.'); return; }
        if (!reason.trim()) { setError('Indica el motivo de la corrección.'); return; }
        setSaving(true); setError('');
        try {
            await axiosClient.put(
                `/purchases/orders/${selected.id}/items/${correctModal.item.id}/correct-reception`,
                { real_qty: q, reason: reason.trim() }
            );
            setCorrectModal(null); setRealQty(''); setReason('');
            const res = await axiosClient.get('/purchases/orders/');
            const list = Array.isArray(res.data) ? res.data : [];
            setOrders(list);
            setSelected(list.find((o: any) => o.id === selected.id) || null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'No se pudo corregir la recepción.');
        } finally { setSaving(false); }
    };

    const filtered = orders.filter(o => {
        const q = search.toLowerCase();
        const matchText = !q || (o.folio || '').toLowerCase().includes(q) || (o.provider_name || '').toLowerCase().includes(q);
        const matchStatus = statusFilter === 'TODOS' || (o.status || '') === statusFilter;
        return matchText && matchStatus;
    });

    const statuses = ['TODOS', 'DRAFT', 'ENVIADA', 'RECIBIDA_PARCIAL', 'RECIBIDA_TOTAL', 'CANCELADA'];

    if (selected) {
        return (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="font-black text-slate-800 text-lg">{selected.provider_name}</h3>
                        <p className="text-[11px] font-black text-slate-400 uppercase">Folio: {selected.folio} · {selected.status}</p>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-xs font-black uppercase px-4 py-2 border border-slate-300 rounded hover:bg-slate-50">← Volver</button>
                </div>
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-3 py-3 text-left">SKU</th>
                            <th className="px-3 py-3 text-left">Descripción</th>
                            <th className="px-3 py-3 text-center">Ordenadas</th>
                            <th className="px-3 py-3 text-center">Recibidas</th>
                            <th className="px-3 py-3 text-center">Estado</th>
                            <th className="px-3 py-3 text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {(selected.items || []).map((it: any, i: number) => {
                            const rec = Number(it.quantity_received || 0);
                            return (
                                <tr key={i} className="hover:bg-slate-50/40">
                                    <td className="px-3 py-3 font-black text-indigo-600 text-[11px] uppercase">{it.sku || 'S/SKU'}</td>
                                    <td className="px-3 py-3 text-xs font-bold text-slate-700">{it.name}</td>
                                    <td className="px-3 py-3 text-center text-xs font-black text-slate-600">{it.quantity_ordered ?? it.qty ?? 0}</td>
                                    <td className="px-3 py-3 text-center text-xs font-black text-emerald-600">{rec}</td>
                                    <td className="px-3 py-3 text-center text-[9px] font-black uppercase text-slate-400">
                                        {it.is_cancelled ? 'Cancelado' : it.is_fulfilled ? 'Cerrado' : '—'}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        {rec > 0 && (
                                            <button type="button"
                                                onClick={() => { setCorrectModal({ item: it }); setRealQty(''); setReason(''); setError(''); }}
                                                className="text-[9px] font-black text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-2 py-1 uppercase tracking-wide">
                                                Corregir
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {correctModal && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                            <h3 className="font-black text-slate-800 text-sm uppercase mb-2">Corregir recepción</h3>
                            <p className="text-xs text-slate-500 mb-4">
                                {correctModal.item.sku} — registrado como recibido: <b>{Number(correctModal.item.quantity_received || 0)}</b>.
                                Indica cuánto llegó realmente. Se revertirá inventario y se ajustará la cuenta por pagar.
                            </p>
                            {error && <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">{error}</div>}
                            <label className="text-[10px] font-black text-slate-400 uppercase">Cantidad realmente recibida</label>
                            <input type="number" min="0" value={realQty} onChange={e => setRealQty(e.target.value)}
                                className="w-full border border-slate-200 rounded p-2 text-xs mt-1 mb-3 outline-none focus:border-indigo-500" />
                            <label className="text-[10px] font-black text-slate-400 uppercase">Motivo (obligatorio)</label>
                            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                                placeholder="Ej. Se aceptó de más por error, solo llegaron 30"
                                className="w-full border border-slate-200 rounded p-2 text-xs mt-1 mb-4 outline-none focus:border-indigo-500" />
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setCorrectModal(null)} className="text-xs font-black uppercase px-4 py-2 text-slate-500 hover:text-slate-700">Cancelar</button>
                                <button onClick={submitCorrection} disabled={saving}
                                    className="text-xs font-black uppercase px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">
                                    {saving ? 'Corrigiendo...' : 'Confirmar corrección'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <div className="flex gap-3 mb-4">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por folio o proveedor..."
                    className="flex-1 text-xs border border-slate-200 rounded px-3 py-2 outline-none focus:border-indigo-500" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="text-xs font-bold border border-slate-200 rounded px-3 py-2 outline-none focus:border-indigo-500">
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            {loading ? <p className="text-xs text-slate-400 py-8 text-center">Cargando órdenes...</p> : (
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-3 py-3 text-left">Folio</th>
                            <th className="px-3 py-3 text-left">Proveedor</th>
                            <th className="px-3 py-3 text-center">Partidas</th>
                            <th className="px-3 py-3 text-center">Estado</th>
                            <th className="px-3 py-3 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filtered.map(o => (
                            <tr key={o.id} onClick={() => setSelected(o)} className="hover:bg-indigo-50/40 cursor-pointer">
                                <td className="px-3 py-3 font-black text-indigo-600 text-[11px]">{o.folio}</td>
                                <td className="px-3 py-3 text-xs font-bold text-slate-700">{o.provider_name}</td>
                                <td className="px-3 py-3 text-center text-xs font-black text-slate-600">{(o.items || []).length}</td>
                                <td className="px-3 py-3 text-center text-[9px] font-black uppercase text-slate-500">{o.status}</td>
                                <td className="px-3 py-3 text-right text-xs font-black text-slate-800">${Number(o.total_estimated_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-xs text-slate-400 py-8">Sin órdenes que coincidan.</td></tr>}
                    </tbody>
                </table>
            )}
        </div>
    );
};
