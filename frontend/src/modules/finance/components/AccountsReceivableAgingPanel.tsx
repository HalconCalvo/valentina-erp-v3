import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText, Search, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { salesService } from '../../../api/sales-service';
import { CustomerPayment, PaymentType, SalesOrder, SalesOrderStatus } from '../../../types/sales';
import { enrichSalesOrdersWithPaymentsWhenMissing } from '../../sales/utils/enrichOrdersPayments';
import { OrderStatementModal } from './OrderStatementModal';
import { ReceivableChargeModal } from './ReceivableChargeModal';

// =============================================================================
// V5.6 — Lógica única de antigüedad / monitor de cartera (carga + filas)
// =============================================================================

const CARTERA_MONITOR_STATUSES = new Set([
    'WAITING_ADVANCE',
    'SOLD',
    'IN_PRODUCTION',
    'FINISHED',
    'COMPLETED',
    'INSTALLED',
]);

function normStatus(s: unknown): string {
    return String(s ?? '').toUpperCase().trim();
}

export function orderEligibleForCarteraMonitor(o: SalesOrder): boolean {
    return CARTERA_MONITOR_STATUSES.has(normStatus(o.status));
}

function paymentsArr(o: SalesOrder): CustomerPayment[] {
    const p = (o as unknown as { payments?: CustomerPayment[] }).payments;
    return Array.isArray(p) ? p : [];
}

