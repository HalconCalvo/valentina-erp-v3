import React, { useState, useEffect } from 'react';
import axiosClient from '../../../api/axios-client';
import { Button } from '@/components/ui/Button';
import { Plus, XCircle, Receipt } from 'lucide-react';

const OVERHEAD_CATEGORIES_BASE = [
    'PLANTA', 'COMUNICACIONES', 'COMBUSTIBLES', 'TRANSPORTE',
    'MAQUINARIA', 'EXTERNOS', 'MAQUILA', 'OTRO',
];

const OVERHEAD_CATEGORIES_DIRECTOR = [
    'PLANTA', 'COMUNICACIONES', 'COMBUSTIBLES', 'TRANSPORTE',
    'INSUMOS', 'MAQUINARIA', 'EXTERNOS', 'MAQUILA', 'MATERIALES', 'OTRO',
];

const CATEGORY_COLORS: Record<string, string> = {
    PLANTA:         'bg-blue-50 text-blue-700 border-blue-200',
    COMUNICACIONES: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    COMBUSTIBLES:   'bg-orange-50 text-orange-700 border-orange-200',
    TRANSPORTE:     'bg-amber-50 text-amber-700 border-amber-200',
    INSUMOS:        'bg-emerald-50 text-emerald-700 border-emerald-200',
    MAQUINARIA:     'bg-slate-50 text-slate-700 border-slate-200',
    EXTERNOS:       'bg-violet-50 text-violet-700 border-violet-200',
    MAQUILA:        'bg-rose-50 text-rose-700 border-rose-200',
    MATERIALES:     'bg-teal-50 text-teal-700 border-teal-200',
    OTRO:           'bg-gray-50 text-gray-700 border-gray-200',
};

interface Expense {
    id: number;
    invoice_folio: string;
    provider_name: string | null;
    total_amount: number;
    due_date: string;
    status: string;
    created_at: string;
    overhead_category: string | null;
    instance_id: number | null;
}

interface Props {
    onBack: () => void;
    onRefresh: () => void;
    userRole: string;
}

const emptyForm = () => ({
    provider_name: '',
    concept: '',
    overhead_category: '',
    total_amount: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    notes: '',
    instance_id: null as number | null,
});

