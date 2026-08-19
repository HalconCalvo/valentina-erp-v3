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
    const [prepayModal, setPrepayModal] = useState(false);
    const [prepayAmount, setPrepayAmount] = useState('');
    const [prepayDate, setPrepayDate] = useState(new Date().toISOString().split('T')[0]);
    const [prepayRef, setPrepayRef] = useState('');
    const [prepayNotes, setPrepayNotes] = useState('');
    const [prepayLoading, setPrepayLoading] = useState(false);
    const [prepayError, setPrepayError] = useState('');
    const [prepayments, setPrepayments] = useState<any[]>([]);
    const [realQty, setRealQty] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const id = setTimeout(() => { load(); }, 400);
        return () => clearTimeout(id);
    }, [search, dateFrom, dateTo, statusFilter]);

    useEffect(() => {
        if (onDetailChange) onDetailChange(selected !== null);
    }, [selected]);

    useEffect(() => {
        if (closeSignal !== undefined && closeSignal > 0) setSelected(null);
    }, [closeSignal]);

    const load = async (params?: { search?: string; from?: string; to?: string; status?: string }) => {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            qs.set('limit', '200');
            const s = params?.search ?? search;
            const f = params?.from ?? dateFrom;
            const t = params?.to ?? dateTo;
            const st = params?.status ?? statusFilter;
            if (s && s.trim()) qs.set('search', s.trim());
            if (f) qs.set('date_from', f);
            if (t) qs.set('date_to', t);
            if (st && st !== 'TODOS') qs.set('status', st);
            const res = await axiosClient.get(`/purchases/orders/?${qs.toString()}`);
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
            const qs = new URLSearchParams();
            qs.set('limit', '200');
            if (search && search.trim()) qs.set('search', search.trim());
            if (dateFrom) qs.set('date_from', dateFrom);
            if (dateTo) qs.set('date_to', dateTo);
            if (statusFilter && statusFilter !== 'TODOS') qs.set('status', statusFilter);
            const res = await axiosClient.get(`/purchases/orders/?${qs.toString()}`);
            const list = Array.isArray(res.data) ? res.data : [];
            setOrders(list);
            setSelected(list.find((o: any) => o.id === selected.id) || null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'No se pudo corregir la recepción.');
        } finally { setSaving(false); }
    };

    const loadPrepayments = async (poId: number) => {
        try {
            const res = await axiosClient.get(`/finance/prepayments/by-order/${poId}`);
            setPrepayments(res.data || []);
        } catch { setPrepayments([]); }
    };

    const submitPrepayment = async () => {
        if (!selected) return;
        const amount = parseFloat(prepayAmount);
        if (!amount || amount <= 0) { setPrepayError('Captura un monto válido.'); return; }
        if (!prepayDate) { setPrepayError('Captura la fecha del pago.'); return; }
        setPrepayLoading(true); setPrepayError('');
        try {
            await axiosClient.post('/finance/prepayments', {
                purchase_order_id: selected.id,
                provider_id: selected.provider_id,
                amount,
                payment_date: prepayDate,
                reference: prepayRef || null,
                notes: prepayNotes || null,
            });
            await loadPrepayments(selected.id);
            setPrepayAmount(''); setPrepayRef(''); setPrepayNotes('');
            setPrepayError('');
        } catch (e: any) {
            setPrepayError(e?.response?.data?.detail || 'Error al registrar el prepago.');
        } finally {
            setPrepayLoading(false);
        }
    };

    const filtered = orders;

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
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                className="text-[9px] font-black uppercase border-indigo-200 h-8 hover:bg-indigo-50 text-indigo-600"
                                onClick={() => { setPrepayModal(true); loadPrepayments(selected.id); }}
                            >
                                💳 Registrar Prepago
                            </Button>
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

            {/* Modal de Prepago */}
            {prepayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black text-slate-800">💳 Registrar Prepago</h3>
                            <button onClick={() => { setPrepayModal(false); setPrepayError(''); }} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
                        </div>
                        <p className="text-xs text-slate-500">OC: <span className="font-bold text-slate-700">{selected.folio}</span> · Proveedor: <span className="font-bold text-slate-700">{selected.provider_name}</span></p>

                        {/* Prepagos existentes */}
                        {prepayments.length > 0 && (
                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-1">
                                <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wide">Prepagos registrados</p>
                                {prepayments.map((p: any) => (
                                    <div key={p.id} className="flex justify-between items-center text-xs">
                                        <span className="text-slate-600">{p.payment_date?.slice(0,10)} {p.reference ? `· ${p.reference}` : ''}</span>
                                        <span className="font-black text-indigo-700">${parseFloat(p.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                ))}
                                <div className="border-t border-indigo-200 pt-1 flex justify-between text-xs font-black">
                                    <span className="text-indigo-700">Total prepagado</span>
                                    <span className="text-indigo-800">${prepayments.reduce((s: number, p: any) => s + parseFloat(p.amount), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        )}

                        {/* Formulario nuevo prepago */}
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Monto del prepago *</label>
                                <input
                                    type="number" step="0.01" min="0"
                                    value={prepayAmount}
                                    onChange={e => setPrepayAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-300 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Fecha del pago *</label>
                                <input
                                    type="date"
                                    value={prepayDate}
                                    onChange={e => setPrepayDate(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Referencia bancaria</label>
                                <input
                                    type="text"
                                    value={prepayRef}
                                    onChange={e => setPrepayRef(e.target.value)}
                                    placeholder="Número de transferencia, SPEI, etc."
                                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Notas</label>
                                <input
                                    type="text"
                                    value={prepayNotes}
                                    onChange={e => setPrepayNotes(e.target.value)}
                                    placeholder="Observaciones opcionales"
                                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                                />
                            </div>
                        </div>

                        {prepayError && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{prepayError}</p>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => { setPrepayModal(false); setPrepayError(''); }}
                                className="flex-1 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={submitPrepayment}
                                disabled={prepayLoading}
                                className="flex-1 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {prepayLoading ? 'Registrando...' : 'Registrar Prepago'}
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
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                {loading ? 'Buscando...' : `${filtered.length} órdenes${filtered.length === 200 ? ' (mostrando las 200 más recientes — usa búsqueda o fechas para ver más)' : ''}`}
            </p>
            {loading ? <p className="text-xs text-slate-400 py-8 text-center">Cargando órdenes...</p> : (
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-3 py-3 text-left">Folio</th>
                            <th className="px-3 py-3 text-left">Fecha</th>
                            <th className="px-3 py-3 text-left">Proveedor</th>
                            <th className="px-3 py-3 text-center">Partidas</th>
                            <th className="px-3 py-3 text-center">Estado</th>
                            <th className="px-3 py-3 text-center">Factura(s)</th>
                            <th className="px-3 py-3 text-right">Total (c/IVA)</th>
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
                                <td className="px-3 py-3 text-center text-xs font-mono text-slate-600">{o.invoice_folios || '—'}</td>
                                <td className="px-3 py-3 text-right text-xs font-black text-slate-800">${Number((o.total_estimated_amount || 0) * 1.16).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-xs text-slate-400 py-8">Sin órdenes que coincidan.</td></tr>}
                    </tbody>
                </table>
            )}
        </div>
    );
};
