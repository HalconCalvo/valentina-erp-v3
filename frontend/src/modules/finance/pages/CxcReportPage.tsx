import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { salesService } from '../../../api/sales-service';

export interface CxcReportRow {
    cxc_id: number;
    invoice_folio: string | null;
    invoice_date: string | null;
    payment_type: string | null;
    client_id: number | null;
    client_name: string;
    project_name: string | null;
    sales_order_id: number;
    monto: number;
    abonado: number;
    saldo: number;
    estado: string;
    antiguedad_dias: number | null;
    payment_date?: string | null;
    treasury_transaction_id?: number | null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const formatCurrency = (amount: number) =>
    (Number.isFinite(amount) ? amount : 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const formatInvoiceDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = MESES[d.getMonth()] ?? '???';
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
};

const formatOv = (salesOrderId: number) => `OV-${String(salesOrderId).padStart(4, '0')}`;

const CxcReportPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo: string = (location.state as { returnTo?: string } | null)?.returnTo ?? '/treasury';

    const [rows, setRows] = useState<CxcReportRow[]>([]);
    const [loading, setLoading] = useState(false);

    const [clientId, setClientId] = useState<number | ''>('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [includePaid, setIncludePaid] = useState(false);
    const [onlyCancelled, setOnlyCancelled] = useState(false);

    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            const data = await salesService.getCxcReport({
                client_id: clientId === '' ? undefined : clientId,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                include_paid: includePaid,
                only_cancelled: onlyCancelled,
            });
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Error cargando reporte CxC:', e);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [clientId, dateFrom, dateTo, includePaid, onlyCancelled]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const clientOptions = useMemo(() => {
        const map = new Map<number, string>();
        for (const row of rows) {
            if (row.client_id != null && row.client_name) {
                map.set(row.client_id, row.client_name);
            }
        }
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [rows]);

    const metrics = useMemo(() => {
        const vivas = rows.filter((r) => r.saldo > 0.01 && r.estado !== 'CANCELADA').length;
        const totalFacturado = rows.reduce((s, r) => s + (r.monto || 0), 0);
        const totalAbonado = rows.reduce((s, r) => s + (r.abonado || 0), 0);
        const totalSaldo = rows.reduce((s, r) => s + (r.saldo || 0), 0);
        return { vivas, totalFacturado, totalAbonado, totalSaldo };
    }, [rows]);

