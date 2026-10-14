import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Unlock, Lock, Search, Factory, FileSearch, Users, CheckCircle2, FilePlus, RefreshCw } from 'lucide-react';
import { salesService } from '../../../api/sales-service';
import { SalesOrder, CustomerPayment, PendingProgressInstance, InvoicingRightsRead, InvoicingRightAdvanceRow } from '../../../types/sales';
import { OrderStatementModal } from '../components/OrderStatementModal';
import { ReceivableChargeModal } from '../components/ReceivableChargeModal';
import { toast } from '@/components/ui/VToast';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { formatDate, formatMoney } from '@/utils/format';
import { Button } from '@/components/ui/Button';

type VendorRightRow =
    | { kind: 'ADVANCE'; order_id: number; folio: string; client: string; project: string; detail: string; amount: number }
    | { kind: 'PROGRESS'; order_id: number | null; folio: string; client: string; project: string; detail: string; amount: number; instance_id: number };

const PendingToInvoicePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo: string = (location.state as any)?.returnTo ?? '/treasury';

    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canView = ['ADMIN', 'ADMINISTRADOR', 'ADMINISTRACIÓN', 'ADMINISTRATION', 'FINANCE', 'FINANZAS', 'DIRECTOR', 'MANAGER'].includes(userRole);
    const hasAbsolutePower = ['DIRECTOR', 'MANAGER'].includes(userRole);

    const [invoicingRights, setInvoicingRights] = useState<InvoicingRightsRead | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedOrderForStatement, setSelectedOrderForStatement] = useState<SalesOrder | null>(null);
    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [selectedOrderForCharge, setSelectedOrderForCharge] = useState<SalesOrder | null>(null);
    const [existingProgressInvoiceForCharge, setExistingProgressInvoiceForCharge] = useState<CustomerPayment | null>(null);

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
        } catch {
            toast.error('No se pudieron cargar los derechos de facturación.');
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
        } catch {
            toast.error('No se pudo abrir el estado de cuenta de la orden.');
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

    const advancesTableData = useMemo(
        () =>
            filteredAdvances.map((row) => ({
                id: row.order_id,
                order_id: row.order_id,
                folio: `OV-${String(row.order_id).padStart(4, '0')}`,
                client: row.client_name,
                project: row.project_name || 'Sin Proyecto',
                amount: row.advance_amount,
            })),
        [filteredAdvances],
    );

    const advancesColumns = useMemo((): VTableColumn<Record<string, unknown>>[] => [
        {
            key: 'folio',
            label: 'Folio',
            render: (row) => <span className="font-bold text-slate-800 text-sm">{String(row.folio)}</span>,
        },
        {
            key: 'client',
            label: 'Cliente',
            render: (row) => <span className="text-xs text-slate-600 font-medium">{String(row.client)}</span>,
        },
        {
            key: 'project',
            label: 'Proyecto',
            render: (row) => <span className="text-sm text-slate-600">{String(row.project)}</span>,
        },
        {
            key: 'amount',
            label: 'Monto anticipo',
            sortable: true,
            render: (row) => (
                <span className="block text-right font-black text-amber-800">
                    {formatMoney(Number(row.amount) || 0)}
                </span>
            ),
        },
    ], []);

    const vendorTableData = useMemo(
        () =>
            [...vendorRows]
                .sort((a, b) => b.amount - a.amount)
                .map((r) => ({
                    id: r.kind === 'ADVANCE' ? `a-${r.order_id}` : `p-${r.instance_id}`,
                    kind: r.kind === 'ADVANCE' ? 'Anticipo' : 'Avance obra',
                    kindSort: r.kind,
                    folio: r.folio,
                    client: r.client,
                    project: r.project,
                    amount: r.amount,
                    order_id: r.order_id,
                })),
        [vendorRows],
    );

    const vendorColumns = useMemo((): VTableColumn<Record<string, unknown>>[] => [
        {
            key: 'kindSort',
            label: 'Tipo',
            sortable: true,
            render: (row) => <span className="text-xs font-bold text-slate-600">{String(row.kind)}</span>,
        },
        {
            key: 'folio',
            label: 'Folio',
            sortable: true,
            render: (row) => <span className="font-bold text-slate-800 text-sm">{String(row.folio)}</span>,
        },
        {
            key: 'client',
            label: 'Cliente',
            sortable: true,
            render: (row) => <span className="text-xs text-slate-600 font-medium">{String(row.client)}</span>,
        },
        {
            key: 'project',
            label: 'Proyecto',
            sortable: true,
            render: (row) => (
                <span className="text-sm text-slate-600 font-medium flex items-center gap-2">
                    <Factory size={14} className="text-slate-400" />
                    {String(row.project)}
                </span>
            ),
        },
        {
            key: 'amount',
            label: 'Monto',
            sortable: true,
            render: (row) => (
                <span className="block text-right font-black text-indigo-700">
                    {formatMoney(Number(row.amount) || 0)}
                </span>
            ),
        },
    ], []);

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
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1
                        className="text-3xl font-black tracking-tight flex items-center gap-3 text-slate-800"
                    >
                        {canView ? (
                            <Unlock className="text-indigo-600" size={32} />
                        ) : (
                            <Users className="text-indigo-600" size={32} />
                        )}
                        {canView ? 'Pendiente de Facturar (Fábrica)' : 'Monitor de Órdenes de Venta'}
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        {canView
                            ? 'Derecho a facturación: anticipos sin CXC de anticipo + piezas cerradas sin folio administrativo.'
                            : 'Mismo criterio que la tarjeta B en Cobranzas (vista resumida).'}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    {isLoading && <span className="text-xs text-slate-400 font-bold animate-pulse">Sincronizando...</span>}
                    <Button variant="outline" onClick={handleGoBack}>
                        <ArrowLeft size={16} /> {returnTo === '/sales' ? 'Regresar a Ventas' : 'Regresar a Cobranza'}
                    </Button>
                </div>
            </div>

            {canView && invoicingRights && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Tarjeta B — Derecho a facturación</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                            Anticipos: {formatMoney(invoicingRights.advance_pending_total)} + Avances obra:{' '}
                            {formatMoney(invoicingRights.progress_work_total)}
                        </p>
                    </div>
                    <p className="font-black text-2xl text-blue-900 tabular-nums">{formatMoney(tarjetaBTotal)}</p>
                </div>
            )}

            {canView && (
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                    <Button
                        variant="ghost"
                        onClick={() => setProgressTab('ANTICIPOS')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                            progressTab === 'ANTICIPOS' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Anticipos Pendientes
                    </Button>
                    <Button
                        variant="ghost"
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
                    </Button>
                </div>
            )}

            {canView && (
                <div className="relative w-full max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={18} className="text-slate-400" />
                    </div>
                    <Input
                        type="text"
                        className="pl-10 pr-3 py-2.5 bg-white border-slate-200 rounded-lg text-sm focus:ring-2 font-medium transition-all shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Buscar cliente, proyecto u OV…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            )}

            {canView && progressTab === 'ANTICIPOS' && (
                <div className="bg-white rounded-xl border border-amber-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-amber-100 bg-amber-50/50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                            <h2 className="font-black text-slate-800 text-lg flex items-center gap-2">
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
                            <span className="font-black text-xl text-amber-900">{formatMoney(invoicingRights?.advance_pending_total ?? 0)}</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <VTable
                            className="border-0 rounded-none shadow-none"
                            columns={advancesColumns}
                            data={advancesTableData}
                            emptyState={{
                                title: 'No hay anticipos en este criterio (o filtro sin coincidencias).',
                            }}
                            actions={(row) => [
                                {
                                    label: 'Rayos X',
                                    icon: <FileSearch size={14} />,
                                    onClick: () => openOrderStatement(Number(row.order_id)),
                                },
                            ]}
                        />
                    </div>
                </div>
            )}

            {progressTab === 'AVANCES' && hasAbsolutePower && (
                <div className="bg-white rounded-xl border border-emerald-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-emerald-100 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h2 className="font-black text-slate-800 text-lg flex items-center gap-2">
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
                                <span className="font-black text-xl text-emerald-900">{formatMoney(invoicingRights?.progress_work_total ?? 0)}</span>
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={loadSalesData} className="hover:bg-emerald-100" aria-label="Actualizar" title="Actualizar">
                                <RefreshCw size={16} className="text-slate-400" />
                            </Button>
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
                                                <span className="ml-3 text-xs font-bold text-emerald-700">Subtotal grupo: {formatMoney(groupSum)}</span>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    setProgressModalOrderId(isOpen ? null : orderId);
                                                    setSelectedInstanceIds(instances.map((i) => i.instance_id));
                                                    setProgressFolio('');
                                                    setProgressAmount('');
                                                }}
                                                className="bg-emerald-600 hover:bg-emerald-700"
                                            >
                                                <FilePlus size={14} />
                                                Registrar Avance
                                            </Button>
                                        </div>

                                        <div className="divide-y divide-slate-50">
                                            {instances.map((inst) => (
                                                <div key={inst.instance_id} className="flex flex-wrap items-center gap-3 px-6 py-2.5">
                                                    <Input
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
                                                    <span className="text-xs font-black text-slate-700 tabular-nums">{formatMoney(Number(inst.line_amount) || 0)}</span>
                                                    <span className="text-xs text-emerald-600 font-bold">🟢🟢</span>
                                                    {inst.signed_received_at && (
                                                        <span className="text-xs text-slate-400">
                                                            {formatDate(inst.signed_received_at)}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {isOpen && (
                                            <div className="px-6 pb-4 pt-2 bg-emerald-50/40 flex flex-wrap items-end gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Folio de Factura *</label>
                                                    <Input
                                                        type="text"
                                                        placeholder="Ej. F-2026-0042"
                                                        value={progressFolio}
                                                        onChange={(e) => setProgressFolio(e.target.value)}
                                                        className="border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 w-44"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Importe (MXN)</label>
                                                    <Input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={progressAmount}
                                                        onChange={(e) => setProgressAmount(e.target.value)}
                                                        className="border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 w-36"
                                                    />
                                                </div>
                                                <Button
                                                    disabled={registeringProgress === orderId || selectedInstanceIds.length === 0 || !progressFolio.trim()}
                                                    title={!progressFolio.trim() ? 'El folio de la factura es obligatorio' : undefined}
                                                    onClick={async () => {
                                                        if (selectedInstanceIds.length === 0) return;
                                                        setRegisteringProgress(orderId);
                                                        try {
                                                            await salesService.registerProgressPayment(orderId, {
                                                                invoice_folio: progressFolio.trim(),
                                                                amount: parseFloat(progressAmount) || 0,
                                                                amortized_advance: 0,
                                                                instance_ids: selectedInstanceIds,
                                                            });
                                                            setProgressModalOrderId(null);
                                                            await loadSalesData();
                                                        } catch (err: any) {
                                                            toast.error(err?.response?.data?.detail || 'No se pudo registrar el avance.');
                                                        } finally {
                                                            setRegisteringProgress(null);
                                                        }
                                                    }}
                                                    className="bg-emerald-600 hover:bg-emerald-700"
                                                >
                                                    <FilePlus size={14} />
                                                    {registeringProgress === orderId ? 'Procesando...' : `Confirmar Avance (${selectedInstanceIds.length})`}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => setProgressModalOrderId(null)}
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {!canView && (
                <div className="bg-white rounded-xl border border-indigo-200 shadow-md overflow-hidden">
                    <div className="p-4 border-b border-indigo-100 bg-indigo-50/50 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div className="space-y-1">
                            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Derecho a facturación (tarjeta B)</h2>
                            <p className="text-xs text-slate-600 max-w-xl">
                                Mismas filas que en administración: anticipos sin CXC ADVANCE y piezas cerradas sin folio.
                            </p>
                        </div>
                        <div className="bg-white border border-indigo-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-3 w-full md:w-auto justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Total:</span>
                            <span className="font-black text-xl text-indigo-900">{formatMoney(tarjetaBTotal)}</span>
                        </div>
                        <div className="relative w-full md:w-96">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={18} className="text-slate-400" />
                            </div>
                            <Input
                                type="text"
                                className="pl-10 pr-3 py-2.5 bg-white border-slate-200 rounded-lg text-sm focus:ring-2 font-medium transition-all shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="Buscar cliente, proyecto o folio..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <VTable
                            className="border-0 rounded-none shadow-none"
                            columns={vendorColumns}
                            data={vendorTableData}
                            emptyState={{
                                title: 'Sin registros en este criterio o sin coincidencias de búsqueda.',
                            }}
                            actions={(row) =>
                                row.order_id != null
                                    ? [
                                          {
                                              label: 'Ver Estatus',
                                              icon: <FileSearch size={14} />,
                                              onClick: () => openOrderStatement(Number(row.order_id)),
                                          },
                                      ]
                                    : []
                            }
                        />
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
                            ? (orderToInvoice, existingProgressInvoice) => {
                                  setSelectedOrderForCharge(orderToInvoice);
                                  setExistingProgressInvoiceForCharge(existingProgressInvoice ?? null);
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
                        setExistingProgressInvoiceForCharge(null);
                    }}
                    order={selectedOrderForCharge}
                    existingProgressInvoice={existingProgressInvoiceForCharge}
                    onSuccess={() => {
                        loadSalesData();
                        setIsChargeModalOpen(false);
                        setExistingProgressInvoiceForCharge(null);
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
