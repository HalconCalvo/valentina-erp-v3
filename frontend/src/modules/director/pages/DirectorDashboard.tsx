import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    TrendingUp, Factory, DollarSign, Scale, Activity,
    ArrowLeft, AlertTriangle, Clock, CheckCircle,
    BarChart3, Target, AlertCircle, PieChart, ShieldAlert,
    ThumbsUp, ThumbsDown, Package, Layers, ArrowLeftCircle,
    FileSearch, RefreshCw, Lock, XCircle, Wallet, Users, Shield
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { VTable, type VTableColumn } from '@/components/ui/VTable';

// --- SERVICIOS ---
import { FinancialReviewModal } from '../../management/components/FinancialReviewModal';
import { ChangeOrderReviewModal } from '../../management/components/ChangeOrderReviewModal';
import { changeOrderService } from '../../../api/change-order-service';
import { quotationService } from '../../../api/quotation-service';
import axiosClient from '../../../api/axios-client';
import type { Quotation } from '../../../types/quotations';
import { salesService } from '../../../api/sales-service';
import { planningService, type UnstaffedInstallation } from '../../../api/planning-service';
import {
    analyticsService,
    type AmountLine,
    type CashFlowProjection,
    type ClientPaymentSpeedRow,
    type ClientSalesRow,
    type DirectorSummary,
    type LaneSalesRow,
    type OrderMarginRow,
} from '../../../api/analytics-service';
import { SalesOrder } from '../../../types/sales';
import { formatDate, formatMoney } from '@/utils/format';
import Modal from '@/components/ui/Modal';

// Posibles vistas desplegables (Nivel 1)
type DirectorSection = 'SALES' | 'OPERATIONS' | 'LIQUIDITY' | 'PROFITABILITY' | 'EFFICIENCY' | 'CXC_AGING' | 'TOP_CLIENTS' | null;

// Posibles vistas de detalle para VENTAS (Nivel 2 -> 3)
type SalesDetailView = 'PENDING_AUTH' | 'SENT_CLIENT' | 'RED_LIGHT' | 'BATTING_RATE' | null;

type HealthInstance = {
    id: number;
    order_folio?: string;
    project_name?: string;
    client_name?: string;
    custom_name?: string;
    delivery_deadline?: string;
    semaphore?: string;
    semaphore_label?: string;
};

const DirectorDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // --- ESTADOS BASE Y MEMORIA DE SESIÓN ---
    const [isLoading, setIsLoading] = useState(true);
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [reviewQuotationId, setReviewQuotationId] = useState<number | null>(null);
    const [reviewChangeId, setReviewChangeId] = useState<number | null>(null);

    const [activeSection, setActiveSection] = useState<DirectorSection>(
        (sessionStorage.getItem('dir_activeSection') as DirectorSection) || null
    );
    const [activeSalesView, setActiveSalesView] = useState<SalesDetailView>(
        (sessionStorage.getItem('dir_activeSalesView') as SalesDetailView) || null
    );

    // --- GUARDADO EN MEMORIA ---
    useEffect(() => {
        if (activeSection) sessionStorage.setItem('dir_activeSection', activeSection);
        else sessionStorage.removeItem('dir_activeSection');
    }, [activeSection]);

    useEffect(() => {
        if (activeSalesView) sessionStorage.setItem('dir_activeSalesView', activeSalesView);
        else sessionStorage.removeItem('dir_activeSalesView');
    }, [activeSalesView]);

    // --- MÉTRICAS REALES DE VENTAS ---
    const [pendingAuthOrders, setPendingAuthOrders] = useState<Quotation[]>([]);
    const [sentClientOrders, setSentClientOrders] = useState<Quotation[]>([]);
    const [moneySentClient, setMoneySentClient] = useState(0);
    const [battingRate, setBattingRate] = useState(0);
    
    // --- ESTADO PARA FIRMAS DE COMPRAS ---
    const [pendingPurchaseAuths, setPendingPurchaseAuths] = useState<number>(0);

    const [selectedHealthGroup, setSelectedHealthGroup] = useState<{
        title: string;
        color: string;
        instances: any[];
    } | null>(null);

    const [healthData, setHealthData] = useState<{
        counts: {
            RED: number;
            YELLOW: number;
            BLUE: number;
            BLUE_GREEN: number;
            DOUBLE_BLUE: number;
            GREEN: number;
            GRAY: number;
        };
        critical: any[];
        alerts: any[];
        in_process: any[];
        ready_to_install: any[];
    } | null>(null);

    const [showOverheadDetail, setShowOverheadDetail] = useState(false);
    const [showPayrollDetail, setShowPayrollDetail] = useState(false);
    const [showPiecesDetail, setShowPiecesDetail] = useState(false);

    const [costKpi, setCostKpi] = useState<{
        cost_per_piece: number;
        overhead_per_piece: number;
        payroll_per_piece: number;
        pieces_produced: number;
        overhead_total: number;
        payroll_production: number;
        payroll_admin?: number;
        payroll_design_sales?: number;
        total_cost: number;
        overhead_by_category: Record<string, number>;
        has_weekly_payroll: boolean;
        week_start: string;
        week_end: string;
        pieces_mdf: number;
        pieces_stone: number;
        maquila_total: number;
        maquila_by_instance: Array<{
            instance_id: number;
            total: number;
            provider_name: string;
        }>;
    } | null>(null);

    // One source for Ventas, Liquidez, Rentabilidad, Cartera and Top clientes (amounts without VAT)
    const [summary, setSummary] = useState<DirectorSummary | null>(null);
    const [cashFlow, setCashFlow] = useState<CashFlowProjection | null>(null);
    // Ruta Crítica: installations without crew 3 days away or less (Gabriel, 12/10)
    const [urgentUnstaffed, setUrgentUnstaffed] = useState<UnstaffedInstallation[]>([]);
    const [liquidityDetail, setLiquidityDetail] = useState<'BANKS' | 'RECEIVABLES' | 'INVENTORY' | 'PAYABLES' | null>(null);
    const liquidityNet = summary?.liquidity.net ?? 0;

    useEffect(() => {
        loadData(); 
        const interval = setInterval(() => { loadData(true); }, 15000);
        return () => clearInterval(interval); 
    }, []);

    useEffect(() => {
        if (location.state?.reset) {
            setActiveSection(null);
            setActiveSalesView(null);
            sessionStorage.removeItem('dir_activeSection');
            sessionStorage.removeItem('dir_activeSalesView');
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const loadData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {

            // 2. Cargar Ventas y calcular usando la meta leída
            const data = await salesService.getOrders();
            const uniqueOrders = data ? Array.from(new Map(data.map((o: SalesOrder) => [o.id, o])).values()) : [];
            setOrders(uniqueOrders);
            const quotations = await quotationService.listQuotations().catch(() => [] as Quotation[]);
            const pendingChanges = await changeOrderService.list({ status: 'PENDING_AUTH' }).catch(() => [] as Quotation[]);
            calculateSalesMetrics(uniqueOrders, quotations, pendingChanges);

            // 3. Cargar Notificaciones de Compras en vivo
            try {
                const { data: notifData } = await axiosClient.get('/purchases/notifications/pending-tasks');
                setPendingPurchaseAuths(notifData?.orders_to_authorize || 0);
            } catch {
                /* ignore optional notifications fetch errors */
            }

            // COST KPI
            try {
                const { data: kpiData } = await axiosClient.get('/treasury/cost-kpi');
                setCostKpi(kpiData);
            } catch {
                /* ignore cost kpi errors */
            }

            try {
                const [dashboard, flow] = await Promise.all([
                    analyticsService.getDirectorSummary(),
                    analyticsService.getCashFlowProjection().catch(() => null),
                ]);
                setSummary(dashboard);
                setCashFlow(flow);
            } catch {
                /* ignore summary fetch errors */
            }

            try {
                const unstaffed = await planningService.getUnstaffedInstallations();
                setUrgentUnstaffed(unstaffed.filter(row => row.is_urgent));
            } catch {
                /* ignore unstaffed errors */
            }

            try {
                const { data: healthJson } = await axiosClient.get('/planning/instances/health');
                setHealthData(healthJson);
            } catch {
                /* ignore health errors */
            }

        } catch {
            /* ignore dashboard load errors */
        } finally {
            if (!silent) setIsLoading(false);
        }
    };
    
    const calculateSalesMetrics = (allOrders: SalesOrder[], quotations: Quotation[], pendingChanges: Quotation[] = []) => {
        // Change orders (CAM) waiting for the Director are reviewed in the same list as quotations.
        setPendingAuthOrders([...quotations.filter(q => q.status === 'PENDING_AUTH'), ...pendingChanges]);

        const sent = quotations.filter(q => q.status === 'AUTHORIZED');
        setSentClientOrders(sent);
        const moneySent = sent.reduce((sum, q) => sum + (Number(q.total_price) || 0), 0);
        setMoneySentClient(moneySent);

        const won = allOrders.filter(o => ['SOLD', 'INSTALLED', 'FINISHED'].includes(o.status)).length;
        const lost = quotations.filter(q => q.status === 'LOST').length;
        const totalResolved = won + lost;
        setBattingRate(totalResolved > 0 ? Math.round((won / totalResolved) * 100) : 0);
    };

    const formatCurrency = (amount: number) => formatMoney(amount);
    const formatPercent = (value: number) =>
        new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

    const formatMarginPercent = (value: number | null | undefined) =>
        value === null || value === undefined ? 'Sin costo' : `${formatPercent(value)}%`;

    const salesDetailColumns: VTableColumn<Quotation>[] = useMemo(
        () => [
            {
                key: 'folio',
                label: 'Folio / Proyecto',
                render: (quotation) => (
                    <span className="font-bold text-slate-800">
                        {quotation.folio} - {quotation.project_name}
                    </span>
                ),
            },
            {
                key: 'seller',
                label: 'Vendedor',
                render: (quotation) => <span className="text-slate-600">{quotation.user?.full_name || 'Comercial'}</span>,
            },
            {
                key: 'valid_until',
                label: 'Fecha Límite',
                render: (order) => (
                    <span className="text-slate-600">
                        {order.valid_until ? new Date(order.valid_until).toLocaleDateString() : 'N/A'}
                    </span>
                ),
            },
            {
                key: 'total_price',
                label: 'Monto Total',
                render: (order) => (
                    <span className="block text-right font-bold text-indigo-700">
                        {formatCurrency(order.total_price || 0)}
                    </span>
                ),
            },
            {
                key: 'action',
                label: 'Acción',
                render: (order) => (
                    <div className="flex items-center justify-center gap-2">
                        {activeSalesView === 'PENDING_AUTH' ? (
                            <Button
                                size="sm"
                                className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
                                onClick={() => (order.kind === 'CHANGE_ORDER' ? setReviewChangeId(order.id) : setReviewQuotationId(order.id))}
                            >
                                <FileSearch size={14} className="mr-1" /> Revisar / Autorizar
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-white shadow-sm"
                                onClick={() => setReviewQuotationId(order.id)}
                            >
                                <FileSearch size={14} className="mr-1" /> Auditar Detalle
                            </Button>
                        )}
                    </div>
                ),
            },
        ],
        [activeSalesView],
    );

    const profitabilityColumns: VTableColumn<OrderMarginRow>[] = useMemo(
        () => [
            { key: 'folio', label: 'OV', render: (row) => <span className="font-bold text-slate-800">{row.folio}</span> },
            { key: 'client_name', label: 'Cliente', render: (row) => <span className="text-slate-600">{row.client_name}</span> },
            {
                key: 'sales_without_tax',
                label: 'Venta sin IVA',
                render: (row) => <span className="block text-right font-bold text-slate-800">{formatCurrency(row.sales_without_tax)}</span>,
            },
            {
                key: 'cost',
                label: 'Costo',
                render: (row) => <span className="block text-right text-slate-600">{formatCurrency(row.cost)}</span>,
            },
            {
                key: 'commission',
                label: 'Comisión',
                render: (row) => <span className="block text-right text-slate-600">{formatCurrency(row.commission)}</span>,
            },
            {
                key: 'net_margin_percent',
                label: 'Margen neto % sobre venta',
                render: (row) => (
                    <span className={`block text-right font-black ${(row.net_margin_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatMarginPercent(row.net_margin_percent)}
                    </span>
                ),
            },
        ],
        [],
    );

    const clientSalesColumns: VTableColumn<ClientSalesRow & { position: number }>[] = useMemo(
        () => [
            { key: 'position', label: '#', render: (row) => <span className="font-black text-indigo-600">{row.position}</span> },
            { key: 'client_name', label: 'Cliente', render: (row) => <span className="font-bold text-slate-800">{row.client_name}</span> },
            { key: 'orders', label: 'OVs', render: (row) => <span className="block text-center text-slate-600">{row.orders}</span> },
            {
                key: 'sales_without_tax',
                label: 'Venta sin IVA',
                render: (row) => <span className="block text-right font-bold text-emerald-700">{formatCurrency(row.sales_without_tax)}</span>,
            },
            {
                key: 'net_margin_percent',
                label: 'Margen neto % sobre venta',
                render: (row) => (
                    <span className={`block text-right font-black ${(row.net_margin_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatMarginPercent(row.net_margin_percent)}
                    </span>
                ),
            },
        ],
        [],
    );

    const paymentSpeedColumns: VTableColumn<ClientPaymentSpeedRow & { position: number }>[] = useMemo(
        () => [
            { key: 'position', label: '#', render: (row) => <span className="font-black text-indigo-600">{row.position}</span> },
            { key: 'client_name', label: 'Cliente', render: (row) => <span className="font-bold text-slate-800">{row.client_name}</span> },
            {
                key: 'collected',
                label: 'Cobrado en el año (con IVA)',
                render: (row) => <span className="block text-right text-slate-700">{formatCurrency(row.collected)}</span>,
            },
            {
                key: 'avg_days_to_collect',
                label: 'Días de factura a cobro',
                render: (row) => <span className="block text-right font-black text-slate-800">{formatPercent(row.avg_days_to_collect)}</span>,
            },
        ],
        [],
    );

    const laneColumns: VTableColumn<LaneSalesRow>[] = useMemo(
        () => [
            { key: 'lane', label: 'Carril', render: (row) => <span className="font-bold text-slate-800">{row.lane}</span> },
            {
                key: 'sales_without_tax',
                label: 'Venta sin IVA',
                render: (row) => <span className="block text-right font-bold text-slate-800">{formatCurrency(row.sales_without_tax)}</span>,
            },
            {
                key: 'cost',
                label: 'Costo',
                render: (row) => <span className="block text-right text-slate-600">{formatCurrency(row.cost)}</span>,
            },
            {
                key: 'commission',
                label: 'Comisión',
                render: (row) => <span className="block text-right text-slate-600">{formatCurrency(row.commission)}</span>,
            },
            {
                key: 'net_margin_percent',
                label: 'Margen neto % sobre venta',
                render: (row) => (
                    <span className={`block text-right font-black ${(row.net_margin_percent ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatMarginPercent(row.net_margin_percent)}
                    </span>
                ),
            },
        ],
        [],
    );

    const amountLineColumns: VTableColumn<AmountLine>[] = useMemo(
        () => [
            { key: 'label', label: 'Concepto', render: (row) => <span className="text-slate-700">{row.label}</span> },
            {
                key: 'amount',
                label: 'Importe',
                render: (row) => <span className="block text-right font-bold text-slate-800">{formatCurrency(row.amount)}</span>,
            },
        ],
        [],
    );

    const withPosition = <T,>(rows: T[]) => rows.map((row, index) => ({ ...row, position: index + 1 }));

    const healthInstanceColumns: VTableColumn<HealthInstance>[] = useMemo(
        () => [
            {
                key: 'order_folio',
                label: 'OV',
                render: (inst) => (
                    <span className="text-xs font-black text-indigo-600">
                        {inst.order_folio || '—'}
                    </span>
                ),
            },
            {
                key: 'project_name',
                label: 'Proyecto / Cliente',
                render: (inst) => (
                    <div>
                        <p className="text-xs font-bold text-slate-800">{inst.project_name || '—'}</p>
                        <p className="text-[10px] text-slate-500">{inst.client_name || '—'}</p>
                    </div>
                ),
            },
            {
                key: 'custom_name',
                label: 'Instancia',
                render: (inst) => (
                    <span className="text-xs font-bold text-slate-700">
                        {inst.custom_name || `Instancia ${inst.id}`}
                    </span>
                ),
            },
            {
                key: 'delivery_deadline',
                label: 'Fecha Límite',
                render: (inst) => (
                    <span className="text-xs text-slate-500">
                        {inst.delivery_deadline
                            ? formatDate(inst.delivery_deadline)
                            : '—'}
                    </span>
                ),
            },
            {
                key: 'semaphore',
                label: 'Semáforo',
                render: (inst) => (
                    <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                            inst.semaphore === 'RED'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : inst.semaphore === 'YELLOW'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : inst.semaphore === 'BLUE'
                                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}
                    >
                        {inst.semaphore_label || inst.semaphore}
                    </span>
                ),
            },
        ],
        [],
    );

    const openMainSection = (section: DirectorSection) => {
        setActiveSection(section);
        setActiveSalesView(null);
    };

    const handleBack = () => {
        setSelectedHealthGroup(null);
        setShowOverheadDetail(false);
        setShowPayrollDetail(false);
        setShowPiecesDetail(false);
        if (activeSalesView !== null) { setActiveSalesView(null); } 
        else { setActiveSection(null); setActiveSalesView(null); }
    };

    const getSectionTitle = () => {
        if (activeSalesView === 'PENDING_AUTH') return 'Auditoría: Pendientes de Autorización';
        if (activeSalesView === 'SENT_CLIENT') return 'Auditoría: Dinero en la Calle';
        if (activeSalesView === 'RED_LIGHT') return 'Auditoría: Proyectos en Semáforo Rojo';
        if (activeSalesView === 'BATTING_RATE') return 'Auditoría: Tasa de Bateo';

        switch(activeSection) {
            case 'SALES': return 'Motor de Ingresos (Ventas)';
            case 'OPERATIONS': return 'Operación y Ruta Crítica';
            case 'LIQUIDITY': return 'Liquidez y Flujo Maestro';
            case 'PROFITABILITY': return 'Auditoría de Rentabilidad';
            case 'EFFICIENCY': return 'Eficiencia de Fábrica';
            case 'CXC_AGING': return 'Cartera Pendiente — Antigüedad CxC';
            case 'TOP_CLIENTS': return 'Top Clientes — Volumen Anual';
            default: return 'Dirección Estratégica';
        }
    };

    const renderSalesDetailTable = () => {
        let filteredOrders: Quotation[] = [];
        let emptyMessage = "No hay datos para mostrar.";

        if (activeSalesView === 'PENDING_AUTH') {
            filteredOrders = pendingAuthOrders;
            emptyMessage = "No hay cotizaciones esperando tu autorización. ¡Todo al día!";
        } else if (activeSalesView === 'SENT_CLIENT') {
            filteredOrders = sentClientOrders;
            emptyMessage = "No hay cotizaciones autorizadas enviadas al cliente en este momento.";
        }

        if (['RED_LIGHT', 'BATTING_RATE'].includes(activeSalesView as string)) {
             return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">
                Esta vista se activará al conectar el motor de Costos y Eficiencia.
             </div>;
        }

        if (filteredOrders.length === 0) {
            return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">{emptyMessage}</div>;
        }

        return (
            <VTable
                columns={salesDetailColumns}
                data={filteredOrders}
                className="mt-6 animate-in slide-in-from-right-4 duration-300 shadow-sm"
            />
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">{getSectionTitle()}</h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        {activeSection === null 
                            ? 'Cuadro de Mando Estratégico. Pulso del negocio, auditoría y toma de decisiones.'
                            : activeSalesView !== null 
                                ? 'Radiografía de las cotizaciones.'
                                : 'Radiografía detallada del pilar estratégico.'}
                    </p>
                </div>

                {activeSection !== null && (
                    <button onClick={handleBack} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm">
                        <ArrowLeft size={18} /> {activeSalesView !== null ? 'Regresar a Tarjetas' : 'Regresar al Tablero'}
                    </button>
                )}
            </div>

            {/* TABLERO MAESTRO (NIVEL 1) - GRID SIMÉTRICO */}
            {activeSection === null && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
                    
                    {/* 1. VENTAS */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('SALES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-3xl transition-colors group-hover:bg-emerald-100">
                                {pendingAuthOrders.length + sentClientOrders.length}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">1. Ventas</p><TrendingUp size={16} className="text-emerald-500" /></div>
                                <div className="flex justify-end"><div className="text-2xl font-black text-emerald-600 tracking-tight leading-none truncate flex items-baseline gap-1">{summary?.sales.target_percent !== null && summary?.sales.target_percent !== undefined ? `${formatPercent(summary.sales.target_percent)}%` : '—'} <span className="text-sm font-bold text-emerald-400 uppercase">vs Meta</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate" title="OVs vendidas del año, sin IVA, contra la meta anual de Parámetros Globales">{summary ? `${formatCurrency(summary.sales.sales_without_tax)} sin IVA de ${formatCurrency(summary.sales.annual_target)}` : 'Ventas del año sin IVA'}</p><BarChart3 size={14} className="text-emerald-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 2. RUTA CRÍTICA — ACTIVA */}
                    {(() => {
                        const redCount = (healthData?.counts?.RED ?? 0) + urgentUnstaffed.length;
                        const yellowCount = healthData?.counts?.YELLOW ?? 0;
                        const blueCount = healthData?.counts?.BLUE ?? 0;
                        const alertCount = redCount + yellowCount;
                        const borderColor = redCount > 0
                            ? 'border-l-red-500 ring-2 ring-red-100'
                            : yellowCount > 0
                                ? 'border-l-amber-500 ring-2 ring-amber-100'
                                : 'border-l-blue-500';
                        const leftBg = redCount > 0
                            ? 'bg-red-50 text-red-600 border-red-100 group-hover:bg-red-100'
                            : yellowCount > 0
                                ? 'bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-100'
                                : 'bg-blue-50 text-blue-700 border-blue-100 group-hover:bg-blue-100';
                        const textColor = redCount > 0
                            ? 'text-red-600'
                            : yellowCount > 0
                                ? 'text-amber-600'
                                : 'text-blue-600';
                        const iconColor = redCount > 0
                            ? 'text-red-500'
                            : yellowCount > 0
                                ? 'text-amber-500'
                                : 'text-blue-500';
                        return (
                            <div className="w-full relative h-40">
                                <Card
                                    onClick={() => openMainSection('OPERATIONS')}
                                    className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group ${borderColor}`}
                                >
                                    <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black text-3xl transition-colors ${leftBg}`}>
                                        {alertCount > 0 ? alertCount : <CheckCircle size={28} className="text-slate-300" />}
                                    </div>
                                    <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                        <div className="flex justify-between items-start">
                                            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Ruta Crítica</p>
                                            <Factory size={16} className={iconColor} />
                                        </div>
                                        <div className="flex justify-end">
                                            <div className={`text-xl font-black tracking-tight leading-none truncate ${textColor}`}>
                                                {redCount > 0
                                                    ? `${redCount} 🔴 · ${yellowCount} 🟡`
                                                    : yellowCount > 0
                                                        ? `${yellowCount} 🟡 en alerta`
                                                        : `${blueCount} en proceso`}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                            <p className={`text-[10px] font-bold uppercase truncate ${urgentUnstaffed.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                                {urgentUnstaffed.length > 0 ? `${urgentUnstaffed.length} sin cuadrilla a ≤3 días` : 'Ejecución Física'}
                                            </p>
                                            <AlertCircle size={14} className={iconColor} />
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        );
                    })()}

                    {/* 3. LIQUIDEZ — ACTIVA */}
                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => openMainSection('LIQUIDITY')}
                            className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group ${
                                liquidityNet < 0 ? 'border-l-red-500 ring-2 ring-red-100' : 'border-l-indigo-500'
                            }`}
                        >
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black text-xl transition-colors ${
                                liquidityNet < 0
                                    ? 'bg-red-50 text-red-600 border-red-100 group-hover:bg-red-100'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-100 group-hover:bg-indigo-100'
                            }`}>
                                $
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">3. Liquidez</p>
                                    <PieChart size={16} className={liquidityNet < 0 ? 'text-red-500' : 'text-indigo-500'} />
                                </div>
                                <div className="flex justify-end">
                                    <div className={`text-xl font-black tracking-tight leading-none truncate ${
                                        liquidityNet < 0 ? 'text-red-600' : 'text-indigo-600'
                                    }`}>
                                        {formatCurrency(liquidityNet)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Bancos + CxC + Inventario − CxP
                                    </p>
                                    <PieChart size={14} className={liquidityNet < 0 ? 'text-red-400' : 'text-indigo-400'} />
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* 4. RENTABILIDAD — ACTIVA */}
                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => openMainSection('PROFITABILITY')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black text-xl transition-colors group-hover:bg-amber-100">
                                $
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Rentabilidad</p>
                                    <ShieldAlert size={16} className="text-amber-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-xl font-black text-amber-600 tracking-tight leading-none truncate">
                                        {summary ? formatMarginPercent(summary.profitability.net_margin_percent) : '—'}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Margen neto % sobre venta del año
                                    </p>
                                    <ShieldAlert size={14} className="text-amber-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* 5. EFICIENCIA FÁBRICA — ACTIVA */}
                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => openMainSection('EFFICIENCY')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-slate-600 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black text-xl transition-colors group-hover:bg-slate-100">
                                $
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">5. Eficiencia Fábrica</p>
                                    <Target size={16} className="text-slate-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-xl font-black text-slate-700 tracking-tight leading-none truncate flex items-baseline gap-1">
                                        {costKpi
                                            ? formatCurrency(costKpi.cost_per_piece)
                                            : 'Sin datos'}
                                        {costKpi && (
                                            <span className="text-sm font-bold text-slate-400 uppercase">
                                                / pieza
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        {costKpi
                                            ? `${costKpi.pieces_produced} piezas esta semana`
                                            : 'Costo por pieza'}
                                    </p>
                                    <Target size={14} className="text-slate-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* 6. SALIDAS DE CAPITAL */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => navigate('/inventory', { state: { openSection: 'PURCHASE_ORDERS', targetTab: 'BRAKE', returnTo: '/director' } as any })} className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group ${pendingPurchaseAuths > 0 ? 'border-l-red-500 ring-2 ring-red-100' : 'border-l-slate-300'}`}>
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black text-3xl transition-colors ${pendingPurchaseAuths > 0 ? 'bg-red-50 text-red-600 border-red-100 group-hover:bg-red-100' : 'bg-slate-50 text-slate-400 border-slate-100 group-hover:bg-slate-100'}`}>
                                {pendingPurchaseAuths > 0 ? pendingPurchaseAuths : <CheckCircle size={28} className="text-slate-300" />}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">6. Salidas Capital</p><FileSearch size={16} className={pendingPurchaseAuths > 0 ? 'text-red-500' : 'text-slate-400'} /></div>
                                <div className="flex justify-end"><div className={`text-xl md:text-2xl font-black tracking-tight leading-none truncate flex items-baseline gap-1 ${pendingPurchaseAuths > 0 ? 'text-red-600' : 'text-slate-500'}`}>{pendingPurchaseAuths > 0 ? 'Firma Requerida' : 'Todo Autorizado'}</div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Órdenes de Compra</p><AlertTriangle size={14} className={pendingPurchaseAuths > 0 ? 'text-red-400' : 'text-slate-300'}/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 7. SEGUIMIENTO DE OV */}
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
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">7. Seguimiento</p>
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

                    {/* 8. CARTERA PENDIENTE */}
                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => openMainSection('CXC_AGING')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-purple-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-purple-50 text-purple-700 border-r border-purple-100 font-black text-3xl transition-colors group-hover:bg-purple-100">
                                {summary?.receivables.documents ?? 0}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">8. Cartera Pendiente</p>
                                    <Wallet size={16} className="text-purple-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-xl font-black text-purple-600 tracking-tight leading-none truncate">
                                        {formatCurrency(summary?.receivables.pending ?? 0)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">CxC facturada pendiente (con IVA)</p>
                                    <Wallet size={14} className="text-purple-400" />
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* 9. TOP CLIENTES */}
                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => openMainSection('TOP_CLIENTS')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-cyan-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-cyan-50 text-cyan-700 border-r border-cyan-100 font-black text-3xl transition-colors group-hover:bg-cyan-100">
                                {summary?.top_clients.by_sales.length ?? 0}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">9. Top Clientes</p>
                                    <Users size={16} className="text-cyan-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-xl font-black text-cyan-600 tracking-tight leading-none truncate">
                                        {formatCurrency(summary?.top_clients.by_sales[0]?.sales_without_tax ?? 0)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate" title={summary?.top_clients.by_sales[0]?.client_name}>{summary?.top_clients.by_sales[0]?.client_name ?? 'Venta del año sin IVA'}</p>
                                    <Users size={14} className="text-cyan-400" />
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* 10. AUDITORÍA */}
                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => navigate('/director/audit')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-slate-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-600 border-r border-slate-200 font-black text-3xl transition-colors group-hover:bg-slate-100">
                                <Shield size={28} />
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">10. Auditoría</p>
                                    <Shield size={16} className="text-slate-500" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-700 leading-tight">
                                        Historial de acciones del sistema
                                    </h3>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Quién hizo qué y cuándo
                                    </p>
                                    <Shield size={14} className="text-slate-400" />
                                </div>
                            </div>
                        </Card>
                    </div>

                </div>
            )}

            {/* VISTA 2: LOS DESGLOSES INMERSIVOS */}
            {activeSection !== null && (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500 mt-2">
                    {/* 1. DESGLOSE VENTAS */}
                    {activeSection === 'SALES' && (
                        <>
                            {activeSalesView === null ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Card onClick={() => setActiveSalesView('PENDING_AUTH')} className="p-6 border-l-4 border-l-indigo-500 bg-white cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between">
                                        <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black text-3xl group-hover:bg-indigo-100 transition-colors">{pendingAuthOrders.length}</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div className="flex justify-between items-start"><div><h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Clock size={18} className="text-indigo-500"/> A. Autorizaciones</h4></div><ArrowLeftCircle size={20} className="text-indigo-300 group-hover:text-indigo-600 transform rotate-180 transition-all"/></div>
                                            <div className="text-3xl font-black text-indigo-600 text-right leading-none">Pendientes</div>
                                        </div>
                                    </Card>

                                    <Card onClick={() => setActiveSalesView('SENT_CLIENT')} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between">
                                        <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-3xl group-hover:bg-emerald-100 transition-colors">{sentClientOrders.length}</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div className="flex justify-between items-start"><div><h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><TrendingUp size={18} className="text-emerald-500"/> B. En el Mercado</h4></div><ArrowLeftCircle size={20} className="text-emerald-300 group-hover:text-emerald-600 transform rotate-180 transition-all"/></div>
                                            <div className="text-3xl font-black text-emerald-600 text-right leading-none">{formatCurrency(moneySentClient)}</div>
                                        </div>
                                    </Card>

                                    <Card onClick={() => setActiveSalesView('RED_LIGHT')} className="p-6 border-l-4 border-l-red-500 bg-white cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between">
                                        <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black text-3xl group-hover:bg-red-100 transition-colors">0</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div className="flex justify-between items-start"><div><h4 className="font-bold text-red-800 flex items-center gap-2 truncate"><AlertTriangle size={18} className="text-red-500"/> C. Semáforo Rojo</h4></div><ArrowLeftCircle size={20} className="text-red-300 group-hover:text-red-600 transform rotate-180 transition-all"/></div>
                                            <div className="text-3xl font-black text-red-600 text-right leading-none">Riesgo 0</div>
                                        </div>
                                    </Card>

                                    <Card onClick={() => setActiveSalesView('BATTING_RATE')} className="p-6 border-l-4 border-l-slate-800 bg-slate-50 cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between">
                                        <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-200 text-slate-700 border-r border-slate-300 font-black text-3xl group-hover:bg-slate-300 transition-colors">%</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div className="flex justify-between items-start"><div><h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Target size={18} className="text-slate-600"/> D. Tasa de Bateo</h4></div><ArrowLeftCircle size={20} className="text-slate-300 group-hover:text-slate-600 transform rotate-180 transition-all"/></div>
                                            <div className="text-3xl font-black text-slate-800 text-right leading-none">{battingRate}% <span className="text-sm font-normal text-slate-400">Efectividad</span></div>
                                        </div>
                                    </Card>
                                </div>
                            ) : (
                                renderSalesDetailTable()
                            )}
                        </>
                    )}

                    {/* 2. DESGLOSE OPERACIONES */}
                    {activeSection === 'OPERATIONS' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* B. CUELLOS DE BOTELLA 🔴 */}
                            <Card
                                onClick={() => setSelectedHealthGroup({
                                    title: '🔴 Cuellos de Botella',
                                    color: 'red',
                                    instances: healthData?.critical ?? []
                                })}
                                className={`p-6 border-l-4 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1 ${
                                (healthData?.counts?.RED ?? 0) > 0
                                    ? 'border-l-red-500 ring-2 ring-red-100'
                                    : 'border-l-slate-200'
                            }`}>
                                <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black text-3xl ${
                                    (healthData?.counts?.RED ?? 0) > 0
                                        ? 'bg-red-50 text-red-600 border-red-100'
                                        : 'bg-slate-50 text-slate-300 border-slate-100'
                                }`}>
                                    {healthData?.counts?.RED ?? 0}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        🔴 B. Cuellos de Botella
                                    </h4>
                                    <div className={`text-2xl font-black text-right leading-none ${
                                        (healthData?.counts?.RED ?? 0) > 0 ? 'text-red-600' : 'text-slate-300'
                                    }`}>
                                        {(healthData?.counts?.RED ?? 0) > 0 ? 'Acción inmediata' : 'Sin críticos'}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Fecha vencida sin avance
                                    </p>
                                </div>
                            </Card>

                            {/* SIN CUADRILLA ⚠️: instalación a 3 días o menos (o vencida) sin equipo */}
                            <Card
                                onClick={() => setSelectedHealthGroup({
                                    title: '⚠️ Instalaciones sin cuadrilla',
                                    color: 'red',
                                    instances: urgentUnstaffed.map(row => ({
                                        id: row.instance_id,
                                        order_folio: row.order_folio ?? undefined,
                                        client_name: row.client_name ?? undefined,
                                        custom_name: `${row.instance_name} · ${row.lane === 'IP' ? 'Piedra' : 'Muebles'}`,
                                        delivery_deadline: row.scheduled_date,
                                        semaphore: 'RED',
                                        semaphore_label: row.days_left < 0 ? `Vencida ${-row.days_left} d` : `Faltan ${row.days_left} d`,
                                    })),
                                })}
                                className={`p-6 border-l-4 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1 ${
                                    urgentUnstaffed.length > 0 ? 'border-l-red-500 ring-2 ring-red-100' : 'border-l-slate-200'
                                }`}
                            >
                                <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black text-3xl ${
                                    urgentUnstaffed.length > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-300 border-slate-100'
                                }`}>
                                    {urgentUnstaffed.length}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        ⚠️ Sin cuadrilla
                                    </h4>
                                    <div className={`text-2xl font-black text-right leading-none ${urgentUnstaffed.length > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                                        {urgentUnstaffed.length > 0 ? 'Asignar en Planeación' : 'Todas con equipo'}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Instalación a 3 días o menos sin equipo
                                    </p>
                                </div>
                            </Card>

                            {/* C. RIESGO CORTO PLAZO 🟡 */}
                            <Card
                                onClick={() => setSelectedHealthGroup({
                                    title: '🟡 Riesgo Corto Plazo',
                                    color: 'amber',
                                    instances: healthData?.alerts ?? []
                                })}
                                className={`p-6 border-l-4 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1 ${
                                (healthData?.counts?.YELLOW ?? 0) > 0
                                    ? 'border-l-amber-500'
                                    : 'border-l-slate-200'
                            }`}>
                                <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black text-3xl ${
                                    (healthData?.counts?.YELLOW ?? 0) > 0
                                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                                        : 'bg-slate-50 text-slate-300 border-slate-100'
                                }`}>
                                    {healthData?.counts?.YELLOW ?? 0}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        🟡 C. Riesgo Corto Plazo
                                    </h4>
                                    <div className={`text-2xl font-black text-right leading-none ${
                                        (healthData?.counts?.YELLOW ?? 0) > 0 ? 'text-amber-600' : 'text-slate-300'
                                    }`}>
                                        {(healthData?.counts?.YELLOW ?? 0) > 0 ? 'Prevención' : 'Sin alertas'}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Menos de 15 días sin iniciar
                                    </p>
                                </div>
                            </Card>

                            {/* D. CARGA DE PISO 🔵 */}
                            <Card
                                onClick={() => setSelectedHealthGroup({
                                    title: '🔵 Carga de Piso',
                                    color: 'blue',
                                    instances: healthData?.in_process ?? []
                                })}
                                className="p-6 border-l-4 border-l-blue-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black text-3xl">
                                    {healthData?.counts?.BLUE ?? 0}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        🔵 D. Carga de Piso
                                    </h4>
                                    <div className="text-2xl font-black text-blue-600 text-right leading-none">
                                        En producción
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Lotes activos en fábrica
                                    </p>
                                </div>
                            </Card>

                            {/* LISTOS PARA INSTALAR 🔵🟢 */}
                            <Card
                                onClick={() => setSelectedHealthGroup({
                                    title: '🔵🟢 Listos para Instalar',
                                    color: 'emerald',
                                    instances: healthData?.ready_to_install ?? []
                                })}
                                className="p-6 border-l-4 border-l-emerald-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-3xl">
                                    {healthData?.counts?.BLUE_GREEN ?? 0}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        🔵🟢 Listos para Instalar
                                    </h4>
                                    <div className="text-2xl font-black text-emerald-600 text-right leading-none">
                                        En andén
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Empacados y en espera
                                    </p>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* 3. DESGLOSE LIQUIDEZ: Bancos + CxC facturada pendiente + Inventario − CxP */}
                    {activeSection === 'LIQUIDITY' && summary && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            <Card
                                onClick={() => setLiquidityDetail(liquidityDetail === 'BANKS' ? null : 'BANKS')}
                                className="p-6 border-l-4 border-l-slate-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-100 font-black text-xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">🏦 Bancos</h4>
                                    <div className="text-xl font-black text-slate-700 text-right leading-none">
                                        {formatCurrency(summary.liquidity.banks)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Ver desglose {liquidityDetail === 'BANKS' ? '▲' : '▼'}
                                    </p>
                                </div>
                            </Card>
                            <Card
                                onClick={() => setLiquidityDetail(liquidityDetail === 'RECEIVABLES' ? null : 'RECEIVABLES')}
                                className="p-6 border-l-4 border-l-emerald-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-xl">+</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">📥 CxC facturada pendiente</h4>
                                    <div className="text-xl font-black text-emerald-700 text-right leading-none">
                                        {formatCurrency(summary.liquidity.receivables)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Ver desglose {liquidityDetail === 'RECEIVABLES' ? '▲' : '▼'}
                                    </p>
                                </div>
                            </Card>
                            <Card
                                onClick={() => setLiquidityDetail(liquidityDetail === 'INVENTORY' ? null : 'INVENTORY')}
                                className="p-6 border-l-4 border-l-amber-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black text-xl">+</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">📦 Inventario</h4>
                                    <div className="text-xl font-black text-amber-700 text-right leading-none">
                                        {formatCurrency(summary.liquidity.inventory)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Ver desglose {liquidityDetail === 'INVENTORY' ? '▲' : '▼'}
                                    </p>
                                </div>
                            </Card>
                            <Card
                                onClick={() => setLiquidityDetail(liquidityDetail === 'PAYABLES' ? null : 'PAYABLES')}
                                className="p-6 border-l-4 border-l-red-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black text-xl">−</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">📤 CxP</h4>
                                    <div className="text-xl font-black text-red-700 text-right leading-none">
                                        {formatCurrency(summary.liquidity.payables)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                                        Ver desglose {liquidityDetail === 'PAYABLES' ? '▲' : '▼'}
                                    </p>
                                </div>
                            </Card>

                            {liquidityDetail && (
                                <div className="md:col-span-2 xl:col-span-4 animate-in slide-in-from-top-2 duration-300">
                                    <VTable
                                        columns={amountLineColumns}
                                        data={{
                                            BANKS: summary.liquidity.bank_lines,
                                            RECEIVABLES: summary.liquidity.receivable_lines,
                                            INVENTORY: summary.liquidity.inventory_lines,
                                            PAYABLES: summary.liquidity.payable_lines,
                                        }[liquidityDetail]}
                                        emptyState={{ title: 'Sin movimientos en este componente.' }}
                                    />
                                </div>
                            )}

                            <div className="md:col-span-2 xl:col-span-4">
                                <Card className={`p-6 border-l-4 bg-white flex flex-col gap-2 ${liquidityNet < 0 ? 'border-l-red-600' : 'border-l-indigo-600'}`}>
                                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                            Liquidez = Bancos + CxC facturada pendiente + Inventario − CxP
                                        </p>
                                        <p className={`text-3xl font-black ${liquidityNet < 0 ? 'text-red-600' : 'text-indigo-600'}`}>
                                            {formatCurrency(liquidityNet)}
                                        </p>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Bancos al día; CxC y CxP con IVA (saldo de facturas); inventario a costo (materia prima, en proceso y terminado).
                                    </p>
                                </Card>
                            </div>
                        </div>
                    )}

                    {/* 4. DESGLOSE RENTABILIDAD: Margen neto % sobre venta del año (ponderado) */}
                    {activeSection === 'PROFITABILITY' && summary && (
                        <div className="space-y-6">
                            <Card className="p-6 border-l-4 border-l-amber-500 bg-white">
                                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        Margen neto % sobre venta {summary.sales.year} (ponderado)
                                    </p>
                                    <p className="text-3xl font-black text-amber-600">
                                        {formatMarginPercent(summary.profitability.net_margin_percent)}
                                    </p>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    (Venta sin IVA {formatCurrency(summary.profitability.sales_without_tax)} − costo {formatCurrency(summary.profitability.cost)} − comisión {formatCurrency(summary.profitability.commission)}) ÷ venta sin IVA.
                                    {summary.profitability.orders_without_cost > 0 && (
                                        <> Fuera del cálculo: {summary.profitability.orders_without_cost} OVs sin costo (importadas sin receta) por {formatCurrency(summary.profitability.sales_without_cost)} sin IVA.</>
                                    )}
                                </p>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-emerald-600 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">Las 5 OVs más rentables</p>
                                <VTable columns={profitabilityColumns} data={summary.profitability.most_profitable}
                                        emptyState={{ title: 'Sin OVs con costo en el año.' }} />
                            </Card>
                            <Card className="p-6 border-l-4 border-l-red-500 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">Las 5 OVs menos rentables</p>
                                <VTable columns={profitabilityColumns} data={summary.profitability.least_profitable}
                                        emptyState={{ title: 'Sin OVs con costo en el año.' }} />
                            </Card>
                        </div>
                    )}

                    {/* 8. DESGLOSE CARTERA: CxC pendiente, antigüedad y proyección de flujo */}
                    {activeSection === 'CXC_AGING' && summary && (
                        <div className="space-y-6">
                            <Card className="p-6 border-l-4 border-l-purple-600 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Total pendiente por cobrar (con IVA)</p>
                                <p className="text-4xl font-black text-purple-700">{formatCurrency(summary.receivables.pending)}</p>
                                <p className="text-xs text-slate-500 mt-2">
                                    {summary.receivables.documents} facturas pendientes.{' '}
                                    {Math.abs(summary.receivables.pending - summary.liquidity.receivables) < 0.01
                                        && Math.abs(summary.receivables.pending - summary.receivables.cash_flow_income) < 0.01
                                        ? 'Cuadra con la CxC de Liquidez y con los cobros de la proyección de flujo.'
                                        : `No cuadra: Liquidez ${formatCurrency(summary.liquidity.receivables)}, proyección ${formatCurrency(summary.receivables.cash_flow_income)}.`}
                                </p>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-purple-400 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">Antigüedad (días desde la factura)</p>
                                <VTable columns={amountLineColumns} data={summary.liquidity.receivable_lines} />
                            </Card>
                            <Card className="p-6 border-l-4 border-l-indigo-500 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">Proyección de flujo de caja</p>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    {[
                                        { label: 'Saldo actual', value: cashFlow?.current_balance ?? summary.liquidity.banks },
                                        { label: '30 días', value: cashFlow?.projection_30 ?? 0 },
                                        { label: '60 días', value: cashFlow?.projection_60 ?? 0 },
                                        { label: '90 días', value: cashFlow?.projection_90 ?? 0 },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{label}</p>
                                            <p className={`text-2xl font-black mt-1 ${value < 0 ? 'text-red-600' : 'text-indigo-700'}`}>{formatCurrency(value)}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* 9. DESGLOSE TOP CLIENTES: venta del año sin IVA, Margen neto %, pronto pago, MDF y Piedra */}
                    {activeSection === 'TOP_CLIENTS' && summary && (
                        <div className="space-y-6">
                            <Card className="p-6 border-l-4 border-l-cyan-500 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">Quienes más compraron en {summary.sales.year} (sin IVA)</p>
                                <VTable columns={clientSalesColumns} data={withPosition(summary.top_clients.by_sales)}
                                        emptyState={{ title: 'Sin OVs vendidas en el año.' }} />
                            </Card>
                            <Card className="p-6 border-l-4 border-l-amber-500 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">A. Clientes por Margen neto % sobre venta</p>
                                <VTable columns={clientSalesColumns} data={withPosition(summary.top_clients.by_margin)}
                                        emptyState={{ title: 'Sin OVs con costo en el año.' }} />
                            </Card>
                            <Card className="p-6 border-l-4 border-l-emerald-500 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">B. Clientes que pagan más pronto (días promedio de factura a cobro)</p>
                                <VTable columns={paymentSpeedColumns} data={withPosition(summary.top_clients.by_payment_speed)}
                                        emptyState={{ title: 'Sin cobros en el año.' }} />
                            </Card>
                            <Card className="p-6 border-l-4 border-l-slate-600 bg-white">
                                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">C. Ventas en MDF y en Piedra</p>
                                <p className="text-xs text-slate-500 mb-4">Cada partida se reparte entre MDF y Piedra según el costo de piedra de su receta (material y procesos de piedra).</p>
                                <VTable columns={laneColumns} data={summary.top_clients.by_lane}
                                        emptyState={{ title: 'Sin OVs vendidas en el año.' }} />
                            </Card>
                        </div>
                    )}

                    {/* 5. DESGLOSE EFICIENCIA */}
                    {activeSection === 'EFFICIENCY' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="p-6 border-l-4 border-l-slate-700 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black text-xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">💵 Costo / Pieza</h4>
                                    <div className="text-2xl font-black text-slate-800 text-right leading-none">
                                        {formatCurrency(costKpi?.cost_per_piece ?? 0)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Overhead + MO</p>
                                </div>
                            </Card>

                            <Card className="p-6 border-l-4 border-l-amber-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black text-xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">🏗️ Overhead / Pieza</h4>
                                    <div className="text-2xl font-black text-amber-700 text-right leading-none">
                                        {formatCurrency(costKpi?.overhead_per_piece ?? 0)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Gastos operativos</p>
                                </div>
                            </Card>

                            <Card className="p-6 border-l-4 border-l-indigo-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black text-xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">👷 MO / Pieza</h4>
                                    <div className="text-2xl font-black text-indigo-700 text-right leading-none">
                                        {formatCurrency(costKpi?.payroll_per_piece ?? 0)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Nómina producción</p>
                                </div>
                            </Card>
                            <Card
                                onClick={() => setShowOverheadDetail(!showOverheadDetail)}
                                className="p-6 border-l-4 border-l-amber-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black text-xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">💰 Overhead</h4>
                                    <div className="text-2xl font-black text-amber-700 text-right leading-none">
                                        {formatCurrency(costKpi?.overhead_total ?? 0)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                        Gastos operativos semana
                                        <span className="text-amber-400">{showOverheadDetail ? '▲' : '▼'}</span>
                                    </p>
                                </div>
                            </Card>

                            <Card
                                onClick={() => setShowPayrollDetail(!showPayrollDetail)}
                                className="p-6 border-l-4 border-l-indigo-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black text-xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">👷 Nómina Producción</h4>
                                    <div className="text-2xl font-black text-indigo-700 text-right leading-none">
                                        {formatCurrency(costKpi?.payroll_production ?? 0)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                        {costKpi?.has_weekly_payroll ? 'Capturada esta semana' : '⚠️ Sin captura semanal'}
                                        <span className="text-indigo-400">{showPayrollDetail ? '▲' : '▼'}</span>
                                    </p>
                                </div>
                            </Card>

                            <Card
                                onClick={() => setShowPiecesDetail(!showPiecesDetail)}
                                className="p-6 border-l-4 border-l-emerald-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-xl">📦</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-tight">🏭 Piezas Producidas</h4>
                                    <div className="text-2xl font-black text-emerald-700 text-right leading-none">
                                        {costKpi?.pieces_produced ?? 0}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                        Instancias READY esta semana
                                        <span className="text-emerald-400">{showPiecesDetail ? '▲' : '▼'}</span>
                                    </p>
                                </div>
                            </Card>

                            {showPiecesDetail && (
                            <div className="md:col-span-3 animate-in slide-in-from-top-2 duration-300">
                                <Card className="p-6 border-l-4 border-l-emerald-600 bg-white">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">
                                        Desglose Piezas por Tipo
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">🪵 MDF</p>
                                            <p className="text-3xl font-black text-amber-700 mt-1">
                                                {costKpi?.pieces_mdf ?? 0}
                                            </p>
                                            <p className="text-[10px] text-amber-400 font-bold uppercase mt-1">piezas</p>
                                        </div>
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">🪨 Piedra</p>
                                            <p className="text-3xl font-black text-slate-700 mt-1">
                                                {costKpi?.pieces_stone ?? 0}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">piezas</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                            )}

                            {showPayrollDetail && (
                            <div className="md:col-span-3 animate-in slide-in-from-top-2 duration-300">
                                <Card className="p-6 border-l-4 border-l-indigo-600 bg-white">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4">
                                        Desglose Nómina Semanal por Departamento
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Producción</p>
                                            <p className="text-2xl font-black text-indigo-700 mt-1">
                                                {formatCurrency(costKpi?.payroll_production ?? 0)}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Administración</p>
                                            <p className="text-2xl font-black text-slate-700 mt-1">
                                                {formatCurrency(costKpi?.payroll_admin ?? 0)}
                                            </p>
                                        </div>
                                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Diseño y Ventas</p>
                                            <p className="text-2xl font-black text-emerald-700 mt-1">
                                                {formatCurrency(costKpi?.payroll_design_sales ?? 0)}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                            )}

                            {showOverheadDetail && (
                            <div className="md:col-span-3">
                                <Card className="p-6 border-l-4 border-l-amber-600 bg-white relative overflow-hidden animate-in slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-start mb-4">
                                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                            Desglose Overhead por Categoría
                                        </p>
                                        <p className="text-2xl font-black text-amber-600">
                                            {formatCurrency(costKpi?.total_cost ?? 0)}
                                            <span className="text-sm font-bold text-slate-400 ml-2">costo total</span>
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {Object.entries(costKpi?.overhead_by_category ?? {}).map(([cat, amt]) => (
                                            <div key={cat} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{cat}</p>
                                                <p className="text-lg font-black text-slate-800 mt-1">{formatCurrency(amt as number)}</p>
                                            </div>
                                        ))}
                                        {Object.keys(costKpi?.overhead_by_category ?? {}).length === 0 && (
                                            <p className="text-xs text-slate-400 col-span-4 text-center py-4">
                                                Sin gastos operativos registrados esta semana
                                            </p>
                                        )}
                                    </div>
                                </Card>
                            </div>
                            )}

                        </div>
                    )}
                </div>
            )}
            
            {reviewQuotationId && (
                <FinancialReviewModal 
                    quotationId={reviewQuotationId}
                    onClose={() => setReviewQuotationId(null)}
                    onOrderUpdated={() => {
                        setReviewQuotationId(null);
                        loadData(); 
                    }}
                />
            )}

            <ChangeOrderReviewModal
                changeId={reviewChangeId}
                onClose={() => setReviewChangeId(null)}
                onDone={() => { loadData(); }}
            />

            {selectedHealthGroup && (
                <Modal isOpen bare size="custom" overlayZIndex={200} onClose={() => setSelectedHealthGroup(null)} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">

                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                                    {selectedHealthGroup.title}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 font-bold uppercase">
                                    {selectedHealthGroup.instances.length} instancia{selectedHealthGroup.instances.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedHealthGroup(null)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Lista de instancias */}
                        <div className="flex-1 overflow-y-auto">
                            {selectedHealthGroup.instances.length === 0 ? (
                                <div className="text-center py-16 text-slate-400 font-bold uppercase text-xs">
                                    Sin instancias en este grupo
                                </div>
                            ) : (
                                <VTable
                                    columns={healthInstanceColumns}
                                    data={selectedHealthGroup.instances as HealthInstance[]}
                                />
                            )}
                        </div>
                    </Modal>
            )}
        </div>
    );
};
export default DirectorDashboard;