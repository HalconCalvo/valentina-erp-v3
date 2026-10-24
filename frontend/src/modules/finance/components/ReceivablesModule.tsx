import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, FileText, Lock, Unlock, Layers, Search, Wallet } from 'lucide-react';
import { VHubCard } from '@/components/ui/VHubCard';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { SalesOrder, CustomerPayment } from '../../../types/sales';
import { normalizeOrderStatus, STATUS_WAITING_ADVANCE } from '../utils/pendingInvoiceBuckets';
import { ReceivableChargeModal } from './ReceivableChargeModal';
import { OrderStatementModal } from './OrderStatementModal';
import { toast } from '@/components/ui/VToast';
import { useSalesOrders, useInvoicingRights } from '../../../hooks/useReceivables';
import { formatDate, formatMoney } from '@/utils/format';
import { invoiceOpenBalance } from '@/utils/invoiceBalance';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { matchesSearch } from '@/utils/search';

// ---> 1. AGREGAMOS EL FILTRO 'ALL' <---
type ReceivableFilter = 'ALL' | 'ADVANCES' | null;

/** OV y Facturación: open orders apart from closed ones (paid, zero balance) and cancelled ones; nothing is deleted. */
type OrderGroup = 'OPEN' | 'CLOSED' | 'CANCELLED';
const CLOSED_STATUSES = ['FINISHED'];
const CANCELLED_STATUSES = ['CANCELLED', 'CANCELLED_OV'];
const ORDER_GROUPS: { key: OrderGroup; label: string }[] = [
    { key: 'OPEN', label: 'Vigentes' },
    { key: 'CLOSED', label: 'Cerradas (pagadas, saldo cero)' },
    { key: 'CANCELLED', label: 'Canceladas' },
];

// ---> NUEVO: Propiedad defaultFilter para el "Teletransporte" <---
interface ReceivablesModuleProps {
    onSubSectionChange?: (isActive: boolean) => void;
    defaultFilter?: ReceivableFilter;
    onBackOverride?: () => void; // <--- NUEVO: El boleto de regreso
    /** Ruta para state.returnTo al abrir Pendiente de Facturar / Antigüedad desde este módulo. */
    financeReturnPath?: string;
    /** Incrementar para forzar cierre de sub-vista (vuelta al hub de 4 tarjetas). */
    resetHubSignal?: number;
    /** "Regresar a …" of the list (guide v2 §2); by default the cards or, with onBackOverride, Tareas. */
    backLabel?: string;
}

