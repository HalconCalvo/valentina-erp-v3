import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Unlock, Lock, Search, Factory, FileSearch, Users, CheckCircle2, FilePlus } from 'lucide-react';
import { salesService } from '../../../api/sales-service';
import { SalesOrder, CustomerPayment, PendingProgressInstance, InvoicingRightsRead, InvoicingRightAdvanceRow } from '../../../types/sales';
import { OrderStatementModal } from '../components/OrderStatementModal';
import { ReceivableChargeModal } from '../components/ReceivableChargeModal';
import ProgressInvoiceForm from '../components/ProgressInvoiceForm';
import { toast } from '@/components/ui/VToast';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { formatDate, formatMoney } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { VEmptyState } from '@/components/ui/VEmptyState';

const SEARCH_INPUT = 'pl-10 text-sm font-medium shadow-sm';
const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <div className="relative w-full md:w-96">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-slate-400" />
        </div>
        <Input type="text" className={SEARCH_INPUT} placeholder={placeholder} value={value}
            onChange={(e) => onChange(e.target.value)} />
    </div>
);

/** White card with the figure in color (guide v2 §3). */
const Kpi = ({ label, value, tone, hint, onClick }: { label: string; value: string; tone: string; hint?: string; onClick?: () => void }) => (
    <div
        className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md hover:border-indigo-200 transition' : ''}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
    >
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-black tabular-nums mt-1 ${tone}`}>{value}</p>
        {hint && <p className="text-xs text-slate-500 mt-2">{hint}</p>}
    </div>
);

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

    // Gabriel 20/10: the screen shows only its cards; Anticipos and Avances are each their own screen
    const stateTab = (location.state as { progressTab?: string } | null)?.progressTab;
    const initialProgressTab = stateTab === 'AVANCES' || stateTab === 'ANTICIPOS' ? stateTab : null;
    const [progressTab, setProgressTab] = useState<'ANTICIPOS' | 'AVANCES' | null>(initialProgressTab);

    useEffect(() => {
        const t = (location.state as { progressTab?: string } | null)?.progressTab;
        if (t === 'AVANCES' || t === 'ANTICIPOS') setProgressTab(t);
    }, [location.state]);
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
            sortable: true,
            render: (row) => <span className="font-mono text-xs text-slate-600">{String(row.folio)}</span>,
        },
        {
            key: 'client',
            label: 'Cliente',
            sortable: true,
            render: (row) => <span className="font-bold text-slate-800">{String(row.client)}</span>,
        },
        {
            key: 'project',
            label: 'Proyecto',
            sortable: true,
            render: (row) => <span className="text-slate-700 max-w-[260px] truncate block" title={String(row.project)}>{String(row.project)}</span>,
        },
        {
            key: 'amount',
            label: 'Monto anticipo (con IVA)',
            sortable: true,
            align: 'right',
            render: (row) => (
                <span className="block text-right font-bold text-amber-700 tabular-nums">
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
            render: (row) => <span className="text-slate-600">{String(row.kind)}</span>,
        },
        {
            key: 'folio',
            label: 'Folio',
            sortable: true,
            render: (row) => <span className="font-mono text-xs text-slate-600">{String(row.folio)}</span>,
        },
        {
            key: 'client',
            label: 'Cliente',
            sortable: true,
            render: (row) => <span className="font-bold text-slate-800">{String(row.client)}</span>,
        },
        {
            key: 'project',
            label: 'Proyecto',
            sortable: true,
            render: (row) => (
                <span className="text-slate-700 flex items-center gap-2">
                    <Factory size={14} className="text-slate-400" />
                    {String(row.project)}
                </span>
            ),
        },
        {
            key: 'amount',
            label: 'Monto (con IVA)',
            sortable: true,
            align: 'right',
            render: (row) => (
                <span className="block text-right font-bold text-slate-800 tabular-nums">
                    {formatMoney(Number(row.amount) || 0)}
                </span>
            ),
        },
    ], []);

    const handleGoBack = () => {
        if (canView && progressTab !== null) {
            setProgressTab(null);
            setSearchTerm('');
            return;
        }
        if (returnTo === '/sales') {
            navigate('/sales');
        } else if (returnTo === '/management') {
            navigate('/management');
        } else {
            navigate('/treasury', { state: { openSection: 'RECEIVABLES' } });
        }
    };

    return (
        <div className="p-8 w-full pb-24 space-y-6 animate-fadeIn">
            <VPageHeader
                icon={!canView ? Users : progressTab === 'ANTICIPOS' ? Lock : progressTab === 'AVANCES' ? CheckCircle2 : Unlock}
                title={!canView ? 'Monitor de órdenes de venta'
                    : progressTab === 'ANTICIPOS' ? 'Anticipos pendientes'
                    : progressTab === 'AVANCES' ? 'Avances por facturar'
                    : 'Pendiente de facturar (fábrica)'}
                subtitle={!canView ? 'Lo mismo que ve Cobranza, en vista resumida.'
                    : progressTab === 'ANTICIPOS' ? 'OVs esperando anticipo que aún no tienen factura de anticipo. Montos con IVA.'
                    : progressTab === 'AVANCES' ? 'Casas firmadas por el cliente sin factura de avance. Montos con IVA.'
                    : 'Anticipos aún sin factura y casas firmadas por el cliente sin factura de avance.'}
                loading={isLoading}
                onRefresh={hasAbsolutePower ? loadSalesData : undefined}
                onBack={handleGoBack}
                backLabel={canView && progressTab !== null ? 'Regresar a Pendiente de facturar'
                    : returnTo === '/sales' ? 'Regresar a Ventas' : returnTo === '/management' ? 'Regresar a Gerencia' : 'Regresar a Cobranza'}
            />

            {canView && invoicingRights && progressTab === null && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Kpi label="Anticipos por facturar (con IVA)" value={formatMoney(invoicingRights.advance_pending_total)}
                        tone="text-amber-700" hint="Ver anticipos pendientes" onClick={() => setProgressTab('ANTICIPOS')} />
                    <Kpi label="Avances de obra por facturar (con IVA)" value={formatMoney(invoicingRights.progress_work_total)}
                        tone="text-emerald-700" hint={`Ver avances por facturar (${pendingProgress.length} casas)`}
                        onClick={() => setProgressTab('AVANCES')} />
                    <Kpi label="Derecho a facturación (con IVA)" value={formatMoney(tarjetaBTotal)} tone="text-indigo-700" />
                </div>
            )}

            {canView && progressTab !== null && (
                <div className="flex justify-end">
                    <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Buscar cliente, proyecto u OV..." />
                </div>
            )}

            {canView && progressTab === 'ANTICIPOS' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div>
                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                <Lock size={18} className="text-indigo-600" />
                                Anticipos pendientes (primer pago)
                            </h2>
                            <p className="text-sm text-slate-500 mt-0.5">
                                OVs esperando anticipo que aún no tienen factura de anticipo. Montos con IVA.
                            </p>
                        </div>
                        <div className="bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total con IVA: </span>
                            <span className="font-black text-slate-900 text-xl tabular-nums">{formatMoney(invoicingRights?.advance_pending_total ?? 0)}</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <VTable
                            className="border-0 rounded-none shadow-none"
                            headerStyle="report"
                            stickyHeader={false}
                            isLoading={isLoading && !invoicingRights}
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
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div>
                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-indigo-600" />
                                Casas firmadas: derecho a facturar avance
                            </h2>
                            <p className="text-sm text-slate-500 mt-0.5">
                                Casas con firma del cliente sin factura de avance. Con IVA (la casa completa; el anticipo se amortiza al facturar).
                            </p>
                        </div>
                        <div className="bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total con IVA: </span>
                            <span className="font-black text-slate-900 text-xl tabular-nums">{formatMoney(invoicingRights?.progress_work_total ?? 0)}</span>
                        </div>
                    </div>

                    {filteredProgress.length === 0 ? (
                        <VEmptyState icon={<CheckCircle2 />} title="No hay casas firmadas pendientes de facturar." />
                    ) : (
                        <>
                            <div className="flex text-sm font-bold text-slate-600 bg-slate-50 border-b border-slate-200">
                                <div className="p-3 pl-11 flex-1">Casa</div>
                                <div className="p-3 w-48 hidden sm:block">Producto</div>
                                <div className="p-3 w-32">Firma</div>
                                <div className="p-3 w-40 text-right">Importe (con IVA)</div>
                            </div>
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
                                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 bg-indigo-50 border-y border-indigo-100">
                                            <div className="min-w-0">
                                                <span className="font-black text-indigo-900">{folio}</span>
                                                <span className="mx-2 text-indigo-200">·</span>
                                                <span className="font-bold text-indigo-900">{instances[0].client_name}</span>
                                                {instances[0].project_name && (
                                                    <span className="ml-2 text-sm text-slate-500">{instances[0].project_name}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                            <span className="font-black text-indigo-800 tabular-nums">Subtotal: {formatMoney(groupSum)}</span>
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    setProgressModalOrderId(isOpen ? null : orderId);
                                                    setSelectedInstanceIds(instances.map((i) => i.instance_id));
                                                }}
                                                className="bg-emerald-600 hover:bg-emerald-700"
                                            >
                                                <FilePlus size={14} />
                                                Registrar avance
                                            </Button>
                                            </div>
                                        </div>

                                        <div className="divide-y divide-slate-100">
                                            {instances.map((inst) => (
                                                <div key={inst.instance_id} className="flex items-center text-sm hover:bg-slate-50">
                                                    <div className="p-3 pl-4 flex-1 flex items-center gap-3 min-w-0">
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
                                                    <span className="font-bold text-slate-700 min-w-0 truncate">{inst.custom_name}</span>
                                                    </div>
                                                    <div className="p-3 w-48 hidden sm:block text-xs text-slate-500 truncate">{inst.item_product_name || '—'}</div>
                                                    <div className="p-3 w-32">
                                                        <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200"
                                                            title={inst.signed_received_at ? `Firmada el ${formatDate(inst.signed_received_at)}` : 'Firmada'}>
                                                            {inst.signed_received_at ? formatDate(inst.signed_received_at) : 'Firmada'}
                                                        </span>
                                                    </div>
                                                    <div className="p-3 w-40 text-right font-bold text-slate-800 tabular-nums">{formatMoney(Number(inst.line_amount) || 0)}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {isOpen && (
                                            <ProgressInvoiceForm
                                                orderId={orderId}
                                                instanceIds={selectedInstanceIds}
                                                onDone={async () => {
                                                    setProgressModalOrderId(null);
                                                    await loadSalesData();
                                                }}
                                                onCancel={() => setProgressModalOrderId(null)}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {!canView && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Derecho a facturación (con IVA): </span>
                            <span className="font-black text-slate-900 text-xl tabular-nums">{formatMoney(tarjetaBTotal)}</span>
                        </div>
                        <SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Buscar cliente, proyecto o folio..." />
                    </div>

                    <div className="overflow-x-auto">
                        <VTable
                            className="border-0 rounded-none shadow-none"
                            headerStyle="report"
                            stickyHeader={false}
                            isLoading={isLoading && !invoicingRights}
                            columns={vendorColumns}
                            data={vendorTableData}
                            emptyState={{
                                title: 'Sin registros en este criterio o sin coincidencias de búsqueda.',
                            }}
                            actions={(row) =>
                                row.order_id != null
                                    ? [
                                          {
                                              label: 'Ver estatus',
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