function paidTotal(pays: CustomerPayment[]): number {
    return pays
        .filter((x) => String(x.status ?? '').toUpperCase() === 'PAID')
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

export type CarteraMonitorRow = {
    rowKey: string;
    order: SalesOrder;
    clientName: string;
    /** Fecha emisión factura o ancla de saldo (cálculos internos / ordenación) */
    invoice_date: string;
    ovDateYmd: string;
    orderTotal: number;
    invoice_folio: string | null;
    payment_type: PaymentType | 'BALANCE';
    /** Saldo pendiente de la fila (CXC o resumen Total−Pagado) */
    amount: number;
    daysOverdue: number;
    isBalanceSummary: boolean;
};

export function getCarteraClientName(order: SalesOrder): string {
    const o = order as unknown as Record<string, unknown>;
    const client = o.client as Record<string, unknown> | undefined;
    return (
        (o.client_name as string) ||
        (client?.full_name as string) ||
        (client?.name as string) ||
        (o.customer as { name?: string } | undefined)?.name ||
        'Cliente'
    );
}

function ovDateFromOrder(order: SalesOrder): string {
    const raw = (order as unknown as { created_at?: string }).created_at || order.valid_until || new Date().toISOString();
    return String(raw).slice(0, 10);
}

/**
 * Filas del monitor: una por CustomerPayment con status PENDING. Órdenes sin CXC pendiente no generan filas.
 */
export function buildCarteraMonitorRows(orders: SalesOrder[]): CarteraMonitorRow[] {
    const rows: CarteraMonitorRow[] = [];
    const today = new Date();

    for (const order of orders) {
        if (!orderEligibleForCarteraMonitor(order) || order.id == null) continue;

        const pays = paymentsArr(order);
        const pending = pays.filter((c) => String(c.status ?? '').toUpperCase() === 'PENDING');
        if (pending.length === 0) continue;

        const clientName = getCarteraClientName(order);
        const ovDateYmd = ovDateFromOrder(order);
        const orderTotal = Number(order.total_price) || 0;

        for (const cxc of pending) {
            const invoiceDate = new Date(cxc.invoice_date);
            const diffTime = Math.abs(today.getTime() - invoiceDate.getTime());
            const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            rows.push({
                rowKey: `${order.id}-cxc-${cxc.id}`,
                order,
                clientName,
                invoice_date: cxc.invoice_date,
                ovDateYmd,
                orderTotal,
                invoice_folio: cxc.invoice_folio ?? null,
                payment_type: cxc.payment_type,
                amount: Number(cxc.amount) || 0,
                daysOverdue,
                isBalanceSummary: false,
            });
        }
    }

    return rows;
}

export function aggregateCarteraMonitorTotals(orders: SalesOrder[]): { docCount: number; amount: number } {
    const rows = buildCarteraMonitorRows(orders);
    return {
        docCount: rows.length,
        amount: rows.reduce((s, r) => s + r.amount, 0),
    };
}

export function sumAgingCxcFromOrders(orders: SalesOrder[]): { docCount: number; amount: number } {
    return aggregateCarteraMonitorTotals(orders);
}

export function isSellerLikeRole(): boolean {
    return ['SALES', 'VENTAS'].includes((localStorage.getItem('user_role') || '').toUpperCase().trim());
}

export function mergePendingCustomerPaymentsIntoOrders(orders: SalesOrder[], cxc: CustomerPayment[]): SalesOrder[] {
    const byId = new Map<number, SalesOrder>();
    for (const o of orders) {
        if (o.id != null) byId.set(o.id, o);
    }
    for (const p of cxc) {
        if (String(p.status).toUpperCase() !== 'PENDING') continue;
        const oid = p.sales_order_id;
        let order = byId.get(oid);
        if (!order) {
            order = {
                id: oid,
                client_id: 0,
                tax_rate_id: 0,
                project_name: `OV-${String(oid).padStart(4, '0')}`,
                status: SalesOrderStatus.SOLD,
                items: [],
                currency: 'MXN',
                is_warranty: false,
                valid_until: new Date().toISOString().slice(0, 10),
            } as SalesOrder;
            byId.set(oid, order);
        }
        const list = ((order as unknown as { payments?: CustomerPayment[] }).payments ??= []);
        if (!list.some((x) => x.id === p.id)) {
            list.push(p);
        }
    }
    return Array.from(byId.values());
}

async function hydrateOrdersMissingFromInitialSet(orders: SalesOrder[], initialIds: Set<number>): Promise<SalesOrder[]> {
    return Promise.all(
        orders.map(async (o) => {
            if (o.id == null || initialIds.has(o.id)) return o;
            try {
                const full = await salesService.getOrderDetail(o.id);
                const fullPays = [...(((full as unknown as { payments?: CustomerPayment[] }).payments) ?? [])];
                const stubPays = ((o as unknown as { payments?: CustomerPayment[] }).payments) ?? [];
                for (const sp of stubPays) {
                    if (!fullPays.some((x) => x.id === sp.id)) fullPays.push(sp);
                }
                return { ...full, payments: fullPays };
            } catch {
                return o;
            }
        })
    );
}

/**
 * Órdenes para métricas/dashboard: GET /sales/orders + hidratar + (Ventas) CXC pendientes.
 * Filtro por rol: backend aplica `user_id` solo a SALES/VENTAS; vista global para Admin/Gerencia/Dirección.
 */
export async function loadSalesOrdersWithAdministrationAgingCxc(): Promise<SalesOrder[]> {
    const raw = await salesService.getOrders();
    let orders: SalesOrder[] = raw ? Array.from(new Map(raw.map((o) => [o.id, o])).values()) : [];
    const initialIds = new Set(orders.map((o) => o.id).filter((id): id is number => id != null));
    orders = await enrichSalesOrdersWithPaymentsWhenMissing(orders);

    if (isSellerLikeRole()) {
        const lines = await salesService.getPendingCustomerPaymentsForReceivable();
        orders = mergePendingCustomerPaymentsIntoOrders(orders, lines);
        orders = await hydrateOrdersMissingFromInitialSet(orders, initialIds);
    }

    return orders;
}

// =============================================================================
// UI — Panel
// =============================================================================

type SortField = 'CLIENT' | 'OV_DATE' | 'ORDER_TOTAL' | 'BALANCE' | 'OVERDUE';
type SortDirection = 'asc' | 'desc';

export function userCanPerformFinanceCXCActions(): boolean {
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    return [
        'ADMIN',
        'ADMINISTRADOR',
        'ADMINISTRACIÓN',
        'ADMINISTRATION',
        'FINANCE',
        'FINANZAS',
        'DIRECTOR',
        'GERENCIA',
        'MANAGER',
    ].includes(userRole);
}

export interface AccountsReceivableAgingPanelProps {
    variant: 'page' | 'embedded';
    returnToPath?: string;
    onEmbeddedBack?: () => void;
    suppressTopBar?: boolean;
    /** Texto del botón atrás cuando `variant="embedded"` (p. ej. Tesorería vs Ventas). */
    embeddedBackLabel?: string;
}

function vencidoLabel(days: number): { text: string; className: string } {
    if (days > 30) return { text: 'Sí', className: 'text-red-600 bg-red-50 border-red-200' };
    if (days > 15) return { text: 'En riesgo', className: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { text: 'No', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
}

export const AccountsReceivableAgingPanel: React.FC<AccountsReceivableAgingPanelProps> = ({
    variant,
    returnToPath: returnToPathProp,
    onEmbeddedBack,
    suppressTopBar = false,
    embeddedBackLabel,
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const returnToFromState = (location.state as { returnTo?: string } | null)?.returnTo;
    const returnToPath = returnToPathProp ?? returnToFromState;

    const allowFinanceActions = userCanPerformFinanceCXCActions();

    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [sortField, setSortField] = useState<SortField>('OVERDUE');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedOrderForStatement, setSelectedOrderForStatement] = useState<SalesOrder | null>(null);
    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [selectedOrderForCharge, setSelectedOrderForCharge] = useState<SalesOrder | null>(null);

    const loadSalesData = async () => {
        try {
            setIsLoading(true);
            const allQuotes = await loadSalesOrdersWithAdministrationAgingCxc();
            setOrders(allQuotes);
        } catch (error) {
            console.error('Error cargando cuentas por cobrar:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSalesData();
        const intervalId = setInterval(loadSalesData, 15000);
        return () => clearInterval(intervalId);
    }, []);

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const carteraRows = useMemo(() => buildCarteraMonitorRows(orders), [orders]);

    const filteredInvoices = carteraRows.filter((inv: CarteraMonitorRow) => {
        const q = searchTerm.toLowerCase();
        return (
            inv.clientName.toLowerCase().includes(q) ||
            inv.order.project_name.toLowerCase().includes(q) ||
            (inv.invoice_folio && inv.invoice_folio.toLowerCase().includes(q)) ||
            (inv.isBalanceSummary && 'saldo total pagado'.includes(q))
        );
    });

    const totalFilteredAging = filteredInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'OVERDUE' || field === 'BALANCE' || field === 'ORDER_TOTAL' ? 'desc' : 'asc');
        }
    };

    const sortedInvoices = useMemo(() => {
        const sortableItems = [...filteredInvoices];
        sortableItems.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'CLIENT':
                    comparison = a.clientName.localeCompare(b.clientName);
                    break;
                case 'OV_DATE':
                    comparison = new Date(a.ovDateYmd).getTime() - new Date(b.ovDateYmd).getTime();
                    break;
                case 'ORDER_TOTAL':
                    comparison = a.orderTotal - b.orderTotal;
                    break;
                case 'BALANCE':
                    comparison = Number(a.amount) - Number(b.amount);
                    break;
                case 'OVERDUE':
                    comparison = a.daysOverdue - b.daysOverdue;
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        return sortableItems;
    }, [filteredInvoices, sortField, sortDirection]);

    const SortableHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: 'left' | 'right' | 'center' }) => {
        const isActive = sortField === field;
        const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
        return (
            <th className={`p-4 ${alignClass} cursor-pointer hover:bg-slate-200 transition-colors select-none`} onClick={() => handleSort(field)}>
                <div
                    className={`flex items-center gap-1 inline-flex ${align === 'right' ? 'flex-row-reverse' : ''} ${align === 'center' ? 'justify-center' : ''}`}
                >
                    <span className={isActive ? 'text-emerald-800' : 'text-slate-600 font-bold'}>{label}</span>
                    {isActive ? (
                        sortDirection === 'asc' ? (
                            <ArrowUp size={16} className="text-emerald-600" />
                        ) : (
                            <ArrowDown size={16} className="text-emerald-600" />
                        )
                    ) : (
                        <ArrowUpDown size={16} className="text-slate-400 hover:text-slate-600" />
                    )}
                </div>
            </th>
        );
    };

    const handleGoBack = () => {
        if (variant === 'embedded') {
            onEmbeddedBack?.();
            return;
        }
        if (returnToPath) {
            navigate(returnToPath);
            return;
        }
        sessionStorage.setItem('treasury_activeSection', 'RECEIVABLES');
        navigate('/finance');
    };

    const outerClass =
        variant === 'page' ? 'p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn' : 'space-y-6 animate-fadeIn pb-8';

    const pageTitle = allowFinanceActions ? 'Antigüedad de Saldos' : 'Cartera Viva (Facturas Pendientes)';
    const pageSubtitle = allowFinanceActions
        ? 'Toda la cartera viva consolidada. Ejecución operativa.'
        : 'Monitorea el estatus de cobro de tus proyectos.';

    const backLabel = variant === 'embedded' ? embeddedBackLabel ?? 'Regresar a Tarjetas' : 'Regresar a Cobranza';

    return (
        <div className={outerClass}>
            {!suppressTopBar && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <h1 className={`font-black text-emerald-800 tracking-tight flex items-center gap-3 ${variant === 'page' ? 'text-3xl' : 'text-2xl'}`}>
                            <FileText className="text-emerald-500" size={variant === 'page' ? 32 : 28} />
                            {pageTitle}
                        </h1>
                        <p className="text-slate-500 mt-1 font-medium text-sm">{pageSubtitle}</p>
                    </div>

                    <div className="flex items-center gap-4">
                        {isLoading && <span className="text-xs text-emerald-500 font-bold animate-pulse">Actualizando...</span>}
                        <button
                            onClick={handleGoBack}
                            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-sm"
                        >
                            <ArrowLeft size={18} /> {backLabel}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border border-emerald-200 shadow-md overflow-hidden">
                <div className="p-4 border-b border-emerald-100 bg-emerald-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="bg-white border border-emerald-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-3 w-full md:w-auto justify-between">
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total en Pantalla:</span>
                        <span className="font-black text-emerald-900 text-xl">{formatCurrency(totalFilteredAging)}</span>
                    </div>

                    {suppressTopBar && isLoading && (
                        <span className="text-xs text-emerald-600 font-bold animate-pulse md:order-first">Actualizando cartera…</span>
                    )}

                    <div className="relative w-full md:w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={18} className="text-slate-400" />
                        </div>
                        <input
                            type="text"
                            className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium transition-all shadow-sm"
                            placeholder="Buscar cliente, proyecto o factura..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                <SortableHeader field="CLIENT" label="Cliente / Proyecto" />
                                <SortableHeader field="OV_DATE" label="Fecha OV" />
                                <SortableHeader field="ORDER_TOTAL" label="Importe OV" align="right" />
                                <SortableHeader field="BALANCE" label="Saldo pendiente" align="right" />
                                <SortableHeader field="OVERDUE" label="Vencido" align="center" />
                                <th className="p-4 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-slate-500 italic text-lg">
                                        {carteraRows.length === 0
                                            ? 'No hay órdenes en cartera para tu perfil. Cuando tengas OVs activas aparecerán aquí con saldo o facturas pendientes.'
                                            : 'No hay resultados para tu búsqueda.'}
                                    </td>
                                </tr>
                            ) : (
                                sortedInvoices.map((inv) => {
                                    const ven = vencidoLabel(inv.daysOverdue);
                                    return (
                                        <tr key={inv.rowKey} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4">
                                                <p className="font-bold text-slate-800 text-sm">{inv.clientName}</p>
                                                <p className="text-xs text-slate-500">{inv.order.project_name}</p>
                                                {!inv.isBalanceSummary && (
                                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                                        <span
                                                            className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                                                                inv.payment_type === 'ADVANCE'
                                                                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                                                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                                            }`}
                                                        >
                                                            {inv.payment_type === 'ADVANCE' ? 'Anticipo' : 'Avance'} · {inv.invoice_folio || 'S/F'}
                                                        </span>
                                                    </p>
                                                )}
                                                {inv.isBalanceSummary && (
                                                    <p className="text-[10px] text-slate-500 mt-0.5">Resumen (sin factura CXC pendiente)</p>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                                                {new Date(inv.ovDateYmd).toLocaleDateString('es-MX')}
                                            </td>
                                            <td className="p-4 text-right font-bold text-slate-800">{formatCurrency(inv.orderTotal)}</td>
                                            <td className="p-4 text-right font-black text-slate-900">{formatCurrency(Number(inv.amount))}</td>
                                            <td className="p-4 text-center">
                                                <span
                                                    className={`inline-flex items-center justify-center gap-1 font-bold text-xs px-2 py-1 rounded border ${ven.className}`}
                                                    title={`Antigüedad referencia: ${inv.daysOverdue} d`}
                                                >
                                                    {inv.daysOverdue > 30 && <AlertTriangle size={14} />}
                                                    {ven.text}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => {
                                                        setSelectedOrderForStatement(inv.order);
                                                        setIsStatementModalOpen(true);
                                                    }}
                                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                                        allowFinanceActions
                                                            ? 'text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200'
                                                            : 'text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200'
                                                    }`}
                                                >
                                                    {allowFinanceActions ? 'Abrir / Pagar' : 'Rayos X'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedOrderForStatement && (
                <OrderStatementModal
                    isOpen={isStatementModalOpen}
                    onClose={() => {
                        setIsStatementModalOpen(false);
                        setSelectedOrderForStatement(null);
                    }}
                    order={selectedOrderForStatement}
                    onSuccess={loadSalesData}
                    readOnly={!allowFinanceActions}
                    onOpenInvoiceModal={
                        allowFinanceActions
                            ? (orderToInvoice) => {
                                  setSelectedOrderForCharge(orderToInvoice);
                                  setIsChargeModalOpen(true);
                              }
                            : undefined
                    }
                />
            )}

            {selectedOrderForCharge && allowFinanceActions && (
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
                            salesService.getOrders().then((list) => {
                                const updated = list.find((o) => o.id === selectedOrderForStatement.id);
                                if (updated) setSelectedOrderForStatement(updated);
                            });
                        }
                    }}
                />
            )}
        </div>
    );
};
