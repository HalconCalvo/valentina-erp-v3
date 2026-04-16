import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Unlock, Lock, Search, Factory, FileSearch, Users, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, FilePlus, RefreshCw } from 'lucide-react';
import { salesService } from '../../../api/sales-service';
import { SalesOrder, PendingProgressInstance, InvoicingRightsRead, InvoicingRightAdvanceRow } from '../../../types/sales';
import { OrderStatementModal } from '../components/OrderStatementModal';
import { ReceivableChargeModal } from '../components/ReceivableChargeModal';

type VendorSortField = 'TYPE' | 'FOLIO' | 'CLIENT' | 'PROJECT' | 'AMOUNT';
type SortDirection = 'asc' | 'desc';

type VendorRightRow =
    | { kind: 'ADVANCE'; order_id: number; folio: string; client: string; project: string; detail: string; amount: number }
    | { kind: 'PROGRESS'; order_id: number | null; folio: string; client: string; project: string; detail: string; amount: number; instance_id: number };

const PendingToInvoicePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo: string = (location.state as any)?.returnTo ?? '/treasury';

    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const hasAbsolutePower = ['ADMIN', 'ADMINISTRADOR', 'ADMINISTRACIÓN', 'ADMINISTRATION', 'FINANCE', 'FINANZAS', 'DIRECTOR', 'GERENCIA'].includes(userRole);

    const [invoicingRights, setInvoicingRights] = useState<InvoicingRightsRead | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [vendorSortField, setVendorSortField] = useState<VendorSortField>('AMOUNT');
    const [vendorSortDirection, setVendorSortDirection] = useState<SortDirection>('desc');

    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedOrderForStatement, setSelectedOrderForStatement] = useState<SalesOrder | null>(null);
    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [selectedOrderForCharge, setSelectedOrderForCharge] = useState<SalesOrder | null>(null);

    const initialProgressTab =
        (location.state as { progressTab?: string } | null)?.progressTab === 'AVANCES' ? 'AVANCES' : 'ANTICIPOS';
    const [progressTab, setProgressTab] = useState<'ANTICIPOS' | 'AVANCES'>(initialProgressTab);

    useEffect(() => {
        const t = (location.state as { progressTab?: string } | null)?.progressTab;
        if (t === 'AVANCES' || t === 'ANTICIPOS') setProgressTab(t);
    }, [location.state]);
    const [registeringProgress, setRegisteringProgress] = useState<number | null>(null);
    const [progressFolio, setProgressFolio] = useState('');
    const [progressAmount, setProgressAmount] = useState('');
    const [progressModalOrderId, setProgressModalOrderId] = useState<number | null>(null);
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<number[]>([]);

    const loadSalesData = useCallback(async () => {
        try {
            setIsLoading(true);
            const rights = await salesService.getInvoicingRights();
            setInvoicingRights(rights);
        } catch (error) {
            console.error('Error cargando órdenes / derecho a facturación:', error);
            setInvoicingRights(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSalesData();
        const intervalId = setInterval(loadSalesData, 15000);
        return () => clearInterval(intervalId);
    }, [loadSalesData]);

    const pendingProgress: PendingProgressInstance[] = useMemo(
        () => invoicingRights?.progress_instances ?? [],
        [invoicingRights]
    );

    const advancesList: InvoicingRightAdvanceRow[] = useMemo(
        () => invoicingRights?.advances ?? [],
        [invoicingRights]
    );

    const formatCurrency = (amount: number) =>
        (Number.isFinite(amount) ? amount : 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const tarjetaBTotal = invoicingRights?.total_pending_invoice ?? 0;

    const matchesSearch = useCallback(
        (client: string, project: string, folio: string) => {
            const q = searchTerm.toLowerCase().trim();
            if (!q) return true;
            return (
                client.toLowerCase().includes(q) ||
                project.toLowerCase().includes(q) ||
                folio.toLowerCase().includes(q)
            );
        },
        [searchTerm]
    );

    const filteredAdvances = useMemo(() => {
        return advancesList.filter((row) =>
            matchesSearch(row.client_name, row.project_name || 'Sin Proyecto', `ov-${row.order_id}`)
        );
    }, [advancesList, matchesSearch]);

    const filteredProgress = useMemo(() => {
        return pendingProgress.filter((row) =>
            matchesSearch(row.client_name, row.project_name || 'Sin Proyecto', row.order_folio.toLowerCase())
        );
    }, [pendingProgress, matchesSearch]);

    const openOrderStatement = useCallback(async (orderId: number) => {
        try {
            const det = await salesService.getOrderDetail(orderId);
            setSelectedOrderForStatement(det);
            setIsStatementModalOpen(true);
        } catch (e) {
            console.error(e);
        }
    }, []);

    const vendorRows = useMemo((): VendorRightRow[] => {
        if (!invoicingRights) return [];
        const adv: VendorRightRow[] = invoicingRights.advances.map((a) => ({
            kind: 'ADVANCE' as const,
            order_id: a.order_id,
            folio: `OV-${String(a.order_id).padStart(4, '0')}`,
            client: a.client_name,
            project: a.project_name || 'Sin Proyecto',
            detail: `Anticipo ${a.advance_percent}%`,
            amount: a.advance_amount,
        }));
        const pr: VendorRightRow[] = invoicingRights.progress_instances.map((p) => ({
            kind: 'PROGRESS' as const,
            order_id: p.order_id,
            folio: p.order_folio,
            client: p.client_name,
            project: p.project_name || 'Sin Proyecto',
            detail: p.custom_name + (p.item_product_name ? ` · ${p.item_product_name}` : ''),
            amount: Number(p.line_amount) || 0,
            instance_id: p.instance_id,
        }));
        const merged = [...adv, ...pr];
        const q = searchTerm.toLowerCase().trim();
        if (!q) return merged;
        return merged.filter(
            (r) =>
                r.client.toLowerCase().includes(q) ||
                r.project.toLowerCase().includes(q) ||
                r.folio.toLowerCase().includes(q) ||
                r.detail.toLowerCase().includes(q)
        );
    }, [invoicingRights, searchTerm]);

    const handleVendorSort = (field: VendorSortField) => {
        if (vendorSortField === field) {
            setVendorSortDirection(vendorSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setVendorSortField(field);
            setVendorSortDirection(field === 'AMOUNT' ? 'desc' : 'asc');
        }
    };

    const sortedVendorRows = useMemo(() => {
        const copy = [...vendorRows];
        copy.sort((a, b) => {
            let c = 0;
            switch (vendorSortField) {
                case 'TYPE':
                    c = a.kind.localeCompare(b.kind);
                    break;
                case 'FOLIO':
                    c = a.folio.localeCompare(b.folio);
                    break;
                case 'CLIENT':
                    c = a.client.localeCompare(b.client);
                    break;
                case 'PROJECT':
                    c = a.project.localeCompare(b.project);
                    break;
                case 'AMOUNT':
                    c = a.amount - b.amount;
                    break;
            }
            return vendorSortDirection === 'asc' ? c : -c;
        });
        return copy;
    }, [vendorRows, vendorSortField, vendorSortDirection]);

    const VendorSortableHeader = ({ field, label, align = 'left' }: { field: VendorSortField; label: string; align?: 'left' | 'right' }) => {
        const isActive = vendorSortField === field;
        return (
            <th
                className={`p-4 text-${align} cursor-pointer hover:bg-slate-200 transition-colors select-none`}
                onClick={() => handleVendorSort(field)}
            >
                <div className={`flex items-center gap-1 inline-flex ${align === 'right' ? 'flex-row-reverse' : ''}`}>
                    <span className={isActive ? 'text-indigo-800' : 'text-slate-600 font-bold'}>{label}</span>
                    {isActive ? (
                        vendorSortDirection === 'asc' ? (
                            <ArrowUp size={16} className="text-indigo-600" />
                        ) : (
                            <ArrowDown size={16} className="text-indigo-600" />
                        )
                    ) : (
                        <ArrowUpDown size={16} className="text-slate-400 hover:text-slate-600" />
                    )}
                </div>
            </th>
        );
    };

    const handleGoBack = () => {
        if (returnTo === '/sales') {
            navigate('/sales');
        } else if (returnTo === '/management') {
            navigate('/management');
        } else {
            navigate('/treasury', { state: { openSection: 'RECEIVABLES' } });
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1
                        className={`text-3xl font-black tracking-tight flex items-center gap-3 ${
                            hasAbsolutePower ? 'text-blue-800' : 'text-indigo-800'
                        }`}
                    >
                        {hasAbsolutePower ? (
                            <Unlock className="text-blue-500" size={32} />
                        ) : (
                            <Users className="text-indigo-500" size={32} />
                        )}
                        {hasAbsolutePower ? 'Pendiente de Facturar (Fábrica)' : 'Monitor de Órdenes de Venta'}
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        {hasAbsolutePower
                            ? 'Derecho a facturación: anticipos sin CXC de anticipo + piezas cerradas sin folio administrativo.'
                            : 'Mismo criterio que la tarjeta B en Cobranzas (vista resumida).'}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    {isLoading && <span className="text-xs text-slate-400 font-bold animate-pulse">Sincronizando...</span>}
                    <button
                        onClick={handleGoBack}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
                    >
                        <ArrowLeft size={18} /> {returnTo === '/sales' ? 'Regresar a Ventas' : 'Regresar a Cobranza'}
                    </button>
                </div>
            </div>

            {hasAbsolutePower && invoicingRights && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Tarjeta B — Derecho a facturación</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                            Anticipos: {formatCurrency(invoicingRights.advance_pending_total)} + Avances obra:{' '}
                            {formatCurrency(invoicingRights.progress_work_total)}
                        </p>
                    </div>
                    <p className="font-black text-2xl text-blue-900 tabular-nums">{formatCurrency(tarjetaBTotal)}</p>
                </div>
            )}

            {hasAbsolutePower && (
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                    <button
                        onClick={() => setProgressTab('ANTICIPOS')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                            progressTab === 'ANTICIPOS' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Anticipos Pendientes
                    </button>
                    <button
                        onClick={() => setProgressTab('AVANCES')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                            progressTab === 'AVANCES' ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <CheckCircle2 size={15} />
                        Avances por Facturar
                        {pendingProgress.length > 0 && (
                            <span className="bg-emerald-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{pendingProgress.length}</span>
                        )}
                    </button>
                </div>
            )}

            {hasAbsolutePower && (
                <div className="relative w-full max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={18} className="text-slate-400" />
                    </div>
                    <input
                        type="text"
                        className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 font-medium transition-all shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Buscar cliente, proyecto u OV…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            )}

            {hasAbsolutePower && progressTab === 'ANTICIPOS' && (
                <div className="bg-white rounded-xl border border-amber-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-amber-100 bg-amber-50/50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                            <h2 className="font-black text-amber-900 text-lg flex items-center gap-2">
                                <Lock size={20} className="text-amber-600" />
                                Anticipos pendientes (primer pago)
                            </h2>
                            <p className="text-xs text-slate-600 mt-0.5">
                                <span className="font-bold">WAITING_ADVANCE</span> y sin registro{' '}
                                <span className="font-bold">ADVANCE</span> en <span className="font-bold">customer_payments</span>.
                            </p>
                        </div>
                        <div className="bg-white border border-amber-200 rounded-lg px-4 py-2 shadow-sm">
                            <span className="text-xs font-bold uppercase text-amber-700">Total bucket: </span>
                            <span className="font-black text-xl text-amber-900">{formatCurrency(invoicingRights?.advance_pending_total ?? 0)}</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500 font-bold">
                                    <th className="p-3">Folio</th>
                                    <th className="p-3">Cliente</th>
                                    <th className="p-3">Proyecto</th>
                                    <th className="p-3 text-right">Monto anticipo</th>
                                    <th className="p-3 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredAdvances.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                                            No hay anticipos en este criterio (o filtro sin coincidencias).
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAdvances.map((row) => (
                                        <tr key={row.order_id} className="hover:bg-slate-50">
                                            <td className="p-3 font-bold text-slate-800 text-sm">OV-{String(row.order_id).padStart(4, '0')}</td>
                                            <td className="p-3 text-xs text-slate-600 font-medium">{row.client_name}</td>
                                            <td className="p-3 text-sm text-slate-600">{row.project_name || 'Sin Proyecto'}</td>
                                            <td className="p-3 text-right font-black text-amber-800">{formatCurrency(row.advance_amount)}</td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => openOrderStatement(row.order_id)}
                                                    className="px-4 py-2 rounded-lg text-xs font-bold text-amber-700 hover:text-white bg-amber-50 hover:bg-amber-600 border border-amber-200 shadow-sm inline-flex items-center gap-2"
                                                >
                                                    <FileSearch size={14} />
                                                    Rayos X
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {progressTab === 'AVANCES' && hasAbsolutePower && (
                <div className="bg-white rounded-xl border border-emerald-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-emerald-100 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h2 className="font-black text-emerald-800 text-lg flex items-center gap-2">
                                <CheckCircle2 size={20} className="text-emerald-600" />
                                Instancias 🟢🟢 Cerradas — derecho a facturar avance
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                <span className="font-bold">CLOSED</span>, <span className="font-bold">administration_invoice_folio</span> vacío, sin{' '}
                                <span className="font-bold">customer_payment_id</span>.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-white border border-emerald-200 rounded-lg px-4 py-2 shadow-sm">
                                <span className="text-xs font-bold uppercase text-emerald-700">Total bucket: </span>
                                <span className="font-black text-xl text-emerald-900">{formatCurrency(invoicingRights?.progress_work_total ?? 0)}</span>
                            </div>
                            <button type="button" onClick={loadSalesData} className="p-2 hover:bg-emerald-100 rounded-lg transition-all" aria-label="Actualizar">
                                <RefreshCw size={16} className="text-slate-400" />
                            </button>
                        </div>
                    </div>

                    {filteredProgress.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 italic">No hay piezas en este criterio.</div>
                    ) : (
                        <>
                            {Object.entries(
                                filteredProgress.reduce<Record<string, PendingProgressInstance[]>>((acc, inst) => {
                                    const key = inst.order_folio;
                                    if (!acc[key]) acc[key] = [];
                                    acc[key].push(inst);
                                    return acc;
                                }, {})
                            ).map(([folio, instances]) => {
                                const orderId = instances[0].order_id!;
                                const isOpen = progressModalOrderId === orderId;
                                const groupSum = instances.reduce((s, i) => s + (Number(i.line_amount) || 0), 0);
                                return (
                                    <div key={folio} className="border-b border-slate-100 last:border-0">
                                        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-slate-50/60">
                                            <div>
                                                <span className="font-black text-slate-800 text-sm">{folio}</span>
                                                <span className="mx-2 text-slate-300">·</span>
                                                <span className="text-slate-600 text-sm">{instances[0].client_name}</span>
                                                {instances[0].project_name && (
                                                    <span className="ml-2 text-xs text-slate-400 italic">{instances[0].project_name}</span>
                                                )}
                                                <span className="ml-3 text-xs font-bold text-emerald-700">Subtotal grupo: {formatCurrency(groupSum)}</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setProgressModalOrderId(isOpen ? null : orderId);
                                                    setSelectedInstanceIds(instances.map((i) => i.instance_id));
                                                    setProgressFolio('');
                                                    setProgressAmount('');
                                                }}
                                                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                                            >
                                                <FilePlus size={14} />
                                                Registrar Avance
                                            </button>
                                        </div>

                                        <div className="divide-y divide-slate-50">
                                            {instances.map((inst) => (
                                                <div key={inst.instance_id} className="flex flex-wrap items-center gap-3 px-6 py-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isOpen ? selectedInstanceIds.includes(inst.instance_id) : true}
                                                        onChange={(e) => {
                                                            if (!isOpen) return;
                                                            setSelectedInstanceIds((prev) =>
                                                                e.target.checked
                                                                    ? [...prev, inst.instance_id]
                                                                    : prev.filter((id) => id !== inst.instance_id)
                                                            );
                                                        }}
                                                        className="accent-emerald-600 w-4 h-4"
                                                        disabled={!isOpen}
                                                    />
                                                    <span className="text-sm font-bold text-slate-700 min-w-0 flex-1 truncate">{inst.custom_name}</span>
                                                    {inst.item_product_name && (
                                                        <span className="text-xs text-slate-400 hidden sm:block">{inst.item_product_name}</span>
                                                    )}
                                                    <span className="text-xs font-black text-slate-700 tabular-nums">{formatCurrency(Number(inst.line_amount) || 0)}</span>
                                                    <span className="text-xs text-emerald-600 font-bold">🟢🟢</span>
                                                    {inst.signed_received_at && (
                                                        <span className="text-xs text-slate-400">
                                                            {new Date(inst.signed_received_at).toLocaleDateString('es-MX', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric',
                                                            })}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {isOpen && (
                                            <div className="px-6 pb-4 pt-2 bg-emerald-50/40 flex flex-wrap items-end gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Folio de Factura</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Ej. F-2026-0042"
                                                        value={progressFolio}
                                                        onChange={(e) => setProgressFolio(e.target.value)}
                                                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 w-44"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Importe (MXN)</label>
                                                    <input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={progressAmount}
                                                        onChange={(e) => setProgressAmount(e.target.value)}
                                                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 w-36"
                                                    />
                                                </div>
                                                <button
                                                    disabled={registeringProgress === orderId || selectedInstanceIds.length === 0}
                                                    onClick={async () => {
                                                        if (selectedInstanceIds.length === 0) return;
                                                        setRegisteringProgress(orderId);
                                                        try {
                                                            await salesService.registerProgressPayment(orderId, {
                                                                invoice_folio: progressFolio || null,
                                                                amount: parseFloat(progressAmount) || 0,
                                                                amortized_advance: 0,
                                                                instance_ids: selectedInstanceIds,
                                                            });
                                                            setProgressModalOrderId(null);
                                                            await loadSalesData();
                                                        } catch (err) {
                                                            console.error('Error registrando avance:', err);
                                                        } finally {
                                                            setRegisteringProgress(null);
                                                        }
                                                    }}
                                                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg transition-all shadow-sm text-sm"
                                                >
                                                    {registeringProgress === orderId ? (
                                                        <RefreshCw size={14} className="animate-spin" />
                                                    ) : (
                                                        <FilePlus size={14} />
                                                    )}
                                                    Confirmar Avance ({selectedInstanceIds.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setProgressModalOrderId(null)}
                                                    className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 font-medium"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {!hasAbsolutePower && (
                <div className="bg-white rounded-xl border border-indigo-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-indigo-100 bg-indigo-50/50 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div className="space-y-1">
                            <h2 className="text-sm font-black uppercase tracking-wide text-indigo-800">Derecho a facturación (tarjeta B)</h2>
                            <p className="text-xs text-slate-600 max-w-xl">
                                Mismas filas que en administración: anticipos sin CXC ADVANCE y piezas cerradas sin folio.
                            </p>
                        </div>
                        <div className="bg-white border border-indigo-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-3 w-full md:w-auto justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Total:</span>
                            <span className="font-black text-xl text-indigo-900">{formatCurrency(tarjetaBTotal)}</span>
                        </div>
                        <div className="relative w-full md:w-96">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={18} className="text-slate-400" />
                            </div>
                            <input
                                type="text"
                                className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 font-medium transition-all shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="Buscar cliente, proyecto o folio..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                    <VendorSortableHeader field="TYPE" label="Tipo" />
                                    <VendorSortableHeader field="FOLIO" label="Folio" />
                                    <VendorSortableHeader field="CLIENT" label="Cliente" />
                                    <VendorSortableHeader field="PROJECT" label="Proyecto" />
                                    <VendorSortableHeader field="AMOUNT" label="Monto" align="right" />
                                    <th className="p-4 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedVendorRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-12 text-center text-slate-500 italic text-lg">
                                            Sin registros en este criterio o sin coincidencias de búsqueda.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedVendorRows.map((r) => (
                                        <tr key={r.kind === 'ADVANCE' ? `a-${r.order_id}` : `p-${r.instance_id}`} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 text-xs font-bold text-slate-600">
                                                {r.kind === 'ADVANCE' ? 'Anticipo' : 'Avance obra'}
                                            </td>
                                            <td className="p-4 font-bold text-slate-800 text-sm">{r.folio}</td>
                                            <td className="p-4 text-xs text-slate-600 font-medium">{r.client}</td>
                                            <td className="p-4 text-sm text-slate-600 font-medium flex items-center gap-2">
                                                <Factory size={14} className="text-slate-400" />
                                                {r.project}
                                            </td>
                                            <td className="p-4 text-right font-black text-indigo-700">{formatCurrency(r.amount)}</td>
                                            <td className="p-4 text-center">
                                                {r.order_id != null ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openOrderStatement(r.order_id)}
                                                        className="px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 mx-auto text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200"
                                                    >
                                                        <FileSearch size={14} />
                                                        Ver Estatus
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {selectedOrderForStatement && (
                <OrderStatementModal
                    isOpen={isStatementModalOpen}
                    onClose={() => {
                        setIsStatementModalOpen(false);
                        setSelectedOrderForStatement(null);
                    }}
                    order={selectedOrderForStatement}
                    onSuccess={loadSalesData}
                    readOnly={!hasAbsolutePower}
                    onOpenInvoiceModal={
                        hasAbsolutePower
                            ? (orderToInvoice) => {
                                  setSelectedOrderForCharge(orderToInvoice);
                                  setIsChargeModalOpen(true);
                              }
                            : undefined
                    }
                />
            )}
            {selectedOrderForCharge && hasAbsolutePower && (
                <ReceivableChargeModal
                    isOpen={isChargeModalOpen}
                    onClose={() => {
                        setIsChargeModalOpen(false);
                        setSelectedOrderForCharge(null);
                    }}
                    order={selectedOrderForCharge}
                    onSuccess={() => {
                        loadSalesData();
                        setIsChargeModalOpen(false);
                        if (selectedOrderForStatement && selectedOrderForStatement.id === selectedOrderForCharge.id) {
                            salesService.getOrders().then((olist) => {
                                const updated = Array.isArray(olist) ? olist.find((o) => o.id === selectedOrderForStatement.id) : null;
                                if (updated) setSelectedOrderForStatement(updated);
                            });
                        }
                    }}
                />
            )}
        </div>
    );
};

export default PendingToInvoicePage;
