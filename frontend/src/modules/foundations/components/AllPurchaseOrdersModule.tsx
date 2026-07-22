import React, { useState, useEffect } from 'react';
import { PackageCheck, FileText } from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { Button } from "@/components/ui/Button";

interface AllPurchaseOrdersModuleProps {
    onDetailChange?: (open: boolean) => void;
    closeSignal?: number;
}

export const AllPurchaseOrdersModule: React.FC<AllPurchaseOrdersModuleProps> = ({ onDetailChange, closeSignal }) => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('TODOS');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selected, setSelected] = useState<any | null>(null);
    const [correctModal, setCorrectModal] = useState<{ item: any } | null>(null);
    const [realQty, setRealQty] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { load(); }, []);

    useEffect(() => {
        if (onDetailChange) onDetailChange(selected !== null);
    }, [selected]);

    useEffect(() => {
        if (closeSignal !== undefined && closeSignal > 0) setSelected(null);
    }, [closeSignal]);

    const load = async () => {
        setLoading(true);
        try {
            const res = await axiosClient.get('/purchases/orders/?limit=1000');
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
            const res = await axiosClient.get('/purchases/orders/?limit=1000');
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
        const fecha = o.created_at ? String(o.created_at).slice(0, 10) : '';
        const matchFrom = !dateFrom || (fecha && fecha >= dateFrom);
        const matchTo = !dateTo || (fecha && fecha <= dateTo);
        return matchText && matchStatus && matchFrom && matchTo;
    });

    const statuses = ['TODOS', 'DRAFT', 'ENVIADA', 'RECIBIDA_PARCIAL', 'RECIBIDA_TOTAL', 'CANCELADA'];

    if (selected) {
        const items = selected.items || [];
        const subtotal = items.reduce((s: number, it: any) => s + Number(it.subtotal || 0), 0);
        const iva = subtotal * 0.16;
        const total = subtotal + iva;
        return (
            <div className="space-y-4">
                <button onClick={() => setSelected(null)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 underline underline-offset-2">← Volver al listado</button>
                <div className="bg-white rounded-3xl border border-emerald-200 shadow-md overflow-hidden border-t-8 border-t-emerald-500 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/30">
                        <div className="flex items-center gap-5">
                            <div className="p-3 rounded-2xl shadow-inner bg-emerald-100 text-emerald-600"><PackageCheck size={24} /></div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800 uppercase leading-none">{selected.provider_name}</h3>
                                <p className="text-[9px] font-black uppercase text-emerald-600 mt-1 tracking-widest leading-none">FOLIO: {selected.folio}</p>
                                <p className="text-[8px] font-black uppercase text-slate-400 mt-1 tracking-tighter leading-none">ESTADO: {selected.status}</p>
                                <p className="text-[8px] font-black uppercase text-slate-400 mt-1 tracking-tighter leading-none">
                                    FECHA: {selected.created_at ? new Date(selected.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="text-[9px] font-black uppercase border-slate-200 h-8 hover:bg-slate-100"
                            onClick={() => {
                                const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                                const baseUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000';
                                window.open(`${baseUrl}/api/v1/purchases/orders/${selected.id}/pdf?token=${token}`, '_blank');
                            }}
                        >
                            <FileText size={14} className="mr-1" />
                            Ver PDF Oficial
                        </Button>
                    </div>
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-8 py-4 text-left w-32">SKU</th>
                                <th className="px-4 py-4 text-left">Descripción</th>
                                <th className="px-4 py-4 text-center">Cant.</th>
                                <th className="px-4 py-4 text-center">Recibidas</th>
                                <th className="px-4 py-4 text-center w-32">P. Unit</th>
                                <th className="px-8 py-4 text-right">Proyecto</th>
                                <th className="px-8 py-4 text-right w-40">Importe</th>
                                <th className="px-6 py-4 text-center w-28">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {items.map((item: any, i: number) => {
                                const rec = Number(item.quantity_received || 0);
                                return (
                                    <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-8 py-3 font-black text-indigo-600 text-[11px] uppercase">{item.sku}</td>
                                        <td className="px-4 py-3 font-bold text-slate-700 text-xs uppercase">{item.name}</td>
                                        <td className="px-4 py-3 text-center text-xs font-black text-slate-600">{item.qty ?? item.quantity_ordered ?? 0}</td>
                                        <td className="px-4 py-3 text-center text-xs font-black text-emerald-600">{rec > 0 ? rec : '—'}</td>
                                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">${Number(item.expected_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-8 py-3 text-right"><span className="text-[10px] font-black text-rose-600 uppercase">{item.project_name || "GENERAL"}</span></td>
                                        <td className="px-8 py-3 text-right text-xs font-black text-slate-800">${Number(item.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-3 text-center">
                                            {rec > 0 ? (
                                                <button type="button"
                                                    onClick={() => { setCorrectModal({ item }); setRealQty(''); setReason(''); setError(''); }}
                                                    className="text-[9px] font-black text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-2 py-1 uppercase tracking-wide transition-colors">
                                                    Corregir
                                                </button>
                                            ) : (
                                                <span className="text-[9px] font-black uppercase tracking-wide text-slate-300">
                                                    {item.is_cancelled ? 'Cancelado' : item.is_fulfilled ? 'Cerrado' : '—'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div className="p-8 bg-slate-50/50 flex justify-end items-center border-t border-slate-100">
                        <div className="w-80 space-y-1 pr-14">
                            <div className="flex justify-between items-center text-slate-500"><span className="text-[10px] font-black uppercase">Subtotal</span><span className="text-sm font-bold">${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                            <div className="flex justify-between items-center text-slate-500 border-b border-slate-200 pb-2"><span className="text-[10px] font-black uppercase">IVA (16%)</span><span className="text-sm font-bold">${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                            <div className="flex justify-between items-center pt-2"><span className="text-[11px] font-black text-emerald-600 uppercase">Total</span><span className="text-3xl font-black text-slate-900">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                        </div>
                    </div>
                </div>

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
            <div className="flex flex-wrap gap-3 mb-4">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por folio o proveedor..."
                    className="flex-1 min-w-[200px] text-xs border border-slate-200 rounded px-3 py-2 outline-none focus:border-indigo-500" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="text-xs font-bold border border-slate-200 rounded px-3 py-2 outline-none focus:border-indigo-500">
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase">Desde</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="text-xs font-bold border border-slate-200 rounded px-2 py-2 outline-none focus:border-indigo-500" />
                    <label className="text-[10px] font-black text-slate-400 uppercase">Hasta</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        className="text-xs font-bold border border-slate-200 rounded px-2 py-2 outline-none focus:border-indigo-500" />
                    {(dateFrom || dateTo) && (
                        <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}
                            className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase underline underline-offset-2">
                            Limpiar
                        </button>
                    )}
                </div>
            </div>
            {loading ? <p className="text-xs text-slate-400 py-8 text-center">Cargando órdenes...</p> : (
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-3 py-3 text-left">Folio</th>
                            <th className="px-3 py-3 text-left">Fecha</th>
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
                                <td className="px-3 py-3 text-xs font-bold text-slate-500">
                                    {o.created_at ? new Date(o.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                </td>
                                <td className="px-3 py-3 text-xs font-bold text-slate-700">{o.provider_name}</td>
                                <td className="px-3 py-3 text-center text-xs font-black text-slate-600">{(o.items || []).length}</td>
                                <td className="px-3 py-3 text-center text-[9px] font-black uppercase text-slate-500">{o.status}</td>
                                <td className="px-3 py-3 text-right text-xs font-black text-slate-800">${Number(o.total_estimated_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={6} className="text-center text-xs text-slate-400 py-8">Sin órdenes que coincidan.</td></tr>}
                    </tbody>
                </table>
            )}
        </div>
    );
};
