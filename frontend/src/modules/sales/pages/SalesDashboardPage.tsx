import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { 
    Target, FileText, Coins, Users, Search,
    ArrowLeft, Plus, TrendingUp, Wallet, Clock, 
    AlertTriangle, CheckCircle, ShieldAlert, BadgeDollarSign,
    FileSignature, FileSearch, CalendarClock, Lock, Unlock,
    ArrowLeftCircle, XCircle, FileDown, RefreshCcw, Archive,
    ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import {
    TableActionViewIcon,
    TABLE_ACTION_ICON_SIZE,
} from '@/lib/tableActionIcons';
import { toast } from '@/components/ui/VToast';

import { salesService } from '../../../api/sales-service';
import { isCancelledOrder } from '../utils/orderStatus';
import { isExpiringQuotation } from '../utils/quotationRadar';
import { SalesOrder } from '../../../types/sales';
import client from '../../../api/axios-client';

// IMPORTACIONES DE LOS DOS MODALES
import { SalesOrderDetailModal } from '../components/SalesOrderDetailModal';
import { FinancialReviewModal } from '../../management/components/FinancialReviewModal';
import BaptismModal from '../components/BaptismModal';
import { AccountsReceivableAgingPanel } from '../../finance/components/AccountsReceivableAgingPanel';
import { OrderStatementModal } from '../../finance/components/OrderStatementModal';
import { aggregateCarteraMonitorTotals } from '../utils/receivableCxcOrders';
import { useCurrentUser } from '../../../hooks/useSalesDashboard';
import { useSalesOrders, receivablesQueryKeys } from '../../../hooks/useReceivables';
import { useQuotations } from '../../../hooks/useQuotations';
import { quotationService, QUOTATION_STATUS_LABELS } from '../../../api/quotation-service';
import type { Quotation } from '../../../types/quotations';
import {
    PendingQuotationAction,
    QuotationActionDialogs,
    QuotationActionKind,
    QuotationRowActions,
    quotationStatusBadgeClass,
} from '../components/QuotationActions';

type SalesSection = 'GOALS' | 'QUOTES' | 'COLLECTIONS' | 'MONITOR' | null;
type GoalDetailView = 'COMMISSIONS' | 'CLOSED' | 'STREET' | 'EFFECTIVENESS' | null;
type QuoteDetailView = 'DRAFTS' | 'REVIEW' | 'AUTHORIZED' | 'EXPIRING' | 'HISTORY' | null;
type CollectionDetailView = 'RETAINED' | 'PAYABLE' | 'ADVANCES' | 'AR_AGING' | null;

const COLLECTION_DETAIL_KEYS: CollectionDetailView[] = ['RETAINED', 'PAYABLE', 'ADVANCES', 'AR_AGING'];

/** Normaliza status del API (mayúsculas, tolerante a variaciones). */
function normalizeSalesStatus(status: string | undefined): string {
    return String(status ?? '').toUpperCase().trim();
}

function statusInList(status: string | undefined, list: readonly string[]): boolean {
    const n = normalizeSalesStatus(status);
    return list.some((x) => x === n);
}

/**
 * Venta cerrada + comisión reconocida (Termómetro "Mis Ingresos" y detalle A. Comisiones Generadas).
 * Incluye pipeline post-venta; excluye solo cotizaciones no cerradas con cliente.
 */
const STATUSES_COMMISSION_RECOGNIZED = ['SOLD', 'INSTALLED', 'FINISHED', 'COMPLETED', 'IN_PRODUCTION'] as const;

/** Monto acumulado OV (detalle B. Venta Cerrada): mismo universo que comisiones reconocidas. */
const STATUSES_CLOSED_SALE = STATUSES_COMMISSION_RECOGNIZED;

/**
 * Comisiones pagables (sección 3 Cobranza): alineado al detalle PAYABLE.
 * Sin IN_PRODUCTION: la comisión suele liberarse cuando el cliente ya liquidó o el OV está en cierre administrativo.
 */
const STATUSES_PAYABLE_COMMISSION = ['SOLD', 'INSTALLED', 'FINISHED', 'COMPLETED'] as const;

/** Fecha de OC del cliente vs mes calendario actual (comparación por YYYY-MM-DD). */
function isClientPoDateInCurrentMonth(clientPoDate: string | null | undefined): boolean {
    if (!clientPoDate) return false;
    const part = String(clientPoDate).slice(0, 10);
    const seg = part.split('-');
    if (seg.length < 2) return false;
    const y = Number(seg[0]);
    const m = Number(seg[1]);
    const n = new Date();
    return y === n.getFullYear() && m === n.getMonth() + 1;
}

function quotaProgressToneClass(pct: number): string {
    if (pct <= 20) return 'text-red-600';
    if (pct <= 40) return 'text-orange-500';
    if (pct <= 80) return 'text-amber-500';
    return 'text-emerald-600';
}

function readStoredCollectionView(): CollectionDetailView {
    const raw = sessionStorage.getItem('sales_activeCollectionView');
    if (!raw || !COLLECTION_DETAIL_KEYS.includes(raw as CollectionDetailView)) return null;
    return raw as CollectionDetailView;
}

const SalesDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();

    // Only DIRECTOR / MANAGER can open the Financial Audit modal and see margins/costs
    const userRole  = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canAudit  = ['DIRECTOR', 'MANAGER', 'ADMIN', 'ADMINISTRADOR'].includes(userRole);

    const [, setActionLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // ESTADOS PARA ORDENAMIENTO DE COLUMNAS (AÑADIDOS DATE Y FOLIO)
    const [quoteSortConfig, setQuoteSortConfig] = useState<{ key: 'DATE' | 'FOLIO' | 'CLIENT' | 'SELLER' | 'STATUS' | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'desc' });
    const [monitorSort, setMonitorSort] = useState<{ key: 'FOLIO' | 'CLIENT' | 'AGE', direction: 'asc' | 'desc' }>({ key: 'AGE', direction: 'desc' });

    const [viewingOrderIdForFormat, setViewingOrderIdForFormat] = useState<number | null>(null);
    const [rayosXOrder, setRayosXOrder] = useState<SalesOrder | null>(null);
    const [cancelledOvIds, setCancelledOvIds] = useState<Set<number>>(new Set());
    const [viewingOrderIdForAudit, setViewingOrderIdForAudit] = useState<number | null>(null);
    const [baptismOrderId, setBaptismOrderId] = useState<number | null>(null);

    const [activeSection, setActiveSection] = useState<SalesSection>(
        (sessionStorage.getItem('sales_activeSection') as SalesSection) || null
    );
    const [activeGoalView, setActiveGoalView] = useState<GoalDetailView>(
        (sessionStorage.getItem('sales_activeGoalView') as GoalDetailView) || null
    ); 
    const [activeQuoteView, setActiveQuoteView] = useState<QuoteDetailView>(
        (sessionStorage.getItem('sales_activeQuoteView') as QuoteDetailView) || null
    ); 
    const [activeCollectionView, setActiveCollectionView] = useState<CollectionDetailView>(readStoredCollectionView);

    useEffect(() => {
        if (activeCollectionView) sessionStorage.setItem('sales_activeCollectionView', activeCollectionView);
        else sessionStorage.removeItem('sales_activeCollectionView');
    }, [activeCollectionView]);

    useEffect(() => {
        if (activeSection) sessionStorage.setItem('sales_activeSection', activeSection);
        else sessionStorage.removeItem('sales_activeSection');
    }, [activeSection]);

    useEffect(() => {
        if (activeGoalView) sessionStorage.setItem('sales_activeGoalView', activeGoalView);
        else sessionStorage.removeItem('sales_activeGoalView');
    }, [activeGoalView]);

    useEffect(() => {
        if (activeQuoteView) sessionStorage.setItem('sales_activeQuoteView', activeQuoteView);
        else sessionStorage.removeItem('sales_activeQuoteView');
    }, [activeQuoteView]);

    const [stats, setStats] = useState({
        commGenerated: 0, activeCommCount: 0, wonCount: 0, closedSales: 0, closedSalesMonth: 0, closedOrdersMonthCount: 0,
        moneyOnStreet: 0, streetCount: 0, battingRate: 0, totalResolved: 0,
        drafts: 0, draftsVal: 0, inReview: 0, reviewVal: 0, authorized: 0, authVal: 0, expiring: 0, expiringVal: 0,
        retainedComm: 0, retainedCount: 0, payableComm: 0, payableCount: 0, pendingAdvance: 0, advanceVal: 0, pendingInvoices: 0, invoicesVal: 0,
        activeProjectsCount: 0, historyCount: 0,
        quotaProgressPct: null as number | null,
        quotaProgressTone: 'text-slate-500',
        monthlyQuota: 0,
    });

    const [monthlyQuota, setMonthlyQuota] = useState(0);
    const [quotationAction, setQuotationAction] = useState<PendingQuotationAction | null>(null);
    const [reviewQuotationId, setReviewQuotationId] = useState<number | null>(null);

    const { data: currentUser } = useCurrentUser();
    const {
        data: orders = [],
        isError: ordersError,
        refetch: refetchOrders,
    } = useSalesOrders({ pausePolling: quotationAction !== null });
    const {
        data: quotations = [],
        isError: quotationsError,
        refetch: refetchQuotations,
    } = useQuotations();

    useEffect(() => {
        if (!currentUser) {
            setMonthlyQuota(0);
            return;
        }
        const q = currentUser.monthly_quota ?? currentUser.monthly_sales_target;
        setMonthlyQuota(typeof q === 'number' ? q : parseFloat(String(q)) || 0);
    }, [currentUser]);

    useEffect(() => {
        if (ordersError) toast.error('Error al cargar las órdenes de venta.');
    }, [ordersError]);

    useEffect(() => {
        if (quotationsError) toast.error('Error al cargar cotizaciones.');
    }, [quotationsError]);

    useEffect(() => {
        if (location.state?.reset) {
            setActiveSection(null);
            setActiveGoalView(null);
            setActiveQuoteView(null);
            setActiveCollectionView(null);
            sessionStorage.removeItem('sales_activeSection');
            sessionStorage.removeItem('sales_activeGoalView');
            sessionStorage.removeItem('sales_activeQuoteView');
            sessionStorage.removeItem('sales_activeCollectionView');
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const patchOrderInCache = useCallback((orderId: number, patch: SalesOrder | Partial<SalesOrder>) => {
        queryClient.setQueryData<SalesOrder[]>(receivablesQueryKeys.salesOrders(), (prev) => {
            if (!prev) return prev;
            const index = prev.findIndex((o) => o.id === orderId);
            if (index === -1) return prev;
            const next = [...prev];
            next[index] = typeof patch === 'object' && patch !== null && 'id' in patch
                ? (patch as SalesOrder)
                : { ...next[index], ...patch };
            return next;
        });
    }, [queryClient]);

    const calculateMetrics = useCallback((allOrders: SalesOrder[], allQuotations: Quotation[]) => {
        let closedSalesMonth = 0;
        let closedOrdersMonthCount = 0;

        let s = {
            commGenerated: 0, activeCommCount: 0, wonCount: 0, closedSales: 0, closedSalesMonth: 0, closedOrdersMonthCount: 0,
            moneyOnStreet: 0, streetCount: 0, battingRate: 0, totalResolved: 0,
            drafts: 0, draftsVal: 0, inReview: 0, reviewVal: 0, authorized: 0, authVal: 0, expiring: 0, expiringVal: 0,
            retainedComm: 0, retainedCount: 0, payableComm: 0, payableCount: 0, pendingAdvance: 0, advanceVal: 0, pendingInvoices: 0, invoicesVal: 0, finalInvoices: 0, finalInvoicesVal: 0,
            activeProjectsCount: 0,
            historyCount: allQuotations.length,
            quotaProgressPct: null as number | null,
            quotaProgressTone: 'text-slate-500',
            monthlyQuota: Number(monthlyQuota) || 0,
        };


        // Quotations: pipeline before the client's purchase order.
        let lostCount = 0;
        allQuotations.forEach(q => {
            const price = Number(q.total_price) || 0;
            const comm = Number(q.commission_amount) || 0;
            if (q.status === 'LOST') lostCount++;
            if (['PENDING_AUTH', 'AUTHORIZED'].includes(q.status)) { s.moneyOnStreet += comm; s.streetCount++; }
            if (['DRAFT', 'CHANGES_REQUESTED'].includes(q.status)) { s.drafts++; s.draftsVal += price; }
            if (q.status === 'PENDING_AUTH') { s.inReview++; s.reviewVal += price; }
            if (q.status === 'AUTHORIZED') { s.authorized++; s.authVal += price; }
            if (isExpiringQuotation(q)) { s.expiring++; s.expiringVal += price; }
        });

        allOrders.forEach(o => {
            const st = normalizeSalesStatus(o.status);
            const price = Number(o.total_price) || 0;
            const comm = Number(o.commission_amount) || 0;
            
            if (statusInList(o.status, STATUSES_CLOSED_SALE)) {
                s.closedSales += price; 
                s.wonCount++;
                if (isClientPoDateInCurrentMonth(o.client_po_date)) {
                    closedSalesMonth += price;
                    closedOrdersMonthCount++;
                }
            }
            
            if (statusInList(o.status, STATUSES_COMMISSION_RECOGNIZED)) {
                s.commGenerated += comm; 
                s.activeCommCount++; 
            }

            if (statusInList(o.status, STATUSES_PAYABLE_COMMISSION)) {
                s.payableComm += comm; 
                s.payableCount++;
            }

            if (st === 'WAITING_ADVANCE') { s.moneyOnStreet += comm; s.streetCount++; }
            if (st === 'WAITING_ADVANCE') { s.retainedComm += comm; s.retainedCount++; }
            
            if (['WAITING_ADVANCE', 'SOLD', 'IN_PRODUCTION', 'FINISHED', 'COMPLETED'].includes(st)) {
                s.activeProjectsCount++;
            }

            if (st === 'WAITING_ADVANCE') { 
                const advancePercentage = (o.advance_percent || 60) / 100;
                s.pendingAdvance++; 
                s.advanceVal += (price * advancePercentage); 
            }
        });

        const cartera = aggregateCarteraMonitorTotals(allOrders);
        s.pendingInvoices = cartera.docCount;
        s.invoicesVal = cartera.amount;

        s.closedSalesMonth = closedSalesMonth;
        s.closedOrdersMonthCount = closedOrdersMonthCount;
        s.totalResolved = s.wonCount + lostCount;
        s.battingRate = s.totalResolved > 0 ? Math.round((s.wonCount / s.totalResolved) * 100) : 0;

        const qMeta = Number(monthlyQuota) || 0;
        if (qMeta > 0) {
            const qpct = Math.min(100, Math.round((closedSalesMonth / qMeta) * 100));
            s.quotaProgressPct = qpct;
            s.quotaProgressTone = quotaProgressToneClass(qpct);
        } else {
            s.quotaProgressPct = null;
            s.quotaProgressTone = 'text-slate-500';
        }
        setStats(s);
    }, [monthlyQuota]);

    useEffect(() => {
        calculateMetrics(orders, quotations);
    }, [orders, quotations, calculateMetrics]);

    const ACTIVE_ORDER_STATUSES = ['WAITING_ADVANCE', 'SOLD', 'IN_PRODUCTION', 'FINISHED', 'COMPLETED'];

    /** Warns before generating an OV when the client already has an active OV for the same project. */
    const duplicateOrderWarning = (q: Quotation): string | undefined => {
        const project = (q.project_name || '').trim().toLowerCase();
        const duplicate = orders.find(o =>
            o.client_id === q.client_id &&
            (o.project_name || '').trim().toLowerCase() === project &&
            ACTIVE_ORDER_STATUSES.includes(o.status)
        );
        if (!duplicate) return undefined;
        return `Ya existe una OV activa para este cliente y proyecto (OV-${String(duplicate.id).padStart(4, '0')}). Verifica que no sea un duplicado.`;
    };

    const openQuotationAction = (kind: QuotationActionKind, q: Quotation) => {
        setQuotationAction({ kind, quotation: q, duplicateWarning: kind === 'CONVERT' ? duplicateOrderWarning(q) : undefined });
    };

    const refreshAfterQuotationAction = async () => {
        await Promise.all([refetchQuotations(), refetchOrders()]);
    };

    const handleQuotationPdf = async (quotationId: number) => {
        try {
            await quotationService.openQuotationPdf(quotationId);
        } catch {
            toast.error('Error al generar el PDF de la cotización.');
        }
    };

    const handleViewPDF = async (orderId: number) => {
        const pdfWindow = window.open('', '_blank');
        if (pdfWindow) {
            pdfWindow.document.write('<div style="font-family: sans-serif; padding: 40px; text-align: center; color: #666;"><h3>Generando documento PDF...</h3><p>Por favor espere un momento.</p></div>');
        } else {
            toast.warning('Tu navegador bloqueó la ventana emergente. Por favor permite las ventanas emergentes para este sitio en la barra de direcciones.');
            return;
        }
        setActionLoading(true);
        try {
            const response = await client.get(`/sales/orders/${orderId}/pdf`, { responseType: 'blob' });
            const fileURL = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            pdfWindow.location.href = fileURL;
        } catch (error: any) {
            pdfWindow.close(); 
            toast.error(error.response?.data?.detail || 'Error al cargar el PDF. Revisa tu conexión o contacta a soporte.');
        } finally {
            setActionLoading(false);
        }
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const getCountSize = (count: number) => {
        const len = count.toString().length;
        if (len > 3) return 'text-xl';
        if (len === 3) return 'text-2xl';
        return 'text-3xl';
    };


    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            'WAITING_ADVANCE': 'Esperando Anticipo',
            'SOLD': 'Vendida / En Producción',
            'INSTALLED': 'Instalada',
            'CANCELLED': 'Cancelada',
            'CANCELLED_OV': 'OV cancelada',
            'FINISHED': 'Finalizada Cerrada',
            'COMPLETED': 'Completada',
            'IN_PRODUCTION': 'En Producción'
        };
        return labels[status] || status;
    };

    const getClientName = (order: SalesOrder) => {
        const o = order as any; 
        return o.client_name || o.client?.full_name || o.client?.name || o.customer?.name || 'Cliente por Defecto';
    };

    // ---> LÓGICA DE ORDENAMIENTO EXTENDIDA <---
    const handleQuoteSort = (key: 'DATE' | 'FOLIO' | 'CLIENT' | 'SELLER' | 'STATUS') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (quoteSortConfig.key === key && quoteSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setQuoteSortConfig({ key, direction });
    };

    const handleMonitorSort = (key: 'FOLIO' | 'CLIENT' | 'AGE') => {
        setMonitorSort(prev =>
            prev.key === key
                ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { key, direction: 'asc' }
        );
    };

    const renderSortIcon = (key: string) => {
        if (quoteSortConfig.key !== key) return <ArrowUpDown size={14} className="inline ml-1 opacity-30" />;
        return quoteSortConfig.direction === 'asc' 
            ? <ArrowUp size={14} className="inline ml-1 text-indigo-600" /> 
            : <ArrowDown size={14} className="inline ml-1 text-indigo-600" />;
    };

    const openMainSection = (section: SalesSection) => { 
        setActiveSection(section); 
        setActiveGoalView(null); 
        setActiveQuoteView(null); 
        setActiveCollectionView(null);
        setSearchQuery(''); 
        setQuoteSortConfig({ key: 'DATE', direction: 'desc' }); // Orden por defecto más reciente
    };

    const handleBack = () => {
        setSearchQuery(''); 
        setQuoteSortConfig({ key: null, direction: 'asc' });
        if (activeGoalView !== null) setActiveGoalView(null); 
        else if (activeQuoteView !== null) setActiveQuoteView(null);
        else if (activeCollectionView !== null) setActiveCollectionView(null);
        else { 
            setActiveSection(null); setActiveGoalView(null); 
            setActiveQuoteView(null); setActiveCollectionView(null);
        }
    };

    const getSectionTitle = () => {
        if (activeGoalView === 'COMMISSIONS') return 'Detalle: Comisiones Generadas';
        if (activeGoalView === 'CLOSED') return 'Detalle: Venta Cerrada (mes en curso · por fecha OC)';
        if (activeGoalView === 'STREET') return 'Detalle: Comisiones por Confirmar';
        if (activeGoalView === 'EFFECTIVENESS') return 'Detalle: Efectividad (Ganadas vs Perdidas)';
        if (activeQuoteView === 'DRAFTS') return 'Archivo: Borradores y Ajustes';
        if (activeQuoteView === 'REVIEW') return 'Archivo: En Revisión (Freno)';
        if (activeQuoteView === 'AUTHORIZED') return 'Archivo: Cotizaciones Autorizadas';
        if (activeQuoteView === 'EXPIRING') return 'Radar de Vigencia (Auditoría)';
        if (activeQuoteView === 'HISTORY') return 'Archivo: Histórico General';
        if (activeCollectionView === 'RETAINED') return 'Gestión: Comisiones Retenidas';
        if (activeCollectionView === 'PAYABLE') return 'Gestión: Comisiones Pagables';
        if (activeCollectionView === 'ADVANCES') return 'Gestión: Anticipos Pendientes';
        if (activeCollectionView === 'AR_AGING') return 'Cuentas por Cobrar — Antigüedad (consulta)';
        switch(activeSection) {
            case 'GOALS': return 'Mi Meta y Mis Ingresos';
            case 'QUOTES': return 'Mis Cotizaciones (Archivo)';
            case 'COLLECTIONS': return 'Cobranza y Comisiones';
            case 'MONITOR': return 'Monitor Operativo — Órdenes de Venta Activas';
            default: return 'La Trinchera Comercial';
        }
    };

    /** Row of the goal tables: an OV (closed sale) or a quotation (still in the client's hands, or lost). */
    type GoalRow = {
        kind: 'OV' | 'COT';
        id: number;
        folio: string;
        project_name: string;
        clientName: string;
        statusLabel: string;
        total_price: number;
        commission_amount: number;
        client_po_folio?: string | null;
        client_po_date?: string | null;
        won: boolean;
    };

    const orderRow = (o: SalesOrder): GoalRow => ({
        kind: 'OV', id: o.id as number, folio: `OV-${String(o.id).padStart(4, '0')}`, project_name: o.project_name,
        clientName: getClientName(o), statusLabel: getStatusLabel(o.status), total_price: Number(o.total_price) || 0,
        commission_amount: Number(o.commission_amount) || 0, client_po_folio: (o as any).client_po_folio,
        client_po_date: (o as any).client_po_date, won: statusInList(o.status, STATUSES_CLOSED_SALE),
    });

    const quotationRow = (q: Quotation): GoalRow => ({
        kind: 'COT', id: q.id, folio: q.folio, project_name: q.project_name, clientName: q.client?.full_name || 'Cliente',
        statusLabel: QUOTATION_STATUS_LABELS[q.status], total_price: Number(q.total_price) || 0,
        commission_amount: Number(q.commission_amount) || 0, won: false,
    });

    const renderGoalDetailTable = () => {
        let rows: GoalRow[] = [];
        let emptyMessage = "No hay datos para mostrar.";

        if (activeGoalView === 'COMMISSIONS') {
            rows = orders.filter(o => statusInList(o.status, STATUSES_COMMISSION_RECOGNIZED)).map(orderRow);
            emptyMessage = "No tienes comisiones activas en proceso de entrega/cobro.";
        } 
        else if (activeGoalView === 'CLOSED') {
            rows = orders.filter(o =>
                statusInList(o.status, STATUSES_CLOSED_SALE) && isClientPoDateInCurrentMonth(o.client_po_date)
            ).map(orderRow);
            emptyMessage = "No hay ventas con OC registrada en el mes en curso. Si faltan datos historicos, pide a Administración completarlos en Rayos X.";
        } 
        else if (activeGoalView === 'STREET') {
            rows = [
                ...quotations.filter(q => ['PENDING_AUTH', 'AUTHORIZED'].includes(q.status)).map(quotationRow),
                ...orders.filter(o => normalizeSalesStatus(o.status) === 'WAITING_ADVANCE').map(orderRow),
            ];
            emptyMessage = "No tienes cotizaciones enviadas o esperando respuesta del cliente.";
        } 
        else if (activeGoalView === 'EFFECTIVENESS') {
            rows = [
                ...orders.filter(o => statusInList(o.status, STATUSES_CLOSED_SALE)).map(orderRow),
                ...quotations.filter(q => q.status === 'LOST').map(quotationRow),
            ];
            emptyMessage = "Aún no tienes proyectos ganados o perdidos para medir efectividad.";
        }

        if (rows.length === 0) return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">{emptyMessage}</div>;

        const goalColumns: VTableColumn<GoalRow>[] = [
            { key: 'clientName', label: 'Cliente', render: (row) => <span className="font-medium text-slate-600">{row.clientName}</span> },
            {
                key: 'folio',
                label: 'Folio / Proyecto',
                render: (row) => <span className="font-bold text-slate-800">{row.folio} - {row.project_name}</span>,
            },
            { key: 'statusLabel', label: 'Estatus', render: (row) => <Badge variant="secondary">{row.statusLabel}</Badge> },
        ];

        if (activeGoalView === 'CLOSED') {
            goalColumns.push(
                { key: 'client_po_folio', label: 'Folio OC', render: (row) => <span className="font-mono text-slate-700">{row.client_po_folio || '—'}</span> },
                {
                    key: 'client_po_date',
                    label: 'Fecha OC',
                    render: (row) => (
                        <span className="text-slate-600">{row.client_po_date ? new Date(row.client_po_date).toLocaleDateString('es-MX') : '—'}</span>
                    ),
                },
            );
        }

        goalColumns.push({
            key: 'total_price',
            label: 'Monto de Venta',
            render: (row) => <span className="block text-right font-bold text-slate-700">{formatCurrency(row.total_price)}</span>,
        });

        if (['COMMISSIONS', 'CLOSED', 'STREET'].includes(activeGoalView || '')) {
            goalColumns.push({
                key: 'commission_amount',
                label: 'Tu Comisión',
                render: (row) => <span className="block text-right font-black text-emerald-600">{formatCurrency(row.commission_amount)}</span>,
            });
        }

        if (activeGoalView === 'EFFECTIVENESS') {
            goalColumns.push({
                key: 'won',
                label: 'Resultado',
                render: (row) => (
                    <div className="text-center">
                        {row.won ? (
                            <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700"><CheckCircle size={12} className="mr-1"/> Ganada</span>
                        ) : (
                            <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700"><XCircle size={12} className="mr-1"/> Perdida</span>
                        )}
                    </div>
                ),
            });
        }

        goalColumns.push({
            key: 'actions',
            label: 'Acción',
            render: (row) => (
                <div className="flex justify-center items-center gap-2">
                    <Button variant="outline" size="sm" className="group border-slate-200 hover:bg-slate-50 px-2" title="Ver formato" aria-label="Ver formato"
                        onClick={() => (row.kind === 'OV' ? setViewingOrderIdForFormat(row.id) : navigate(`/quotations/${row.id}`))}>
                        <TableActionViewIcon />
                    </Button>
                    <Button variant="outline" size="sm" className="group border-indigo-200 hover:bg-indigo-50 px-2" title="Descargar PDF" aria-label="Descargar PDF"
                        onClick={() => (row.kind === 'OV' ? handleViewPDF(row.id) : handleQuotationPdf(row.id))}>
                        <FileDown size={TABLE_ACTION_ICON_SIZE} className="text-slate-500 group-hover:text-indigo-600 shrink-0" />
                    </Button>
                </div>
            ),
        });

        return (
            <VTable
                className="mt-6 animate-in slide-in-from-right-4 duration-300 shadow-sm"
                columns={goalColumns}
                data={rows}
            />
        );
    };

    const renderCollectionDetailTable = () => {
        let filteredOrders: SalesOrder[] = [];
        let emptyMessage = "No hay datos para mostrar.";

        if (activeCollectionView === 'RETAINED') {
            filteredOrders = orders.filter(o => normalizeSalesStatus(o.status) === 'WAITING_ADVANCE');
            emptyMessage = "No tienes comisiones retenidas. Todo está cobrado o en borrador.";
        } else if (activeCollectionView === 'PAYABLE') {
            filteredOrders = orders.filter(o => statusInList(o.status, STATUSES_PAYABLE_COMMISSION));
            emptyMessage = "No tienes comisiones liberadas para pago en este momento.";
        } else if (activeCollectionView === 'ADVANCES') {
            filteredOrders = orders.filter(o => normalizeSalesStatus(o.status) === 'WAITING_ADVANCE');
            emptyMessage = "Excelente, no hay anticipos pendientes por cobrar.";
        } 

        if (filteredOrders.length === 0) return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">{emptyMessage}</div>;

        const highlightLabel = ['RETAINED', 'PAYABLE'].includes(activeCollectionView || '')
            ? 'Tu Comisión'
            : 'Anticipo Requerido';

        const collectionColumns: VTableColumn<Record<string, unknown>>[] = [
            {
                key: 'client',
                label: 'Cliente',
                render: (row) => (
                    <span className="font-medium text-slate-600">{getClientName(row as SalesOrder)}</span>
                ),
            },
            {
                key: 'folio',
                label: 'Folio / Proyecto',
                render: (row) => {
                    const order = row as SalesOrder;
                    return (
                        <span className="font-bold text-slate-800">
                            OV-{order.id?.toString().padStart(4, '0')} - {order.project_name}
                        </span>
                    );
                },
            },
            {
                key: 'status',
                label: 'Estatus',
                render: (row) => (
                    <Badge variant="outline" className="bg-white">{getStatusLabel((row as SalesOrder).status)}</Badge>
                ),
            },
            {
                key: 'total_price',
                label: 'Monto Total',
                render: (row) => (
                    <span className="block text-right text-slate-500">
                        {formatCurrency(Number((row as SalesOrder).total_price) || 0)}
                    </span>
                ),
            },
            {
                key: 'highlight_value',
                label: highlightLabel,
                render: (row) => {
                    const order = row as SalesOrder;
                    const total = Number(order.total_price) || 0;
                    const comm = Number(order.commission_amount) || 0;
                    const advPerc = (order.advance_percent || 60) / 100;
                    let highlightValue = 0;
                    if (activeCollectionView === 'RETAINED' || activeCollectionView === 'PAYABLE') highlightValue = comm;
                    if (activeCollectionView === 'ADVANCES') highlightValue = total * advPerc;
                    return (
                        <span className="block text-right font-black text-indigo-600">
                            {formatCurrency(highlightValue)}
                        </span>
                    );
                },
            },
            {
                key: 'actions',
                label: 'Acción',
                render: (row) => {
                    const order = row as SalesOrder;
                    return (
                        <div className="flex justify-center items-center gap-2">
                            <Button variant="outline" size="sm" className="group border-slate-200 hover:bg-slate-50 px-2" title="Ver formato" aria-label="Ver formato" onClick={() => setViewingOrderIdForFormat(order.id!)}>
                                <TableActionViewIcon />
                            </Button>
                            <Button variant="outline" size="sm" className="group border-indigo-200 hover:bg-indigo-50 px-2" onClick={() => handleViewPDF(order.id!)} title="Descargar PDF" aria-label="Descargar PDF">
                                <FileDown size={TABLE_ACTION_ICON_SIZE} className="text-slate-500 group-hover:text-indigo-600 shrink-0" />
                            </Button>
                        </div>
                    );
                },
            },
        ];

        return (
            <VTable
                className="mt-6 animate-in slide-in-from-right-4 duration-300 shadow-sm"
                columns={collectionColumns}
                data={filteredOrders as unknown as Record<string, unknown>[]}
            />
        );
    };
    
    const renderQuoteDetailTable = () => {
        let filtered: Quotation[] = [];
        let emptyMessage = "No hay datos para mostrar.";

        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            filtered = quotations.filter(row =>
                `${row.folio} ${row.project_name || ''} ${row.client?.full_name || ''}`.toLowerCase().includes(q)
            );
            emptyMessage = `No se encontraron resultados para "${searchQuery}".`;
        }
        else if (activeQuoteView === 'DRAFTS') {
            filtered = quotations.filter(row => ['DRAFT', 'CHANGES_REQUESTED'].includes(row.status));
            emptyMessage = "Bandeja limpia. No tienes borradores ni cotizaciones regresadas por Dirección.";
        } else if (activeQuoteView === 'REVIEW') {
            filtered = quotations.filter(row => row.status === 'PENDING_AUTH');
            emptyMessage = "No tienes cotizaciones esperando autorización de Dirección.";
        } else if (activeQuoteView === 'AUTHORIZED') {
            filtered = quotations.filter(row => row.status === 'AUTHORIZED');
            emptyMessage = "No tienes cotizaciones autorizadas pendientes de OC del cliente.";
        } else if (activeQuoteView === 'EXPIRING') {
            filtered = quotations.filter(row => isExpiringQuotation(row));
            emptyMessage = "¡Excelente! Tu cartera está sana. Ninguna cotización vence en los próximos 15 días.";
        } else if (activeQuoteView === 'HISTORY') {
            filtered = [...quotations];
            emptyMessage = "Tu archivo histórico está vacío.";
        }

        const sellerOf = (row: Quotation) => row.user?.full_name || (row.user_id ? `Asesor #${row.user_id}` : 'N/A');
        if (quoteSortConfig.key) {
            const dir = quoteSortConfig.direction === 'asc' ? 1 : -1;
            const textKey = (row: Quotation): string => {
                if (quoteSortConfig.key === 'CLIENT') return (row.client?.full_name || '').toLowerCase();
                if (quoteSortConfig.key === 'SELLER') return sellerOf(row).toLowerCase();
                return QUOTATION_STATUS_LABELS[row.status].toLowerCase();
            };
            filtered.sort((a, b) => {
                if (quoteSortConfig.key === 'DATE') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
                if (quoteSortConfig.key === 'FOLIO') return (a.id - b.id) * dir;
                return textKey(a).localeCompare(textKey(b)) * dir;
            });
        }

        if (filtered.length === 0) return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">{emptyMessage}</div>;

        const quoteSortKeys: Array<{ key: 'DATE' | 'FOLIO' | 'CLIENT' | 'SELLER' | 'STATUS'; label: string }> = [
            { key: 'DATE', label: 'Fecha' },
            { key: 'FOLIO', label: 'Folio / Proyecto' },
            { key: 'CLIENT', label: 'Cliente' },
            ...(activeQuoteView === 'HISTORY' ? [{ key: 'SELLER' as const, label: 'Vendedor' }] : []),
            { key: 'STATUS', label: 'Estatus' },
        ];

        const reasonOf = (row: Quotation): string | null | undefined => {
            if (row.status === 'CHANGES_REQUESTED') return row.changes_requested_reason;
            if (row.status === 'LOST') return row.lost_reason;
            if (row.status === 'CANCELLED') return row.cancel_reason;
            return null;
        };

        const quoteColumns: VTableColumn<Quotation>[] = [
            {
                key: 'created_at',
                label: 'Fecha',
                render: (row) => <span className="text-slate-600 font-medium whitespace-nowrap">{new Date(row.created_at).toLocaleDateString('es-MX')}</span>,
            },
            {
                key: 'folio',
                label: 'Folio / Proyecto',
                render: (row) => (
                    <>
                        <p className="font-bold text-slate-800 whitespace-nowrap">{row.folio}</p>
                        <p className="text-xs text-slate-500 font-medium">{row.project_name}</p>
                    </>
                ),
            },
            { key: 'client', label: 'Cliente', render: (row) => <span className="font-medium text-slate-600">{row.client?.full_name || '—'}</span> },
        ];

        if (activeQuoteView === 'HISTORY') {
            quoteColumns.push({
                key: 'user',
                label: 'Vendedor',
                render: (row) => <span className="text-xs font-bold text-indigo-600 whitespace-nowrap">{sellerOf(row)}</span>,
            });
        }

        quoteColumns.push(
            {
                key: 'status',
                label: 'Estatus',
                render: (row) => {
                    const reason = reasonOf(row);
                    return (
                        <>
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${quotationStatusBadgeClass(row.status)}`}>
                                {QUOTATION_STATUS_LABELS[row.status]}
                            </span>
                            {reason && (
                                <p className="text-[10px] text-red-500 mt-1 max-w-[180px] truncate" title={reason}>Motivo: {reason}</p>
                            )}
                        </>
                    );
                },
            },
            {
                key: 'total_price',
                label: 'Monto de Venta',
                render: (row) => <span className="block text-right font-bold text-slate-700">{formatCurrency(row.total_price || 0)}</span>,
            },
            {
                key: 'actions',
                label: 'Acción',
                render: (row) => (
                    <QuotationRowActions
                        quotation={row}
                        onView={() => navigate(`/quotations/${row.id}`)}
                        onEdit={() => navigate(`/quotations/edit/${row.id}`)}
                        onReview={() => setReviewQuotationId(row.id)}
                        onPdf={() => void handleQuotationPdf(row.id)}
                        onAction={(kind) => openQuotationAction(kind, row)}
                    />
                ),
            },
        );

        return (
            <div className="mt-6 animate-in slide-in-from-right-4 duration-300">
                <div className="overflow-hidden rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 shadow-sm">
                    <div className="flex flex-wrap items-center gap-1 px-4 py-3 text-sm text-slate-500 border-b border-slate-200">
                        {quoteSortKeys.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                className="font-bold cursor-pointer hover:bg-slate-200 transition-colors select-none px-3 py-2 rounded inline-flex items-center"
                                onClick={() => handleQuoteSort(key)}
                            >
                                {label} {renderSortIcon(key)}
                            </button>
                        ))}
                    </div>
                </div>
                <VTable
                    className="rounded-t-none border-t-0 shadow-sm"
                    columns={quoteColumns}
                    data={filtered}
                />
            </div>
        );
    };

    // ── MONITOR OPERATIVO: estado de expansión y edición inline ───────
    const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
    const [instanceNames, setInstanceNames] = useState<Record<number, string>>({});
    const [savingInstances, setSavingInstances] = useState(false);
    const [savedOrders, setSavedOrders] = useState<Set<number>>(new Set());

    const toggleExpand = (orderId: number, instances: any[]) => {
        if (expandedOrderId === orderId) {
            setExpandedOrderId(null);
        } else {
            setExpandedOrderId(orderId);
            // Pre-populate names from existing data
            const initial: Record<number, string> = {};
            instances.forEach((inst: any) => { initial[inst.id] = inst.custom_name ?? ''; });
            setInstanceNames(prev => ({ ...prev, ...initial }));
            setSavedOrders(prev => { const n = new Set(prev); n.delete(orderId); return n; });
        }
    };

    const saveInstanceNames = async (orderId: number, instances: any[]) => {
        setSavingInstances(true);
        try {
            const { planningService: ps } = await import('../../../api/planning-service');
            await ps.baptizeInstances(
                orderId,
                instances.map((inst: any) => ({
                    instance_id: inst.id,
                    custom_name: (instanceNames[inst.id] ?? inst.custom_name).trim() || inst.custom_name,
                }))
            );
            setSavedOrders(prev => new Set([...prev, orderId]));
            await refetchOrders();
        } catch {
            toast.error('Error al guardar los alias. Verifica la conexión.');
        } finally {
            setSavingInstances(false);
        }
    };

    // ── SEMÁFOROS DE PRODUCCIÓN ────────────────────────────────────────
    const SEMAPHORE_MAP: Record<string, { dot: string; label: string; bg: string; text: string }> = {
        GRAY:         { dot: '⬜', label: 'Sin iniciar',        bg: 'bg-slate-100',   text: 'text-slate-500'  },
        YELLOW:       { dot: '🟡', label: 'Alerta ≤15 días',    bg: 'bg-amber-50',    text: 'text-amber-700'  },
        RED:          { dot: '🔴', label: 'Crítico / Vencido',  bg: 'bg-red-50',      text: 'text-red-700'    },
        BLUE:         { dot: '🔵', label: 'En Producción',       bg: 'bg-blue-50',     text: 'text-blue-700'   },
        BLUE_GREEN:   { dot: '🔵🟢', label: 'Listo p/ Instalar', bg: 'bg-teal-50',     text: 'text-teal-700'   },
        DOUBLE_BLUE:  { dot: '🔵🔵', label: 'En Producción',     bg: 'bg-blue-50',     text: 'text-blue-700'   },
        GREEN:        { dot: '🟢', label: 'Instalado',           bg: 'bg-emerald-50',  text: 'text-emerald-700'},
        DOUBLE_GREEN: { dot: '🟢🟢', label: 'Completado',        bg: 'bg-emerald-50',  text: 'text-emerald-700'},
        WARRANTY:     { dot: '⚠️', label: 'En Garantía',         bg: 'bg-yellow-50',   text: 'text-yellow-700' },
    };

    const getSemaphoreInfo = (semaphore?: string | null) =>
        SEMAPHORE_MAP[semaphore ?? 'GRAY'] ?? SEMAPHORE_MAP['GRAY'];

    // ── MONITOR OPERATIVO: Render ──────────────────────────────────────
    const renderMonitorSection = () => {
        // Ampliado: cualquier OV confirmada o en proceso
        const ACTIVE_STATUSES = ['WAITING_ADVANCE', 'SOLD', 'IN_PRODUCTION', 'FINISHED', 'COMPLETED'];
        const activeOrders = orders.filter(o =>
            ACTIVE_STATUSES.includes(o.status) && !cancelledOvIds.has(o.id as number)
        );

        const sortedOrders = [...activeOrders].sort((a, b) => {
            const dir = monitorSort.direction === 'asc' ? 1 : -1;
            if (monitorSort.key === 'FOLIO') {
                return ((a.id || 0) - (b.id || 0)) * dir;
            }
            if (monitorSort.key === 'CLIENT') {
                const av = getClientName(a).toLowerCase();
                const bv = getClientName(b).toLowerCase();
                if (av < bv) return -1 * dir;
                if (av > bv) return 1 * dir;
                return 0;
            }
            // AGE = antigüedad por created_at ('desc' = más recientes primero)
            const da = new Date((a as any).created_at || 0).getTime();
            const db = new Date((b as any).created_at || 0).getTime();
            return (da - db) * dir;
        });

        const STATUS_COLORS: Record<string, string> = {
            'WAITING_ADVANCE': 'bg-amber-50 text-amber-700 border-amber-200',
            'SOLD':            'bg-emerald-50 text-emerald-700 border-emerald-200',
            'IN_PRODUCTION':   'bg-blue-50 text-blue-700 border-blue-200',
            'FINISHED':        'bg-violet-50 text-violet-700 border-violet-200',
            'COMPLETED':       'bg-slate-100 text-slate-600 border-slate-200',
        };

        if (activeOrders.length === 0) {
            return (
                <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <Users size={36} className="mx-auto mb-3 opacity-20" />
                    <p className="font-bold text-slate-600">No hay proyectos activos en este momento.</p>
                    <p className="text-sm mt-1">Aparecerán las OVs en estatus Esperando Anticipo, Vendida, En Producción o Finalizada.</p>
                </div>
            );
        }

        return (
            <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
                {/* Sub-header */}
                <div className="flex items-center justify-between px-2">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                        <Users size={14} /> Órdenes de Venta Activas
                        <span className="bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 text-[10px]">
                            {activeOrders.length}
                        </span>
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">Ordenar:</span>
                        {(['FOLIO','CLIENT','AGE'] as const).map(k => {
                            const label = k === 'FOLIO' ? 'Folio' : k === 'CLIENT' ? 'Cliente' : 'Antigüedad';
                            const active = monitorSort.key === k;
                            return (
                                <button
                                    key={k}
                                    onClick={() => handleMonitorSort(k)}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {label}{active ? (monitorSort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {sortedOrders.map(order => {
                    const instances: any[] = (order.items ?? []).flatMap((it: any) => (it.instances ?? []).filter((inst: any) => !inst.is_cancelled));
                    const isExpanded = expandedOrderId === order.id;
                    const colorClass = STATUS_COLORS[order.status] ?? 'bg-slate-50 text-slate-600 border-slate-200';
                    const hasUnnamed = instances.some((inst: any) =>
                        !inst.custom_name || /^.+\s*-\s*instancia\s+\d+$/i.test(inst.custom_name)
                    );
                    const isSaved = savedOrders.has(order.id!);

                    return (
                        <div
                            key={order.id}
                            className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${isExpanded ? 'border-indigo-300 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                            {/* ── OV Header Row (clickable) ── */}
                            <button
                                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                                onClick={() => toggleExpand(order.id!, instances)}
                            >
                                {/* Expand icon */}
                                <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-800 text-sm">
                                            OV-{String(order.id).padStart(4,'0')}
                                        </p>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}>
                                            {getStatusLabel(order.status)}
                                        </span>
                                        {hasUnnamed && !isSaved && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold border border-amber-200">
                                                🏷️ Alias pendientes
                                            </span>
                                        )}
                                        {isSaved && (
                                            <span className="text-[9px] text-emerald-600 font-bold">✓ Guardado</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">{order.project_name} — {getClientName(order)}</p>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewPDF(order.id!);
                                        }}
                                        className="text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2 py-1.5 rounded-lg transition-colors"
                                        title="Descargar PDF"
                                    >
                                        <FileDown size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setRayosXOrder(order);
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-black rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 transform hover:-translate-y-0.5"
                                    >
                                        <FileSearch size={14} />
                                        Rayos X
                                    </button>
                                    <p className="text-sm font-bold text-slate-700">{formatCurrency(order.total_price || 0)}</p>
                                    {instances.length > 0 && (
                                        <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 font-medium">
                                            {instances.length} instancia{instances.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </button>

                            {/* ── Expanded: abre el bautizo por casa (modal) ── */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                                    {instances.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-4">
                                            Esta OV no tiene instancias generadas todavía.
                                        </p>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-slate-600">
                                                {instances.length} instancia{instances.length !== 1 ? 's' : ''} en esta OV.
                                                Agrúpalas por casa (calle + lote) y asígnales su nombre.
                                            </p>
                                            <button
                                                onClick={() => setBaptismOrderId(order.id!)}
                                                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
                                            >
                                                Bautizar / Agrupar por casa
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">{getSectionTitle()}</h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        {activeSection === null
                            ? 'Radar de ventas, comisiones y seguimiento de clientes.'
                            : activeCollectionView === 'AR_AGING'
                              ? 'Antigüedad de saldos — misma cartera que Administración y Tesorería (C).'
                              : activeCollectionView !== null
                                ? 'Desglose detallado de Cobranza.'
                                : activeQuoteView !== null
                                  ? 'Detalle de cotizaciones.'
                                  : activeGoalView !== null
                                    ? 'Detalle de metas y comisiones.'
                                    : 'Ejecución y detalle operativo.'}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={() => navigate('/quotations/new')} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-2"><Plus size={18} /> Nueva Cotización</Button>
                    {activeSection !== null && (
                        <button onClick={handleBack} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-sm">
                            <ArrowLeft size={18} /> {(activeGoalView || activeQuoteView || activeCollectionView) ? 'Regresar a Tarjetas' : 'Regresar al Tablero'}
                        </button>
                    )}
                </div>
            </div>

            {activeSection === null && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
                    
                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('GOALS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black transition-colors group-hover:bg-emerald-100 ${getCountSize(stats.activeCommCount)}`}>
                                {stats.activeCommCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">1. Mis Ingresos</p>
                                    <Target size={16} className="text-emerald-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                                        {formatCurrency(stats.commGenerated)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Comisión Generada</p>
                                    <TrendingUp size={14} className="text-emerald-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('QUOTES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-blue-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black transition-colors group-hover:bg-blue-100 ${getCountSize(stats.drafts + stats.inReview + stats.authorized)}`}>
                               {stats.drafts + stats.inReview + stats.authorized}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Cotizaciones</p>
                                    <FileText size={16} className="text-blue-500" />
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Click para Buscar</p>
                                    <Search size={14} className="text-blue-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('COLLECTIONS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black transition-colors group-hover:bg-amber-100 ${getCountSize(stats.pendingAdvance + stats.pendingInvoices)}`}>
                                {stats.pendingAdvance + stats.pendingInvoices}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">3. Cobranza</p>
                                    <Coins size={16} className="text-amber-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-lg font-black text-amber-600 tracking-tight leading-none truncate">
                                        {formatCurrency(stats.advanceVal + stats.invoicesVal)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Total por Cobrar (Vivo)</p>
                                    <Wallet size={14} className="text-amber-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('MONITOR')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 ${getCountSize(stats.activeProjectsCount)}`}>
                                {stats.activeProjectsCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Monitor Operativo</p>
                                    <Users size={16} className="text-indigo-500" />
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">OVs Activas + Bautizo</p>
                                    <Search size={14} className="text-indigo-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => navigate('/ov-tracking')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-600 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 text-2xl">
                                🏘️
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">5. Seguimiento</p>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-700 leading-tight">Seguimiento<br/>de OV</h3>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Casas por OV activa</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {activeSection !== null && (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500 mt-2">

                    {activeSection === 'GOALS' && (
                        <>
                            {activeGoalView === null ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveGoalView('COMMISSIONS')} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(stats.wonCount)}`}>
                                                {stats.wonCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><BadgeDollarSign size={18} className="text-emerald-500"/> A. Comisiones Generadas</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Tu dinero ganado en el mes.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-emerald-200 group-hover:text-emerald-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-emerald-600 text-right leading-none truncate">{formatCurrency(stats.commGenerated)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative min-h-40">
                                        <Card onClick={() => setActiveGoalView('CLOSED')} className="p-6 border-l-4 border-l-blue-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black group-hover:bg-blue-100 transition-colors ${getCountSize(stats.closedOrdersMonthCount ?? 0)}`}>
                                                {stats.closedOrdersMonthCount ?? 0}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2 gap-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-blue-500"/> B. Venta Cerrada</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-1">Suma del mes (fecha OC) vs tu meta mensual.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-blue-200 group-hover:text-blue-500 transform rotate-180 transition-all shrink-0"/>
                                                </div>
                                                <div className="text-lg font-black text-blue-600 text-right leading-tight">
                                                    {formatCurrency(stats.closedSalesMonth ?? 0)}
                                                    <span className="block text-[11px] font-bold text-slate-400 mt-1">
                                                        {monthlyQuota > 0
                                                            ? <>de {formatCurrency(monthlyQuota)}</>
                                                            : <>sin meta configurada</>}
                                                    </span>
                                                </div>
                                                {stats.quotaProgressPct !== null && monthlyQuota > 0 && (
                                                    <div className={`text-right text-sm font-black ${stats.quotaProgressTone || 'text-slate-600'}`}>
                                                        {stats.quotaProgressPct}% alcanzado
                                                    </div>
                                                )}
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveGoalView('STREET')} className="p-6 border-l-4 border-l-indigo-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black group-hover:bg-indigo-100 transition-colors ${getCountSize(stats.streetCount)}`}>
                                                {stats.streetCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                       <h4 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={18} className="text-indigo-500"/> C. Comisiones por Confirmar</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Tu dinero en cotizaciones "Enviadas".</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-indigo-200 group-hover:text-indigo-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-indigo-600 text-right leading-none truncate">{formatCurrency(stats.moneyOnStreet)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveGoalView('EFFECTIVENESS')} className="p-6 border-l-4 border-l-slate-800 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-100 text-slate-700 border-r border-slate-200 font-black group-hover:bg-slate-200 transition-colors ${getCountSize(stats.totalResolved)}`}>
                                                {stats.totalResolved}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><Target size={18} className="text-slate-600"/> D. Efectividad</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Éxito (Ganadas vs Perdidas).</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-slate-300 group-hover:text-slate-600 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-slate-800 text-right leading-none truncate">{stats.battingRate}% <span className="text-sm font-normal text-slate-400">De Bateo</span></div>
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            ) : ( renderGoalDetailTable() )}
                        </>
                    )}

                    {activeSection === 'QUOTES' && (
                        <div className="space-y-6">
                            {activeQuoteView === null && (
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                    <Search className="text-slate-400 shrink-0" />
                                    <Input
                                        type="text"
                                        placeholder="Buscar por Folio (ej. 12) o Proyecto..."
                                        className="border-0 shadow-none bg-transparent font-medium focus-visible:ring-0"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-red-500 transition-colors">
                                            <XCircle size={18} />
                                        </button>
                                    )}
                                </div>
                            )}

                            {activeQuoteView === null && !searchQuery ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    
                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('DRAFTS')} className="p-6 border-l-4 border-l-slate-400 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-600 border-r border-slate-200 font-black group-hover:bg-slate-100 transition-colors ${getCountSize(stats.drafts)}`}>
                                                {stats.drafts}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><FileSignature size={18} className="text-slate-500"/> A. Borradores</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Propuestas en armado hoy.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-slate-300 group-hover:text-slate-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-slate-600 text-right leading-none truncate">{formatCurrency(stats.draftsVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('REVIEW')} className="p-6 border-l-4 border-l-amber-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black group-hover:bg-amber-100 transition-colors ${getCountSize(stats.inReview)}`}>
                                                {stats.inReview}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-amber-800 flex items-center gap-2"><ShieldAlert size={18} className="text-amber-500"/> B. En Revisión (Freno)</h4>
                                                        <p className="text-sm text-amber-700/80 mt-1 mb-2 truncate">Esperando a Dirección.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-amber-300 group-hover:text-amber-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-amber-600 text-right leading-none truncate">{formatCurrency(stats.reviewVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('AUTHORIZED')} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(stats.authorized)}`}>
                                                {stats.authorized}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500"/> C. Autorizadas</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Listas para enviar/cobrar.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-emerald-200 group-hover:text-emerald-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-emerald-600 text-right leading-none truncate">{formatCurrency(stats.authVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('EXPIRING')} className="p-6 border-l-4 border-l-red-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black group-hover:bg-red-100 transition-colors ${getCountSize(stats.expiring)}`}>
                                                {stats.expiring}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-red-800 flex items-center gap-2"><CalendarClock size={18} className="text-red-500"/> D. Radar de Vigencia</h4>
                                                        <p className="text-sm text-red-600/80 mt-1 mb-2 truncate">Cotizaciones a punto de vencer.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-red-300 group-hover:text-red-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-red-600 text-right leading-none truncate">{formatCurrency(stats.expiringVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('HISTORY')} className="p-6 border-l-4 border-l-slate-700 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-800 border-r border-slate-200 font-black group-hover:bg-slate-100 transition-colors ${getCountSize(stats.historyCount)}`}>
                                                {stats.historyCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><Archive size={18} className="text-slate-600"/> E. Histórico General</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Todas tus cotizaciones.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-slate-300 group-hover:text-slate-600 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-slate-700 text-right leading-none truncate">{stats.historyCount} <span className="text-sm font-normal text-slate-400">Docs</span></div>
                                            </div>
                                        </Card>
                                    </div>
                                    
                                </div>
                            ) : ( 
                                renderQuoteDetailTable() 
                            )}
                        </div>
                    )}

                    {activeSection === 'MONITOR' && renderMonitorSection()}

                    {activeSection === 'COLLECTIONS' && (
                        <>
                            {activeCollectionView === null ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveCollectionView('RETAINED')} className="p-6 border-l-4 border-l-red-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black group-hover:bg-red-100 transition-colors ${getCountSize(stats.retainedCount)}`}>
                                                {stats.retainedCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-red-800 flex items-center gap-2"><Lock size={18} className="text-red-500"/> A. Comisiones Retenidas</h4>
                                                        <p className="text-sm text-red-600/80 mt-1 mb-2 truncate">El cliente no ha pagado anticipo.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-red-200 group-hover:text-red-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-red-600 text-right leading-none truncate">{formatCurrency(stats.retainedComm)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveCollectionView('PAYABLE')} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(stats.payableCount)}`}>
                                                {stats.payableCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-emerald-800 flex items-center gap-2"><Unlock size={18} className="text-emerald-500"/> B. Comisiones Pagables</h4>
                                                        <p className="text-sm text-emerald-700/80 mt-1 mb-2 truncate">Liberadas para pagarse en nómina.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-emerald-200 group-hover:text-emerald-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-emerald-600 text-right leading-none truncate">{formatCurrency(stats.payableComm)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveCollectionView('ADVANCES')} className="p-6 border-l-4 border-l-amber-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black group-hover:bg-amber-100 transition-colors ${getCountSize(stats.pendingAdvance)}`}>
                                                {stats.pendingAdvance}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500"/> C. Anticipos Pendientes</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Ventas bloqueadas por depósito.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-amber-300 group-hover:text-amber-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-amber-600 text-right leading-none truncate">{formatCurrency(stats.advanceVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveCollectionView('AR_AGING')} className="p-6 border-l-4 border-l-indigo-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black group-hover:bg-indigo-100 transition-colors ${getCountSize(stats.pendingInvoices)}`}>
                                                {stats.pendingInvoices}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><FileSearch size={18} className="text-indigo-500"/> D. Cuentas por Cobrar</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Misma cartera que Administración — facturas pendientes de cobro.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-indigo-200 group-hover:text-indigo-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-indigo-600 text-right leading-none truncate">{formatCurrency(stats.invoicesVal)}</div>
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            ) : activeCollectionView === 'AR_AGING' ? (
                                <AccountsReceivableAgingPanel
                                    variant="embedded"
                                    suppressTopBar
                                    onEmbeddedBack={() => setActiveCollectionView(null)}
                                />
                            ) : (
                                renderCollectionDetailTable()
                            )}
                        </>
                    )}
                </div>
            )}

            {/* SE MANTIENE EL MODAL DE FORMATOS PARA PROCESOS ACTIVOS */}
            {viewingOrderIdForFormat !== null && (
                <SalesOrderDetailModal 
                    orderId={viewingOrderIdForFormat}
                    onClose={() => setViewingOrderIdForFormat(null)}
                />
            )}
            
            {/* EL MODAL DE AUDITORÍA HISTÓRICA — doble guarda: botón oculto + render bloqueado */}
            {viewingOrderIdForAudit !== null && canAudit && (
                <FinancialReviewModal 
                    orderId={viewingOrderIdForAudit}
                    onClose={() => setViewingOrderIdForAudit(null)}
                    readOnly={true}
                />
            )}

            {rayosXOrder && (
                <OrderStatementModal
                    isOpen={!!rayosXOrder}
                    onClose={() => setRayosXOrder(null)}
                    order={rayosXOrder}
                    onSuccess={async () => {
                        const affectedId = rayosXOrder?.id;
                        setRayosXOrder(null);
                        await refetchOrders();
                        // Refresco puntual de la OV afectada: solo sale del monitor si de verdad quedó cancelada
                        if (affectedId != null) {
                            try {
                                const fresh = await salesService.getOrderDetail(affectedId);
                                if (isCancelledOrder(fresh)) {
                                    setCancelledOvIds(prev => new Set(prev).add(affectedId));
                                } else {
                                    patchOrderInCache(affectedId, fresh as SalesOrder);
                                    setExpandedOrderId(affectedId);
                                }
                            } catch {
                                /* el listado ya se actualizó con refetchOrders */
                            }
                        }
                    }}
                    onOrderPatch={(patch) =>
                        setRayosXOrder((prev) => (prev ? { ...prev, ...patch } : null))
                    }
                    readOnly={true}
                />
            )}

            {/* MODAL DE BAUTIZO DE INSTANCIAS */}
            {baptismOrderId !== null && (
                <BaptismModal
                    orderId={baptismOrderId}
                    order={orders.find(o => o.id === baptismOrderId) ?? null}
                    onClose={() => setBaptismOrderId(null)}
                    onComplete={async () => {
                        const orderIdToRefresh = baptismOrderId;
                        setBaptismOrderId(null);
                        await refetchOrders();
                        if (orderIdToRefresh != null) {
                            try {
                                const fresh = await salesService.getOrderDetail(orderIdToRefresh);
                                patchOrderInCache(orderIdToRefresh, fresh);
                            } catch {
                                /* el listado ya se actualizó con refetchOrders */
                            }
                        }
                    }}
                />
            )}

            <QuotationActionDialogs
                pending={quotationAction}
                onClose={() => setQuotationAction(null)}
                onDone={refreshAfterQuotationAction}
            />

            {reviewQuotationId !== null && (
                <FinancialReviewModal
                    quotationId={reviewQuotationId}
                    onClose={() => setReviewQuotationId(null)}
                    onOrderUpdated={() => void refreshAfterQuotationAction()}
                />
            )}

        </div>
    );
};

export default SalesDashboardPage;