    const grouped = useMemo(() => {
        const map = new Map<string, { clientId: number | null; clientName: string; rows: CxcReportRow[]; debe: number }>();
        for (const row of rows) {
            const key = row.client_id != null ? String(row.client_id) : `__none__${row.client_name}`;
            const existing = map.get(key);
            if (existing) {
                existing.rows.push(row);
                existing.debe += row.saldo || 0;
            } else {
                map.set(key, {
                    clientId: row.client_id,
                    clientName: row.client_name || '—',
                    rows: [row],
                    debe: row.saldo || 0,
                });
            }
        }
        return Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName, 'es'));
    }, [rows]);

    const handleGoBack = () => {
        if (returnTo === '/sales') {
            navigate('/sales');
        } else if (returnTo === '/management') {
            navigate('/management');
        } else {
            navigate('/treasury', { state: { openSection: 'RECEIVABLES' } });
        }
    };

    const handleCobrar = (row: CxcReportRow) => {
        navigate('/treasury', { state: { cobrarCxcId: row.cxc_id, cxcInfo: row } });
    };

    const canCobrar = (row: CxcReportRow) =>
        row.saldo > 0.01 && row.estado !== 'CANCELADA' && row.estado !== 'PAGADA';

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 text-indigo-800">
                        <FileText className="text-indigo-500" size={32} />
                        Reporte de Cuentas por Cobrar
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        Facturas agrupadas por cliente. Filtros combinables con vista de saldo vivo o histórico.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {loading && (
                        <span className="text-xs text-slate-400 font-bold animate-pulse">Cargando...</span>
                    )}
                    <button
                        type="button"
                        onClick={loadReport}
                        disabled={loading}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg font-bold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                    <button
                        type="button"
                        onClick={handleGoBack}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
                    >
                        <ArrowLeft size={18} /> Regresar a Cobranza
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">CxC vivas</p>
                    <p className="text-2xl font-black text-indigo-700 tabular-nums mt-1">{metrics.vivas}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total facturado</p>
                    <p className="text-2xl font-black text-slate-800 tabular-nums mt-1">{formatCurrency(metrics.totalFacturado)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Abonos</p>
                    <p className="text-2xl font-black text-emerald-700 tabular-nums mt-1">{formatCurrency(metrics.totalAbonado)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Saldo por cobrar</p>
                    <p className="text-2xl font-black text-amber-700 tabular-nums mt-1">{formatCurrency(metrics.totalSaldo)}</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cliente</label>
                        <select
                            value={clientId === '' ? '' : String(clientId)}
                            onChange={(e) => setClientId(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="">Todos los clientes</option>
                            {clientOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desde</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hasta</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-6 pt-1 border-t border-slate-100">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includePaid}
                            disabled={onlyCancelled}
                            onChange={(e) => setIncludePaid(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        Incluir pagadas (histórico)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={onlyCancelled}
                            onChange={(e) => {
                                setOnlyCancelled(e.target.checked);
                                if (e.target.checked) setIncludePaid(false);
                            }}
                            className="rounded border-slate-300"
                        />
                        Ver solo canceladas
                    </label>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-left">
                                <th className="p-3 font-bold text-slate-600">Folio</th>
                                <th className="p-3 font-bold text-slate-600">Emisión</th>
                                <th className="p-3 font-bold text-slate-600">Proyecto</th>
                                <th className="p-3 font-bold text-slate-600">OV</th>
                                <th className="p-3 font-bold text-slate-600">Tipo</th>
                                <th className="p-3 font-bold text-slate-600 text-right">Monto</th>
                                <th className="p-3 font-bold text-slate-600 text-right">Abonado</th>
                                <th className="p-3 font-bold text-slate-600 text-right">Saldo</th>
                                <th className="p-3 font-bold text-slate-600 text-right">Antig.</th>
                                <th className="p-3 font-bold text-slate-600 text-center">Cobrar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-slate-400">
                                        Cargando reporte...
                                    </td>
                                </tr>
                            ) : grouped.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-slate-400">
                                        No hay facturas con los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                grouped.map((group) => (
                                    <React.Fragment key={`${group.clientId ?? 'x'}-${group.clientName}`}>
                                        <tr className="bg-indigo-50 border-y border-indigo-100">
                                            <td colSpan={7} className="p-3 font-black text-indigo-900">
                                                {group.clientName}
                                            </td>
                                            <td colSpan={3} className="p-3 text-right font-black text-indigo-800 tabular-nums">
                                                Debe: {formatCurrency(group.debe)}
                                            </td>
                                        </tr>
                                        {group.rows.map((row) => (
                                            <tr key={row.cxc_id} className="border-b border-slate-50 hover:bg-slate-50/60">
                                                <td className="p-3 font-semibold text-slate-800">{row.invoice_folio || '—'}</td>
                                                <td className="p-3 text-slate-600">{formatInvoiceDate(row.invoice_date)}</td>
                                                <td className="p-3 text-slate-700 max-w-[180px] truncate" title={row.project_name || ''}>
                                                    {row.project_name || '—'}
                                                </td>
                                                <td className="p-3 font-mono text-xs text-slate-600">{formatOv(row.sales_order_id)}</td>
                                                <td className="p-3 text-slate-600">{row.payment_type || '—'}</td>
                                                <td className="p-3 text-right tabular-nums">{formatCurrency(row.monto)}</td>
                                                <td className="p-3 text-right tabular-nums text-emerald-700">{formatCurrency(row.abonado)}</td>
                                                <td className="p-3 text-right tabular-nums font-bold text-slate-800">{formatCurrency(row.saldo)}</td>
                                                <td
                                                    className={`p-3 text-right tabular-nums font-bold ${
                                                        (row.antiguedad_dias ?? 0) > 30 ? 'text-amber-600' : 'text-slate-500'
                                                    }`}
                                                >
                                                    {row.antiguedad_dias != null ? `${row.antiguedad_dias}d` : '—'}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {canCobrar(row) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCobrar(row)}
                                                            className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            Cobrar
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                        {rows.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-100 border-t-2 border-slate-300 font-black">
                                    <td colSpan={5} className="p-3 text-slate-700 uppercase text-xs tracking-wide">
                                        Totales ({rows.length} facturas)
                                    </td>
                                    <td className="p-3 text-right tabular-nums">{formatCurrency(metrics.totalFacturado)}</td>
                                    <td className="p-3 text-right tabular-nums text-emerald-800">{formatCurrency(metrics.totalAbonado)}</td>
                                    <td className="p-3 text-right tabular-nums text-amber-800">{formatCurrency(metrics.totalSaldo)}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CxcReportPage;