export const ReceivablesModule: React.FC<ReceivablesModuleProps> = ({
    onSubSectionChange,
    defaultFilter = null,
    onBackOverride,
    financeReturnPath = '/treasury',
    resetHubSignal = 0,
    backLabel,
}) => {
    const navigate = useNavigate();
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canViewRayosX = ['ADMIN', 'DIRECTOR', 'MANAGER'].includes(userRole);
    const hasAbsolutePower = ['DIRECTOR', 'MANAGER'].includes(userRole);

    const { data: orders = [], isError: ordersError, refetch: refetchOrders } = useSalesOrders();
    const { data: invoicingRights = null, refetch: refetchInvoicingRights } = useInvoicingRights();

    const refreshReceivables = useCallback(async () => {
        await Promise.all([refetchOrders(), refetchInvoicingRights()]);
    }, [refetchOrders, refetchInvoicingRights]);

    useEffect(() => {
        if (ordersError) toast.error('No se pudieron cargar las cuentas por cobrar.');
    }, [ordersError]);

    // Inicializamos el estado con la llave de teletransporte si nos la mandaron
    const [activeFilter, setActiveFilter] = useState<ReceivableFilter>(defaultFilter);
    
    const [orderGroup, setOrderGroup] = useState<OrderGroup>('OPEN');
    const [searchTerm, setSearchTerm] = useState('');

    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [selectedOrderForCharge, setSelectedOrderForCharge] = useState<SalesOrder | null>(null);
    const [existingProgressInvoiceForCharge, setExistingProgressInvoiceForCharge] = useState<CustomerPayment | null>(null);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedOrderForStatement, setSelectedOrderForStatement] = useState<SalesOrder | null>(null);

    useEffect(() => {
        if (onSubSectionChange) {
            onSubSectionChange(activeFilter !== null);
        }
    }, [activeFilter, onSubSectionChange]);

    const lastHubReset = useRef(0);
    useEffect(() => {
        if (resetHubSignal > lastHubReset.current) {
            lastHubReset.current = resetHubSignal;
            setActiveFilter(null);
        }
    }, [resetHubSignal]);

    // ---> EL PUENTE DE COMUNICACIÓN (Sincroniza Rayos X en tiempo real) <---
    // No pisar la OV seleccionada mientras Rayos X está abierto: el detalle fresco
    // vive en localOrder/onOrderPatch; el listado puede ir un tick detrás tras un abono.
    useEffect(() => {
        if (selectedOrderForStatement && !isStatementModalOpen) {
            const freshOrder = orders.find(o => o.id === selectedOrderForStatement.id);
            if (freshOrder) setSelectedOrderForStatement(freshOrder);
        }
    }, [orders, isStatementModalOpen]);


    const getClientName = useCallback((order: SalesOrder) => {
        const o = order as any;
        return o.client_name || o.client?.full_name || o.client?.name || o.customer?.name || 'Cliente por Defecto';
    }, []);

    const ACTIVE_STATUSES = ['WAITING_ADVANCE', 'SOLD', 'IN_PRODUCTION', 'FINISHED', 'COMPLETED'];

    // --- Anticipos por facturar (solo derecho a primer pago: alineado con /sales/invoicing-rights) ---
    const advances = orders.filter((o) => normalizeOrderStatus(o) === STATUS_WAITING_ADVANCE);
    const advancesVal = advances.reduce(
        (sum, o) => sum + (Number(o.total_price) || 0) * ((Number(o.advance_percent) || 60) / 100),
        0
    );
    const advancesForFirstInvoice = useMemo(() => {
        if (!invoicingRights?.advances?.length) return advances;
        const ids = new Set(invoicingRights.advances.map((a) => a.order_id));
        return advances.filter((o) => o.id != null && ids.has(o.id));
    }, [advances, invoicingRights]);

    const advanceCardCount = invoicingRights?.advances.length ?? advancesForFirstInvoice.length;
    const advanceCardVal = invoicingRights?.advance_pending_total ?? advancesVal;

    const cardBCount = invoicingRights?.progress_instances.length ?? 0;
    const installmentsVal = invoicingRights?.progress_work_total ?? 0;

    const pendingInvoices = orders.flatMap(
        (order) => order.payments?.filter((cxc) => String((cxc as { status?: string }).status).toUpperCase() === 'PENDING'
            && invoiceOpenBalance(cxc) > 0) || []
    );
    // H47: open balance (amortized advance and payments out), as in CxC
    const agingVal = pendingInvoices.reduce((sum, inv) => sum + invoiceOpenBalance(inv), 0);

    const ordersByGroup = useMemo(() => {
        const groups: Record<OrderGroup, SalesOrder[]> = { OPEN: [], CLOSED: [], CANCELLED: [] };
        for (const o of orders) {
            if (CANCELLED_STATUSES.includes(o.status)) groups.CANCELLED.push(o);
            else if (CLOSED_STATUSES.includes(o.status)) groups.CLOSED.push(o);
            else if (ACTIVE_STATUSES.includes(o.status)) groups.OPEN.push(o);
        }
        return groups;
    }, [orders]);
    const activeOrders = ordersByGroup[orderGroup];

    // Gabriel 23/10: on-screen search in OV y facturación (OV, client, project or invoice folio); it never changes data
    const searchedOrders = useMemo(() => activeOrders.filter((o) => matchesSearch(
        searchTerm, `OV-${String(o.id ?? '').padStart(4, '0')}`, getClientName(o), o.project_name,
        ...(o.payments ?? []).map((p) => p.invoice_folio),
    )), [activeOrders, searchTerm, getClientName]);

    const listData = useMemo(
        () => (activeFilter === 'ADVANCES' ? advancesForFirstInvoice : activeFilter === 'ALL' ? searchedOrders : []),
        [activeFilter, advancesForFirstInvoice, searchedOrders],
    );

    const orderDate = (o: SalesOrder) => new Date(o.created_at || o.valid_until || 0).getTime() || (o.id || 0);
    const openStatement = (order: SalesOrder) => { setSelectedOrderForStatement(order); setIsStatementModalOpen(true); };

    // Traductor visual de Estatus
    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'WAITING_ADVANCE': return <span className="text-[10px] text-amber-700 font-bold border px-1.5 py-0.5 rounded bg-amber-50 border-amber-200">Esperando anticipo</span>;
            case 'IN_PRODUCTION': return <span className="text-[10px] text-blue-700 font-bold border px-1.5 py-0.5 rounded bg-blue-50 border-blue-200">En producción</span>;
            case 'SOLD': return <span className="text-[10px] text-emerald-700 font-bold border px-1.5 py-0.5 rounded bg-emerald-50 border-emerald-200">Vendida / en proceso</span>;
            case 'FINISHED': return <span className="text-[10px] text-slate-700 font-bold border px-1.5 py-0.5 rounded bg-slate-50 border-slate-200">Pagada (saldo cero)</span>;
            case 'CANCELLED':
            case 'CANCELLED_OV': return <span className="text-[10px] text-red-700 font-bold border px-1.5 py-0.5 rounded bg-red-50 border-red-200">Cancelada</span>;
            default: return <span className="text-[10px] text-slate-700 font-bold border px-1.5 py-0.5 rounded bg-slate-50 border-slate-200">{status}</span>;
        }
    };

    const orderColumns: VTableColumn<SalesOrder>[] = [
        {
            key: 'folio',
            label: 'Folio OV',
            sortable: true,
            sortValue: (o) => o.id || 0,
            render: (o) => {
                const folio = `OV-${String(o.id ?? '').padStart(4, '0')}`;
                return canViewRayosX ? (
                    <Button variant="link" className="h-auto p-0 font-semibold text-indigo-600 hover:text-indigo-800"
                        title="Ver Rayos X" onClick={() => openStatement(o)}>{folio}</Button>
                ) : <span className="font-mono text-xs text-slate-600">{folio}</span>;
            },
        },
        { key: 'client', label: 'Cliente', sortable: true, sortValue: (o) => getClientName(o),
            render: (o) => <span className="text-slate-700">{getClientName(o)}</span> },
        { key: 'project', label: 'Proyecto', sortable: true, sortValue: (o) => o.project_name || '',
            render: (o) => o.project_name
                ? <span className="text-slate-700 max-w-[220px] truncate block" title={o.project_name}>{o.project_name}</span>
                : <span className="text-slate-300 text-xs">—</span> },
        {
            key: 'status',
            label: 'Estado',
            render: (o) => (
                <div className="flex flex-wrap gap-1">
                    {getStatusBadge(o.status)}
                    {o.is_excel_managed && (
                        <span title="Viene en el Excel de migración (sus diferencias se revisan al subirlo)" className="text-[10px] text-teal-700 font-bold border px-1.5 py-0.5 rounded bg-teal-50 border-teal-200">Excel</span>
                    )}
                </div>
            ),
        },
        { key: 'date', label: 'Fecha', sortable: true, sortValue: orderDate,
            render: (o) => <span className="text-slate-600 whitespace-nowrap">{formatDate(new Date(o.created_at || o.valid_until || new Date()))}</span> },
        { key: 'total', label: 'Contrato (con IVA)', align: 'right', sortable: true, sortValue: (o) => Number(o.total_price) || 0,
            render: (o) => <span className="block text-right tabular-nums font-bold text-slate-800">{formatMoney(Number(o.total_price) || 0)}</span> },
        activeFilter === 'ADVANCES'
            ? { key: 'advance', label: 'Anticipo solicitado', align: 'right', sortable: true,
                sortValue: (o) => (Number(o.total_price) || 0) * ((Number(o.advance_percent) || 60) / 100),
                render: (o) => (
                    <span className="block text-right tabular-nums font-bold text-amber-700">
                        {formatMoney((Number(o.total_price) || 0) * ((Number(o.advance_percent) || 60) / 100))}
                        <span className="block text-[10px] font-medium text-slate-500">{o.advance_percent ?? 60}%</span>
                    </span>
                ) }
            : { key: 'outstanding', label: 'Falta cobrar', align: 'right', sortable: true,
                sortValue: (o) => Number((o as SalesOrder & { outstanding_balance?: number }).outstanding_balance) || 0,
                render: (o) => <span className="block text-right tabular-nums font-bold text-amber-700">{formatMoney(Number((o as SalesOrder & { outstanding_balance?: number }).outstanding_balance) || 0)}</span> },
        ...(canViewRayosX ? [{
            key: 'action',
            label: 'Acción',
            align: 'right' as const,
            render: (o: SalesOrder) => (
                <div className="flex justify-end">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openStatement(o)}>
                        Rayos X y facturar
                    </Button>
                </div>
            ),
        }] : []),
    ];

    return (
        <div className="relative animate-fadeIn">
            {activeFilter === null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
                    <VHubCard
                        label="A. Anticipos por facturar"
                        title="Anticipos"
                        footer={`${formatMoney(advanceCardVal)} · primer pago pendiente`}
                        icon={Lock}
                        side={advanceCardCount}
                        tone="amber"
                        onClick={() => setActiveFilter('ADVANCES')}
                    />
                    <VHubCard
                        label="B. Avances por facturar"
                        title="Avances"
                        footer={`${formatMoney(installmentsVal)} · casas firmadas sin factura`}
                        icon={Unlock}
                        side={cardBCount}
                        tone="blue"
                        onClick={() => navigate('/finance/pending-invoices', { state: { returnTo: financeReturnPath, progressTab: 'AVANCES' } })}
                    />
                    <VHubCard
                        label="C. Antigüedad"
                        title="Antigüedad"
                        footer={`${formatMoney(agingVal)} · cartera viva`}
                        icon={FileText}
                        side={pendingInvoices.length}
                        tone="emerald"
                        onClick={() => navigate('/finance/aging', { state: { returnTo: financeReturnPath, openSection: financeReturnPath === '/management' ? 'RECEIVABLES' : undefined } })}
                    />
                    <VHubCard
                        label="E. Cobranza"
                        title="Cobranza"
                        footer="Cuentas por cobrar pendientes"
                        icon={Wallet}
                        side={pendingInvoices.length}
                        tone="red"
                        onClick={() => navigate('/finance/cxc-report', { state: { returnTo: financeReturnPath } })}
                    />
                </div>
            ) : (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <VPageHeader
                        icon={activeFilter === 'ADVANCES' ? Lock : Layers}
                        title={activeFilter === 'ADVANCES' ? 'Anticipos por facturar' : 'OV y facturación'}
                        subtitle={activeFilter === 'ADVANCES'
                            ? 'OVs que esperan la factura de su primer pago.'
                            : 'Órdenes de venta con su contrato y lo que falta cobrar.'}
                        onRefresh={() => void refreshReceivables()}
                        onBack={() => {
                            if (onBackOverride) onBackOverride();
                            else setActiveFilter(null);
                        }}
                        backLabel={backLabel ?? (onBackOverride ? 'Regresar a Tareas' : 'Regresar a Cuentas por cobrar')}
                    />

                    {activeFilter === 'ALL' && (
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex flex-wrap gap-2" role="tablist">
                                {ORDER_GROUPS.map(({ key, label }) => (
                                    <Button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={orderGroup === key}
                                        variant="outline"
                                        onClick={() => setOrderGroup(key)}
                                        className={orderGroup === key ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-700' : 'text-slate-600'}
                                    >
                                        {label} ({ordersByGroup[key].length})
                                    </Button>
                                ))}
                            </div>
                            <div className="relative w-full md:w-96">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search size={18} className="text-slate-400" />
                                </div>
                                <Input
                                    type="text"
                                    className="pl-10 text-sm font-medium shadow-sm"
                                    placeholder="Buscar OV, cliente, proyecto o factura..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <VTable
                        columns={orderColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                        data={listData as unknown as Record<string, unknown>[]}
                        emptyState={{ icon: <CheckCircle2 />, title: searchTerm.trim() && activeFilter === 'ALL' ? 'Ninguna OV coincide con la búsqueda.' : 'Bandeja limpia: no hay órdenes en esta lista.' }}
                        headerStyle="report"
                        defaultSortKey="date"
                        defaultSortDirection="asc"
                        className="shadow-sm"
                    />
                </div>
            )}

            {selectedOrderForStatement && (
                <OrderStatementModal isOpen={isStatementModalOpen} onClose={() => setIsStatementModalOpen(false)} order={selectedOrderForStatement} onSuccess={refreshReceivables} onOrderPatch={(patch) => { if (selectedOrderForStatement && (patch as SalesOrder).items) setSelectedOrderForStatement(patch as SalesOrder); }} onOpenInvoiceModal={(orderToInvoice, existingProgressInvoice) => { setSelectedOrderForCharge(orderToInvoice); setExistingProgressInvoiceForCharge(existingProgressInvoice ?? null); setIsChargeModalOpen(true); }} readOnly={!hasAbsolutePower} />
            )}
            {selectedOrderForCharge && hasAbsolutePower && (
                <ReceivableChargeModal isOpen={isChargeModalOpen} onClose={() => { setIsChargeModalOpen(false); setExistingProgressInvoiceForCharge(null); }} order={selectedOrderForCharge} existingProgressInvoice={existingProgressInvoiceForCharge} onSuccess={() => { void refreshReceivables(); setIsChargeModalOpen(false); setExistingProgressInvoiceForCharge(null); }} />
            )}
        </div>
    );
};