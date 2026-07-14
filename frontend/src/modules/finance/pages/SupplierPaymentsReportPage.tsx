import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, Download } from 'lucide-react';
import client from '../../../api/axios-client';
import type { Provider } from '../../foundations/hooks/useProviders';

type StatusFilter = 'paid' | 'pending' | 'all';

interface ReportPayment {
    payment_date: string;
    invoice_number: string;
    amount: number;
    payment_method: string;
    reference: string | null;
    status: string;
}

interface SupplierPaymentsReportData {
    provider: { id: number; name: string };
    date_from: string;
    date_to: string;
    status_filter: StatusFilter;
    payments: ReportPayment[];
    total_amount: number;
    count: number;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'paid', label: 'Pagados' },
    { value: 'pending', label: 'Por Pagar' },
    { value: 'all', label: 'Ambos' },
];

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
    paid: 'Pagados',
    pending: 'Por Pagar',
    all: 'Ambos',
};

const formatCurrency = (amount: number) =>
    (Number.isFinite(amount) ? amount : 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const formatDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const SupplierPaymentsReportPage: React.FC = () => {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loadingProviders, setLoadingProviders] = useState(true);

    const [providerId, setProviderId] = useState<string>('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<SupplierPaymentsReportData | null>(null);

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

    const canGenerate = Boolean(providerId && dateFrom && dateTo);

    const handleGenerate = async () => {
        if (!canGenerate) return;
        setLoading(true);
        setReport(null);
        try {
            const token = localStorage.getItem('token');
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
            const params = new URLSearchParams({
                provider_id: providerId,
                date_from: dateFrom,
                date_to: dateTo,
                status_filter: statusFilter,
            });
            const response = await fetch(`${baseUrl}/reports/supplier_payments?${params}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                const err = await response.json();
                alert(`Error: ${err.detail}`);
                return;
            }
            const data: SupplierPaymentsReportData = await response.json();
            setReport(data);
        } catch {
            alert('Error al generar el reporte.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            <div className="border-b border-slate-200 pb-4">
                <h1 className="text-3xl font-black tracking-tight text-indigo-800 flex items-center gap-3">
                    <FileText className="text-indigo-500" size={32} />
                    Reporte de Pagos a Proveedor
                </h1>
                <p className="text-slate-500 mt-1 font-medium">
                    Consulta pagos ejecutados, solicitados o autorizados por proveedor y rango de fechas.
                </p>
            </div>

            {/* Filtros */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Filtros</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1 lg:col-span-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Proveedor</label>
                        <select
                            value={providerId}
                            onChange={(e) => setProviderId(e.target.value)}
                            disabled={loadingProviders}
                            className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="">Selecciona un proveedor</option>
                            {providers.map((p) => (
                                <option key={p.id} value={String(p.id)}>
                                    {p.business_name}
                                </option>
                            ))}
                        </select>
                    </div>
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
                        onClick={() => void handleGenerate()}
                        disabled={!canGenerate || loading}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow-sm transition-all text-sm"
                    >
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
                        Generar Reporte
                    </button>
                </div>
            </section>

            {/* Resultados */}
            {report && (
                <section className="bg-white rounded-xl border border-indigo-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-indigo-100 bg-indigo-50/50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <h2 className="font-black text-indigo-900 text-lg">{report.provider.name}</h2>
                            <p className="text-sm text-slate-600 mt-0.5">
                                {formatDate(report.date_from)} — {formatDate(report.date_to)}
                                <span className="mx-2 text-slate-300">|</span>
                                Estatus: <span className="font-semibold">{STATUS_FILTER_LABELS[report.status_filter]}</span>
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => alert('PDF en construcción')}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-lg text-sm hover:bg-indigo-50 transition-all shadow-sm"
                        >
                            <Download size={16} />
                            Descargar PDF
                        </button>
                    </div>

                    {report.count === 0 ? (
                        <div className="p-12 text-center text-slate-500 italic">
                            No hay pagos para los filtros seleccionados
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th className="p-4">Fecha de pago</th>
                                        <th className="p-4">Folio</th>
                                        <th className="p-4 text-right">Monto</th>
                                        <th className="p-4">Método</th>
                                        <th className="p-4">Referencia</th>
                                        <th className="p-4">Estatus</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {report.payments.map((row, idx) => (
                                        <tr key={`${row.invoice_number}-${row.payment_date}-${idx}`} className="hover:bg-slate-50">
                                            <td className="p-4 text-sm text-slate-700">{formatDate(row.payment_date)}</td>
                                            <td className="p-4 text-sm font-medium text-slate-800">{row.invoice_number}</td>
                                            <td className="p-4 text-right font-black text-indigo-700 tabular-nums">
                                                {formatCurrency(row.amount)}
                                            </td>
                                            <td className="p-4 text-sm text-slate-600">{row.payment_method}</td>
                                            <td className="p-4 text-sm text-slate-500">{row.reference || '—'}</td>
                                            <td className="p-4 text-sm font-semibold text-slate-700">{row.status}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                        <td colSpan={2} className="p-4 font-black text-slate-800">
                                            Total ({report.count} pagos):
                                        </td>
                                        <td className="p-4 text-right font-black text-indigo-900 text-lg tabular-nums">
                                            {formatCurrency(report.total_amount)}
                                        </td>
                                        <td colSpan={3} />
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

export default SupplierPaymentsReportPage;
