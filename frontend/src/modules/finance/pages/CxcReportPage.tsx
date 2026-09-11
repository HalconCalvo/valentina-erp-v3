import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { salesService } from '../../../api/sales-service';
import { SalesOrder } from '../../../types/sales';
import { OrderStatementModal } from '../components/OrderStatementModal';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';

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
    amortized_advance: number;
    saldo: number;
    estado: string;
    antiguedad_dias: number | null;
    payment_date?: string | null;
    treasury_transaction_id?: number | null;
    nc_advance_folio: string | null;
    nc_advance_amount: number;
    nc_retention_folio: string | null;
    nc_retention_amount: number;
    retention_status: string | null;
    retention_due_date: string | null;
}

const RETENTION_BADGE: Record<string, { label: string; cls: string }> = {
    PENDING: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    INVOICED: { label: 'Facturado', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    COLLECTED: { label: 'Cobrado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    WAIVED: { label: 'Liberado', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const PAYMENT_TYPE_FILTER_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'ADVANCE', label: 'Anticipo' },
    { value: 'PROGRESS', label: 'Avance de Obra' },
    { value: 'FULL', label: '100% Contrato' },
];

function RetentionStatusBadge({ status }: { status?: string | null }) {
    const key = String(status ?? '').toUpperCase();
    const meta = RETENTION_BADGE[key];
    if (!meta) return null;
    return (
        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.cls}`}>
            {meta.label}
        </span>
    );
}

function isRetentionOverdue(dueDate?: string | null, status?: string | null): boolean {
    if (!dueDate) return false;
    if (['COLLECTED', 'WAIVED'].includes(String(status ?? '').toUpperCase())) return false;
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
}

const formatMoney = (amount: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        Number.isFinite(amount) ? amount : 0,
    );

const PAYMENT_TYPE_LABELS: Record<string, string> = {
    ADVANCE: 'Anticipo',
    PROGRESS: 'Avance',
    FULL: '100% Contrato',
};

const formatPaymentTypeLabel = (type: string | null | undefined): string => {
    const key = String(type ?? '').toUpperCase();
    return PAYMENT_TYPE_LABELS[key] ?? (type || '—');
};

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

    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canCharge = ['DIRECTOR', 'MANAGER'].includes(userRole);

    const [rows, setRows] = useState<CxcReportRow[]>([]);
    const [loading, setLoading] = useState(false);

    const [clientId, setClientId] = useState<number | ''>('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [includePaid, setIncludePaid] = useState(false);
    const [onlyCancelled, setOnlyCancelled] = useState(false);
    const [paymentTypeFilter, setPaymentTypeFilter] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
    const [isRayosXOpen, setIsRayosXOpen] = useState(false);

    const mapReportRow = (r: Record<string, unknown>): CxcReportRow => ({
        cxc_id: Number(r.cxc_id),
        invoice_folio: (r.invoice_folio as string | null) ?? null,
        invoice_date: (r.invoice_date as string | null) ?? null,
        payment_type: (r.payment_type as string | null) ?? null,
        client_id: r.client_id != null ? Number(r.client_id) : null,
        client_name: String(r.client_name ?? '—'),
        project_name: (r.project_name as string | null) ?? null,
        sales_order_id: Number(r.sales_order_id),
        monto: Number(r.monto) || 0,
        abonado: Number(r.abonado) || 0,
        amortized_advance: Number(r.amortized_advance) || 0,
        saldo: Number(r.saldo) || 0,
        estado: String(r.estado ?? ''),
        antiguedad_dias: r.antiguedad_dias != null ? Number(r.antiguedad_dias) : null,
        payment_date: (r.payment_date as string | null) ?? null,
        treasury_transaction_id: r.treasury_transaction_id != null ? Number(r.treasury_transaction_id) : null,
        nc_advance_folio: (r.nc_advance_folio as string | null) ?? null,
        nc_advance_amount: Number(r.nc_advance_amount) || 0,
        nc_retention_folio: (r.nc_retention_folio as string | null) ?? null,
        nc_retention_amount: Number(r.nc_retention_amount) || 0,
        retention_status: (r.retention_status as string | null) ?? null,
        retention_due_date: (r.retention_due_date as string | null) ?? null,
    });

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
            setRows(Array.isArray(data) ? data.map((r) => mapReportRow(r as Record<string, unknown>)) : []);
        } catch {
            toast.error('No se pudo cargar el reporte de CxC.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [clientId, dateFrom, dateTo, includePaid, onlyCancelled]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const filteredRows = useMemo(() => {
        if (!paymentTypeFilter) return rows;
        return rows.filter((r) => String(r.payment_type ?? '').toUpperCase() === paymentTypeFilter);
    }, [rows, paymentTypeFilter]);

    const clientOptions = useMemo(() => {
        const map = new Map<number, string>();
        for (const row of filteredRows) {
            if (row.client_id != null && row.client_name) {
                map.set(row.client_id, row.client_name);
            }
        }
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [filteredRows]);

    const clientSelectOptions = useMemo(
        () => [
            { value: '', label: 'Todos los clientes' },
            ...clientOptions.map((c) => ({ value: String(c.id), label: c.name })),
        ],
        [clientOptions],
    );

    const metrics = useMemo(() => {
        const vivas = filteredRows.filter((r) => r.saldo > 0.01 && r.estado !== 'CANCELADA').length;
        const totalFacturado = filteredRows.reduce((s, r) => s + (r.monto || 0), 0);
        const totalAbonadoCash = filteredRows.reduce((s, r) => s + (r.abonado || 0), 0);
        const totalAmortized = filteredRows.reduce((s, r) => s + (r.amortized_advance || 0), 0);
        const totalAbonado = totalAbonadoCash + totalAmortized;
        const totalSaldo = filteredRows.reduce((s, r) => s + (r.saldo || 0), 0);
        return { vivas, totalFacturado, totalAbonadoCash, totalAmortized, totalAbonado, totalSaldo };
    }, [filteredRows]);

    const grouped = useMemo(() => {
        const map = new Map<string, { clientId: number | null; clientName: string; rows: CxcReportRow[]; debe: number }>();
        for (const row of filteredRows) {
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
    }, [filteredRows]);

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

    const handleFolioClick = useCallback(async (orderId: number) => {
        try {
            const order = await salesService.getOrderDetail(orderId);
            setSelectedOrder(order);
            setIsRayosXOpen(true);
        } catch {
            toast.error('No se pudo cargar la orden');
        }
    }, []);

    const canCobrar = (row: CxcReportRow) =>
        row.saldo > 0.01 && row.estado !== 'CANCELADA' && row.estado !== 'PAGADA';

    const cxcColumns = useMemo((): VTableColumn<CxcReportRow>[] => [
        {
            key: 'invoice_folio',
            label: 'Folio',
            render: (row) => (
                <button
                    type="button"
                    onClick={() => void handleFolioClick(row.sales_order_id)}
                    className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                >
                    {row.invoice_folio || '—'}
                </button>
            ),
        },
        {
            key: 'invoice_date',
            label: 'Emisión',
            render: (row) => <span className="text-slate-600">{formatInvoiceDate(row.invoice_date)}</span>,
        },
        {
            key: 'project_name',
            label: 'Proyecto',
            render: (row) => (
                <span className="text-slate-700 max-w-[180px] truncate block" title={row.project_name || ''}>
                    {row.project_name || '—'}
                </span>
            ),
        },
        {
            key: 'sales_order_id',
            label: 'OV',
            render: (row) => <span className="font-mono text-xs text-slate-600">{formatOv(row.sales_order_id)}</span>,
        },
        {
            key: 'payment_type',
            label: 'Tipo',
            render: (row) => <span className="text-slate-600">{formatPaymentTypeLabel(row.payment_type)}</span>,
        },
        {
            key: 'nc_advance',
            label: 'NC Ant.',
            render: (row) => {
                if (!row.nc_advance_folio) {
                    return <span className="text-slate-300 text-xs">—</span>;
                }
                return (
                    <div className="flex flex-col gap-0.5 min-w-[88px]">
                        <span className="text-[10px] font-bold text-slate-600 uppercase">{row.nc_advance_folio}</span>
                        <span className="text-xs font-bold text-red-600 tabular-nums">${formatMoney(row.nc_advance_amount)}</span>
                    </div>
                );
            },
        },
        {
            key: 'nc_retention',
            label: 'NC F.G.',
            render: (row) => {
                if (!row.nc_retention_folio) {
                    return <span className="text-slate-300 text-xs">—</span>;
                }
                const overdue = isRetentionOverdue(row.retention_due_date, row.retention_status);
                return (
                    <div className="flex flex-col gap-1 min-w-[120px]">
                        <span className="text-[10px] font-bold text-slate-600 uppercase">{row.nc_retention_folio}</span>
                        <span className="text-xs font-bold text-slate-800 tabular-nums">${formatMoney(row.nc_retention_amount)}</span>
                        <div className="flex flex-wrap items-center gap-1">
                            <RetentionStatusBadge status={row.retention_status} />
                            {overdue && (
                                <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-100 text-red-700 border-red-200">
                                    VENCIDO
                                </span>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'monto',
            label: 'Monto',
            render: (row) => <span className="block text-right tabular-nums">{formatCurrency(row.monto)}</span>,
        },
        {
            key: 'amortized_advance',
            label: 'Ant. aplic.',
            render: (row) => (
                <span className="block text-right tabular-nums text-slate-600">
                    {row.amortized_advance > 0.01 ? formatCurrency(row.amortized_advance) : '—'}
                </span>
            ),
        },
        {
            key: 'abonado',
            label: 'Abonado',
            render: (row) => <span className="block text-right tabular-nums text-emerald-700">{formatCurrency(row.abonado)}</span>,
        },
        {
            key: 'saldo',
            label: 'Saldo',
            render: (row) => <span className="block text-right tabular-nums font-bold text-slate-800">{formatCurrency(row.saldo)}</span>,
        },
        {
            key: 'antiguedad_dias',
            label: 'Antig.',
            render: (row) => (
                <span
                    className={`block text-right tabular-nums font-bold ${
                        (row.antiguedad_dias ?? 0) > 30 ? 'text-amber-600' : 'text-slate-500'
                    }`}
                >
                    {row.antiguedad_dias != null ? `${row.antiguedad_dias}d` : '—'}
                </span>
            ),
        },
        {
            key: 'cobrar',
            label: 'Cobrar',
            render: (row) => (
                <div className="text-center">
                    {canCharge && canCobrar(row) ? (
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
                </div>
            ),
        },
    ], [canCharge, handleFolioClick]);

    return (
        <div className="p-8 w-full pb-24 space-y-6 animate-fadeIn">
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
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Abonos + ant. aplic.</p>
                    <p className="text-2xl font-black text-emerald-700 tabular-nums mt-1">{formatCurrency(metrics.totalAbonado)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Saldo por cobrar</p>
                    <p className="text-2xl font-black text-amber-700 tabular-nums mt-1">{formatCurrency(metrics.totalSaldo)}</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cliente</label>
                        <SearchableSelect
                            items={clientSelectOptions}
                            value={clientId === '' ? '' : String(clientId)}
                            onChange={(v) => setClientId(v === '' ? '' : Number(v))}
                            getLabel={(o) => o.label}
                            getValue={(o) => o.value}
                            placeholder="Todos los clientes"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de factura</label>
                        <SearchableSelect
                            items={PAYMENT_TYPE_FILTER_OPTIONS}
                            value={paymentTypeFilter}
                            onChange={setPaymentTypeFilter}
                            getLabel={(o) => o.label}
                            getValue={(o) => o.value}
                            placeholder="Todos"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desde</label>
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hasta</label>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-6 pt-1 border-t border-slate-100">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <Input
                            type="checkbox"
                            checked={includePaid}
                            disabled={onlyCancelled}
                            onChange={(e) => setIncludePaid(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                        />
                        Incluir pagadas (histórico)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <Input
                            type="checkbox"
                            checked={onlyCancelled}
                            onChange={(e) => {
                                setOnlyCancelled(e.target.checked);
                                if (e.target.checked) setIncludePaid(false);
                            }}
                            className="h-4 w-4 rounded border-slate-300"
                        />
                        Ver solo canceladas
                    </label>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    {loading && filteredRows.length === 0 ? (
                        <VTable
                            columns={cxcColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                            data={[]}
                            isLoading
                            className="border-0 rounded-none shadow-none"
                        />
                    ) : grouped.length === 0 ? (
                        <VTable
                            columns={cxcColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                            data={[]}
                            emptyState={{ title: 'No hay facturas con los filtros seleccionados.' }}
                            className="border-0 rounded-none shadow-none"
                        />
                    ) : (
                        <>
                            <div className="flex w-full text-sm bg-slate-50 border-b border-slate-200 text-left">
                                {cxcColumns.map((col) => (
                                    <div key={col.key} className="flex-1 p-3 font-bold text-slate-600 min-w-0">
                                        {col.label}
                                    </div>
                                ))}
                            </div>
                            {grouped.map((group) => (
                                <div key={`${group.clientId ?? 'x'}-${group.clientName}`}>
                                    <div className="bg-indigo-50 border-y border-indigo-100 px-3 py-3 flex justify-between items-center">
                                        <span className="font-black text-indigo-900">{group.clientName}</span>
                                        <span className="font-black text-indigo-800 tabular-nums">
                                            Debe: {formatCurrency(group.debe)}
                                        </span>
                                    </div>
                                    <VTable
                                        columns={cxcColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                                        data={group.rows as unknown as Record<string, unknown>[]}
                                        className="border-0 rounded-none shadow-none [&_thead]:hidden"
                                    />
                                </div>
                            ))}
                            {filteredRows.length > 0 && (
                                <div className="flex w-full text-sm bg-slate-100 border-t-2 border-slate-300 font-black">
                                    <div className="flex-[7] p-3 text-slate-700 uppercase text-xs tracking-wide min-w-0">
                                        Totales ({filteredRows.length} facturas)
                                    </div>
                                    <div className="flex-1 p-3 text-right tabular-nums min-w-0">{formatCurrency(metrics.totalFacturado)}</div>
                                    <div className="flex-1 p-3 text-right tabular-nums text-slate-700 min-w-0">{formatCurrency(metrics.totalAmortized)}</div>
                                    <div className="flex-1 p-3 text-right tabular-nums text-emerald-800 min-w-0">{formatCurrency(metrics.totalAbonadoCash)}</div>
                                    <div className="flex-1 p-3 text-right tabular-nums text-amber-800 min-w-0">{formatCurrency(metrics.totalSaldo)}</div>
                                    <div className="flex-[2] min-w-0" />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            {selectedOrder && (
                <OrderStatementModal
                    isOpen={isRayosXOpen}
                    onClose={() => {
                        setIsRayosXOpen(false);
                        setSelectedOrder(null);
                    }}
                    order={selectedOrder}
                    onSuccess={loadReport}
                />
            )}
        </div>
    );
};

export default CxcReportPage;
