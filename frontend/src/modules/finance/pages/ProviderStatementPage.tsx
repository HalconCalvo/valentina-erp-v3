import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, RefreshCw, ArrowLeft } from 'lucide-react';
import client from '../../../api/axios-client';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import type { Provider } from '../../foundations/hooks/useProviders';

type StatusFilter = 'paid' | 'pending' | 'all';
type DateMode = 'range' | 'all';

interface ProviderInvoice {
    invoice_number: string;
    issue_date: string | null;
    due_date: string | null;
    total_amount: number;
    paid_amount: number;
    outstanding: number;
    raw_status: string;
}

interface StatementData {
    provider: { id: number; name: string };
    invoices: ProviderInvoice[];
    total_facturado: number;
    total_abonado: number;
    total_por_pagar: number;
    count: number;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'pending', label: 'Pendientes' },
    { value: 'paid', label: 'Pagadas' },
    { value: 'all', label: 'Todas' },
];

const formatCurrency = (amount: number) =>
    (Number.isFinite(amount) ? amount : 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const formatDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ProviderStatementPage: React.FC = () => {
    const navigate = useNavigate();
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loadingProviders, setLoadingProviders] = useState(true);

    const [providerId, setProviderId] = useState<string>('');
    const [dateMode, setDateMode] = useState<DateMode>('range');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<StatementData | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingProviders(true);
            try {
                const { data } = await client.get<Provider[]>('/foundations/providers');
                if (!cancelled) setProviders(Array.isArray(data) ? data : []);
            } catch (e) {
                console.error(e);
                if (!cancelled) setProviders([]);
            } finally {
                if (!cancelled) setLoadingProviders(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const canConsult = Boolean(providerId && (dateMode === 'all' || (dateFrom && dateTo)));

    const handleConsult = async () => {
        if (!canConsult) return;
        setLoading(true);
        setReport(null);
        try {
            const token = localStorage.getItem('token');
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
            const from = dateMode === 'all' ? '2000-01-01' : dateFrom;
            const to = dateMode === 'all' ? '2099-12-31' : dateTo;
            const params = new URLSearchParams({
                provider_id: providerId,
                date_from: from,
                date_to: to,
                status_filter: statusFilter,
            });
            const response = await fetch(`${baseUrl}/reports/provider_invoices?${params}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                const err = await response.json();
                alert(`Error: ${err.detail}`);
                return;
            }
            const data: StatementData = await response.json();
            setReport(data);
        } catch {
            alert('Error al consultar el estado de cuenta.');
        } finally {
            setLoading(false);
        }
    };

    const getStatusDisplay = (inv: ProviderInvoice): { text: string; className: string } => {
        if (inv.outstanding <= 0) {
            return { text: 'Pagada', className: 'text-emerald-700 bg-emerald-50' };
        }
        if (inv.due_date) {
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const venc = new Date(`${inv.due_date}T00:00:00`);
            const diffDias = Math.round((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDias > 0) {
                return {
                    text: `Vence en ${diffDias} día${diffDias === 1 ? '' : 's'}`,
                    className: 'text-amber-700 bg-amber-50',
                };
            }
            if (diffDias < 0) {
                const abs = Math.abs(diffDias);
                return {
                    text: `Vencida hace ${abs} día${abs === 1 ? '' : 's'}`,
                    className: 'text-red-700 bg-red-50',
                };
            }
            return { text: 'Vence hoy', className: 'text-red-700 bg-red-50' };
        }
        return { text: 'Pendiente', className: 'text-slate-600 bg-slate-50' };
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            <div className="border-b border-slate-200 pb-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-indigo-800 flex items-center gap-3">
                            <FileText className="text-indigo-500" size={32} />
                            Estado de Cuenta por Proveedor
                        </h1>
                        <p className="text-slate-500 mt-1 font-medium">
                            Facturas, abonos y saldos por proveedor
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm shrink-0"
                    >
                        <ArrowLeft size={18} /> Regresar
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Filtros</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1 lg:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Proveedor</label>
                        <SearchableSelect
                            items={providers}
                            value={providerId}
                            onChange={setProviderId}
                            getLabel={(p) => p.business_name}
                            getValue={(p) => String(p.id)}
                            placeholder="Busca un proveedor..."
                            disabled={loadingProviders}
                            className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div className="flex flex-col gap-2 lg:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Modo de fecha</label>
                        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                            <button
                                type="button"
                                onClick={() => setDateMode('range')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    dateMode === 'range'
                                        ? 'bg-white shadow text-indigo-700'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                Rango de fechas
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateMode('all')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    dateMode === 'all'
                                        ? 'bg-white shadow text-indigo-700'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                Todas las fechas
                            </button>
                        </div>
                    </div>
                    {dateMode === 'range' && (
                        <>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Desde</label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Hasta</label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Estatus</label>
                        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                            {STATUS_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setStatusFilter(opt.value)}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                        statusFilter === opt.value
                                            ? 'bg-white shadow text-indigo-700'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleConsult()}
                        disabled={!canConsult || loading}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-sm transition-all text-sm"
                    >
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
                        Consultar
                    </button>
                </div>
            </section>

            {/* Resultados */}
            {report && (
                <section className="bg-white rounded-xl border border-indigo-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-indigo-100 bg-indigo-50/50">
                        <h2 className="font-black text-indigo-900 text-lg">{report.provider.name}</h2>
                    </div>

                    {report.count === 0 ? (
                        <div className="p-12 text-center text-slate-500 italic">
                            No hay facturas para los filtros seleccionados
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th className="p-4">Folio</th>
                                        <th className="p-4">Fecha factura</th>
                                        <th className="p-4">Vencimiento</th>
                                        <th className="p-4 text-right">Total</th>
                                        <th className="p-4 text-right">Abonado</th>
                                        <th className="p-4 text-right">Por pagar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {report.invoices.map((inv, idx) => {
                                        const statusDisplay = getStatusDisplay(inv);
                                        return (
                                            <tr key={`${inv.invoice_number}-${idx}`} className="hover:bg-indigo-50/40">
                                                <td className="p-4 text-sm font-medium text-slate-800">
                                                    {inv.invoice_number}
                                                </td>
                                                <td className="p-4 text-sm text-slate-700">
                                                    {inv.issue_date ? formatDate(inv.issue_date) : '—'}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`text-xs font-bold px-2 py-1 rounded w-fit ${statusDisplay.className}`}>
                                                            {statusDisplay.text}
                                                        </span>
                                                        {inv.due_date && (
                                                            <span className="text-xs text-slate-500">
                                                                {formatDate(inv.due_date)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right text-sm tabular-nums text-slate-700">
                                                    {formatCurrency(inv.total_amount)}
                                                </td>
                                                <td className="p-4 text-right text-sm tabular-nums text-slate-700">
                                                    {formatCurrency(inv.paid_amount)}
                                                </td>
                                                <td className="p-4 text-right font-bold text-indigo-700 tabular-nums">
                                                    {formatCurrency(inv.outstanding)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                        <td colSpan={3} className="p-4 font-black text-slate-800">
                                            Totales ({report.count} factura{report.count === 1 ? '' : 's'})
                                        </td>
                                        <td className="p-4 text-right font-black text-slate-800 tabular-nums">
                                            {formatCurrency(report.total_facturado)}
                                        </td>
                                        <td className="p-4 text-right font-black text-slate-800 tabular-nums">
                                            {formatCurrency(report.total_abonado)}
                                        </td>
                                        <td className="p-4 text-right font-black text-indigo-900 text-lg tabular-nums">
                                            {formatCurrency(report.total_por_pagar)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default ProviderStatementPage;