export const OperationalExpensesPanel: React.FC<Props> = ({ onBack: _onBack, onRefresh, userRole }) => {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState(emptyForm());

    const [orders, setOrders] = useState<any[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<string>('');
    const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
    const [instances, setInstances] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);

    const fmt = (n: number) =>
        n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const load = async () => {
        try {
            const res = await axiosClient.get('/purchases/operational-expenses?limit=100');
            setExpenses(res.data);
        } catch {
            setError('Error al cargar gastos operativos.');
        }
    };

    useEffect(() => {
        load();
        const loadOrders = async () => {
            setLoadingOrders(true);
            try {
                const res = await axiosClient.get('/sales/orders/');
            const activeOrders = res.data.filter((o: any) =>
                ['SOLD', 'IN_PRODUCTION', 'FINISHED', 'COMPLETED'].includes(o.status)
            );
                setOrders(activeOrders);
            } catch {
                /* ignore */
            } finally {
                setLoadingOrders(false);
            }
        };
        loadOrders();
    }, []);

    const handleOrderChange = async (orderId: string) => {
        setSelectedOrderId(orderId);
        setSelectedInstanceId('');
        setInstances([]);
        if (!orderId) return;
        try {
            const res = await axiosClient.get(`/sales/orders/${orderId}`);
            const order = res.data;
            const allInstances = (order.items ?? []).flatMap(
                (item: any) => item.instances ?? []
            );
            setInstances(allInstances);
        } catch {
            setInstances([]);
        }
    };

    const handleSubmit = async () => {
        if (!form.concept)            return setError('El concepto es obligatorio.');
        if (!form.overhead_category)  return setError('Debes seleccionar una categoría.');
        if (!form.total_amount || parseFloat(form.total_amount) <= 0)
                                       return setError('El monto debe ser mayor a 0.');
        if (!form.due_date)            return setError('La fecha de vencimiento es obligatoria.');
        if (form.overhead_category === 'MAQUILA' && !selectedInstanceId)
                                       return setError('Para MAQUILA debes seleccionar una instancia.');

        setLoading(true);
        setError(null);
        try {
            await axiosClient.post('/purchases/operational-expenses', {
                provider_name: form.provider_name || null,
                concept: form.concept,
                overhead_category: form.overhead_category,
                total_amount: parseFloat(form.total_amount),
                issue_date: form.issue_date,
                due_date: form.due_date,
                notes: form.notes || null,
                instance_id: form.overhead_category === 'MAQUILA'
                    ? parseInt(selectedInstanceId)
                    : null,
            });
            setShowModal(false);
            setForm(emptyForm());
            setSelectedOrderId('');
            setSelectedInstanceId('');
            setInstances([]);
            await load();
            onRefresh();
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Error al registrar gasto.');
        } finally {
            setLoading(false);
        }
    };

    const canWrite = ['DIRECTOR', 'GERENCIA', 'ADMIN'].includes(userRole.toUpperCase().trim());
    const isDirector = userRole.toUpperCase().trim() === 'DIRECTOR';

    return (
        <div className="space-y-6 animate-in fade-in duration-300">

            {canWrite && (
                <div className="flex justify-end">
                    <Button
                        onClick={() => { setShowModal(true); setError(null); }}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-xs px-5 h-10 flex items-center gap-2 shadow-md"
                    >
                        <Plus size={16} /> Nuevo Gasto
                    </Button>
                </div>
            )}

            {/* Tabla */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Folio</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Proveedor / Concepto</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Categoría</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Monto</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Vencimiento</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {expenses.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3 text-slate-300">
                                        <Receipt size={40} strokeWidth={1} />
                                        <p className="font-black uppercase text-xs">Sin gastos operativos registrados</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            expenses.map(e => (
                                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-black text-indigo-600 text-xs">
                                        {e.invoice_folio}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-slate-700">
                                        {e.provider_name || '—'}
                                        {e.overhead_category === 'MAQUILA' && e.instance_id && (
                                            <span className="text-[10px] text-rose-600 font-bold block">
                                                Instancia #{e.instance_id}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {e.overhead_category ? (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase ${
                                                CATEGORY_COLORS[e.overhead_category] ?? CATEGORY_COLORS['OTRO']
                                            }`}>
                                                {e.overhead_category}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-black text-slate-800">
                                        {fmt(e.total_amount)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">
                                        {e.due_date
                                            ? new Date(e.due_date).toLocaleDateString('es-MX')
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase ${
                                            String(e.status).toUpperCase() === 'PENDIENTE'
                                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        }`}>
                                            {e.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal nuevo gasto */}
            {showModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-t-4 border-t-rose-500 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                                Nuevo Gasto Operativo
                            </h3>
                            <button onClick={() => setShowModal(false)}>
                                <XCircle size={22} className="text-slate-400 hover:text-slate-600" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

                            {/* Categoría — primera y obligatoria */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Categoría *
                                </label>
                                <select
                                    value={form.overhead_category}
                                    onChange={e => setForm(f => ({ ...f, overhead_category: e.target.value }))}
                                    className={`w-full border rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none ${
                                        !form.overhead_category
                                            ? 'border-red-300 bg-red-50'
                                            : 'border-slate-200'
                                    }`}
                                >
                                    <option value="">— Seleccionar categoría —</option>
                                    {(isDirector
                                        ? OVERHEAD_CATEGORIES_DIRECTOR
                                        : OVERHEAD_CATEGORIES_BASE
                                    ).map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Selectores OV e Instancia — solo para MAQUILA */}
                            {form.overhead_category === 'MAQUILA' && (
                                <>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                            Orden de Venta *
                                        </label>
                                        <select
                                            value={selectedOrderId}
                                            onChange={e => handleOrderChange(e.target.value)}
                                            disabled={loadingOrders}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none ${
                                                !selectedOrderId
                                                    ? 'border-red-300 bg-red-50'
                                                    : 'border-slate-200'
                                            }`}
                                        >
                                            <option value="">— Seleccionar OV —</option>
                                            {orders.map((o: any) => (
                                                <option key={o.id} value={o.id}>
                                                    OV-{String(o.id).padStart(4, '0')} — {o.project_name || o.client_name || ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {selectedOrderId && (
                                        <div>
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                                Instancia *
                                            </label>
                                            <select
                                                value={selectedInstanceId}
                                                onChange={e => setSelectedInstanceId(e.target.value)}
                                                className={`w-full border rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none ${
                                                    !selectedInstanceId
                                                        ? 'border-red-300 bg-red-50'
                                                        : 'border-slate-200'
                                                }`}
                                            >
                                                <option value="">— Seleccionar instancia —</option>
                                                {instances.map((inst: any) => (
                                                    <option key={inst.id} value={inst.id}>
                                                        {inst.custom_name || `Instancia ${inst.id}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Proveedor */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Proveedor (opcional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej. CFE, Telmex, Arrendadora..."
                                    value={form.provider_name}
                                    onChange={e => setForm(f => ({ ...f, provider_name: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-rose-400"
                                />
                            </div>

                            {/* Concepto */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Concepto *
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej. Renta enero 2026, Factura luz..."
                                    value={form.concept}
                                    onChange={e => setForm(f => ({ ...f, concept: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-rose-400"
                                />
                            </div>

                            {/* Monto */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Monto Total *
                                </label>
                                <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 focus-within:border-rose-400">
                                    <span className="text-sm font-bold text-slate-400 mr-2">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.total_amount}
                                        onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))}
                                        className="w-full text-sm font-bold text-slate-700 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Fechas */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                        Fecha Factura *
                                    </label>
                                    <input
                                        type="date"
                                        value={form.issue_date}
                                        onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-rose-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                        Vencimiento *
                                    </label>
                                    <input
                                        type="date"
                                        value={form.due_date}
                                        onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                                        className={`w-full border rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none ${
                                            !form.due_date
                                                ? 'border-red-300 bg-red-50'
                                                : 'border-slate-200 focus:border-rose-400'
                                        }`}
                                    />
                                </div>
                            </div>

                            {/* Notas */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Notas (opcional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-rose-400 resize-none"
                                />
                            </div>

                            {error && (
                                <p className="text-xs text-red-600 font-bold bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                                    {error}
                                </p>
                            )}
                        </div>
                        <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                            <Button
                                variant="outline"
                                onClick={() => setShowModal(false)}
                                className="border-slate-200 text-slate-500 font-black uppercase text-[10px] px-5"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-[10px] px-6 shadow-md flex items-center gap-2"
                            >
                                <Plus size={14} /> Registrar Gasto
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
