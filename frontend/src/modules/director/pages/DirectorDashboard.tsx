import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    TrendingUp, Factory, DollarSign, Scale, Activity,
    ArrowLeft, AlertTriangle, Clock, CheckCircle,
    BarChart3, Target, AlertCircle, PieChart, ShieldAlert,
    ThumbsUp, ThumbsDown, Package, Layers, ArrowLeftCircle,
    FileSearch, RefreshCw, Lock, XCircle
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

// --- SERVICIOS ---
import { FinancialReviewModal } from '../../management/components/FinancialReviewModal';
import { salesService } from '../../../api/sales-service';
import { treasuryService } from '../../../api/treasury-service';
import { financeService } from '../../../api/finance-service';
import { SalesOrder } from '../../../types/sales';
import { BankAccount } from '../../../types/treasury';

// Posibles vistas desplegables (Nivel 1)
type DirectorSection = 'SALES' | 'OPERATIONS' | 'LIQUIDITY' | 'PROFITABILITY' | 'EFFICIENCY' | null;

// Posibles vistas de detalle para VENTAS (Nivel 2 -> 3)
type SalesDetailView = 'PENDING_AUTH' | 'SENT_CLIENT' | 'RED_LIGHT' | 'BATTING_RATE' | null;

const DirectorDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // --- ESTADOS BASE Y MEMORIA DE SESIÓN ---
    const [isLoading, setIsLoading] = useState(true);
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [reviewOrderId, setReviewOrderId] = useState<number | null>(null);

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
    const [pendingAuthOrders, setPendingAuthOrders] = useState<SalesOrder[]>([]);
    const [sentClientOrders, setSentClientOrders] = useState<SalesOrder[]>([]);
    const [moneySentClient, setMoneySentClient] = useState(0);
    const [battingRate, setBattingRate] = useState(0);
    const [realSalesAdvance, setRealSalesAdvance] = useState(0);
    const [annualTarget, setAnnualTarget] = useState<number>(1); // Previene división entre cero
    
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

    const [totalBankBalance, setTotalBankBalance] = useState(0);
    const [totalCXC, setTotalCXC] = useState(0);
    const [totalCXP, setTotalCXP] = useState(0);
    const [liquidityNet, setLiquidityNet] = useState(0);

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
            const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
            let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            if (baseUrl.endsWith('/api/v1')) baseUrl = baseUrl.replace('/api/v1', '');

            // 1. OBTENER META ANUAL DINÁMICA DESDE LOS PARÁMETROS GLOBALES
            let fetchedTarget = 1; // Fallback de seguridad
            try {
                const configRes = await fetch(`${baseUrl}/api/v1/foundations/config`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (configRes.ok) {
                    const configData = await configRes.json();
                    if (configData && configData.annual_sales_target) {
                        fetchedTarget = Number(configData.annual_sales_target);
                        setAnnualTarget(fetchedTarget);
                    }
                }
            } catch (e) {
                console.error("Error al leer la meta anual global", e);
            }

            // 2. Cargar Ventas y calcular usando la meta leída
            const data = await salesService.getOrders();
            const uniqueOrders = data ? Array.from(new Map(data.map((o: SalesOrder) => [o.id, o])).values()) : [];
            setOrders(uniqueOrders);
            calculateSalesMetrics(uniqueOrders, fetchedTarget);

            // 3. Cargar Notificaciones de Compras en vivo
            try {
                const notifRes = await fetch(`${baseUrl}/api/v1/purchases/notifications/pending-tasks`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                });

                if (notifRes.ok) {
                    const notifData = await notifRes.json();
                    setPendingPurchaseAuths(notifData.orders_to_authorize || 0);
                }
            } catch (notifErr) {
                console.error("Fallo conectando con notificaciones de compras:", notifErr);
            }

            // COST KPI
            try {
                const kpiRes = await fetch(
                    `${baseUrl}/api/v1/treasury/cost-kpi`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (kpiRes.ok) {
                    const kpiData = await kpiRes.json();
                    setCostKpi(kpiData);
                }
            } catch {
                /* ignore cost kpi errors */
            }

            // LIQUIDEZ — Datos reales
            try {
                const [accs, apStats, orders2, rights] = await Promise.all([
                    treasuryService.getAccounts(),
                    financeService.getPayableDashboardStats(),
                    salesService.getOrders().catch(() => []),
                    salesService.getInvoicingRights().catch(() => null),
                ]);

                // Bancos
                const bancos = (accs || []).reduce(
                    (sum: number, acc: BankAccount) => sum + (acc.current_balance || 0), 0
                );
                setTotalBankBalance(bancos);

                // CXP
                const cxp = (apStats?.overdue_amount || 0) +
                    (apStats?.next_period_amount || 0) +
                    (apStats?.future_amount || 0);
                setTotalCXP(cxp);

                // CXC
                const orderList = Array.isArray(orders2) ? orders2 : [];
                let agingAmt = 0;
                for (const o of orderList) {
                    const pays = o.payments;
                    if (!pays?.length) continue;
                    for (const cxc of pays) {
                        if (String((cxc as { status?: string }).status).toUpperCase() === 'PENDING') {
                            agingAmt += Number((cxc as { amount?: number }).amount) || 0;
                        }
                    }
                }
                const aAmt = rights?.advance_pending_total ?? 0;
                const bAmt = rights?.progress_work_total ?? 0;
                const cxcTotal = aAmt + bAmt + agingAmt;
                setTotalCXC(cxcTotal);

                // Liquidez Neta
                setLiquidityNet(bancos + cxcTotal - cxp);

            } catch (e) {
                console.error('Error cargando datos de liquidez:', e);
            }

            try {
                const healthRes = await fetch(
                    `${baseUrl}/api/v1/planning/instances/health`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (healthRes.ok) {
                    const healthJson = await healthRes.json();
                    setHealthData(healthJson);
                }
            } catch {
                /* ignore health errors */
            }

        } catch (error) {
            console.error("Error cargando datos del Director:", error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };
    
    const calculateSalesMetrics = (allOrders: SalesOrder[], target: number) => {
        const pending = allOrders.filter(o => o.status === 'SENT');
        setPendingAuthOrders(pending);

        const sent = allOrders.filter(o => o.status === 'ACCEPTED');
        setSentClientOrders(sent);
        const moneySent = sent.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
        setMoneySentClient(moneySent);

        let won = 0, lost = 0;
        allOrders.forEach(o => {
            if (['SOLD', 'INSTALLED', 'FINISHED'].includes(o.status)) won++;
            if (o.status === 'CLIENT_REJECTED') lost++;
        });
        const totalResolved = won + lost;
        setBattingRate(totalResolved > 0 ? Math.round((won / totalResolved) * 100) : 0);

        // AVANCE DINÁMICO
        const wonOrdersMoney = allOrders
            .filter(o => ['SOLD', 'INSTALLED', 'FINISHED'].includes(o.status))
            .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
        
        const advancePercentage = target > 0 ? Math.round((wonOrdersMoney / target) * 100) : 0;
        setRealSalesAdvance(advancePercentage);
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

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
            default: return 'Dirección Estratégica';
        }
    };

    const renderSalesDetailTable = () => {
        let filteredOrders: SalesOrder[] = [];
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
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6 animate-in slide-in-from-right-4 duration-300">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-bold">Folio / Proyecto</th>
                            <th className="px-6 py-4 font-bold">Vendedor</th>
                            <th className="px-6 py-4 font-bold">Fecha Límite</th>
                            <th className="px-6 py-4 font-bold text-right">Monto Total</th>
                            <th className="px-6 py-4 font-bold text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map(order => (
                            <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-800">OV-{order.id.toString().padStart(4,'0')} - {order.project_name}</td>
                                <td className="px-6 py-4 text-slate-600">Comercial</td>
                                <td className="px-6 py-4 text-slate-600">{order.valid_until ? new Date(order.valid_until).toLocaleDateString() : 'N/A'}</td>
                                <td className="px-6 py-4 text-right font-bold text-indigo-700">{formatCurrency(order.total_price || 0)}</td>
                                <td className="px-6 py-4 flex justify-center items-center gap-2">
                                    {activeSalesView === 'PENDING_AUTH' ? (
                                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" onClick={() => setReviewOrderId(order.id!)}>
                                            <FileSearch size={14} className="mr-1" /> Revisar / Autorizar
                                        </Button>
                                    ) : (
                                        <Button variant="outline" size="sm" className="shadow-sm bg-white" onClick={() => setReviewOrderId(order.id!)}>
                                            <FileSearch size={14} className="mr-1" /> Auditar Detalle
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
                                <div className="flex justify-end"><div className="text-2xl font-black text-emerald-600 tracking-tight leading-none truncate flex items-baseline gap-1">{realSalesAdvance}% <span className="text-sm font-bold text-emerald-400 uppercase">vs Meta</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Motor de Ingresos</p><BarChart3 size={14} className="text-emerald-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 2. RUTA CRÍTICA — ACTIVA */}
                    {(() => {
                        const redCount = healthData?.counts?.RED ?? 0;
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
                                            <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                                Ejecución Física
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
                                        Bancos + CXC - CXP
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
                                        {costKpi
                                            ? formatCurrency(costKpi.total_cost)
                                            : 'Sin datos'}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Costo total semana
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

                    {/* 3. DESGLOSE LIQUIDEZ */}
                    {activeSection === 'LIQUIDITY' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="p-6 border-l-4 border-l-slate-800 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black text-xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        🏦 Bancos
                                    </h4>
                                    <div className="text-2xl font-black text-slate-800 text-right leading-none">
                                        {formatCurrency(totalBankBalance)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Saldo disponible</p>
                                </div>
                            </Card>

                            <Card className="p-6 border-l-4 border-l-emerald-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-xl">+</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        📥 Por Cobrar
                                    </h4>
                                    <div className="text-2xl font-black text-emerald-600 text-right leading-none">
                                        {formatCurrency(totalCXC)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">CXC activo</p>
                                </div>
                            </Card>

                            <Card className="p-6 border-l-4 border-l-red-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black text-xl">-</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
                                        📤 Por Pagar
                                    </h4>
                                    <div className="text-2xl font-black text-red-600 text-right leading-none">
                                        {formatCurrency(totalCXP)}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">CXP pendiente</p>
                                </div>
                            </Card>

                            <div className="md:col-span-3">
                                <Card className={`p-6 border-l-4 bg-white relative overflow-hidden h-32 flex flex-col justify-between ${
                                    liquidityNet < 0 ? 'border-l-red-600' : 'border-l-indigo-600'
                                }`}>
                                    <div className="flex justify-between items-center">
                                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                            Posición Neta = Bancos + CXC - CXP
                                        </p>
                                        <p className={`text-3xl font-black ${
                                            liquidityNet < 0 ? 'text-red-600' : 'text-indigo-600'
                                        }`}>
                                            {formatCurrency(liquidityNet)}
                                        </p>
                                    </div>
                                    <p className={`text-sm font-bold uppercase ${
                                        liquidityNet < 0 ? 'text-red-500' : 'text-indigo-400'
                                    }`}>
                                        {liquidityNet < 0
                                            ? '⚠️ Posición negativa — revisar flujo de caja'
                                            : '✅ Posición saludable'}
                                    </p>
                                </Card>
                            </div>
                        </div>
                    )}

                    {/* 4. DESGLOSE RENTABILIDAD */}
                    {activeSection === 'PROFITABILITY' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                        </div>
                    )}
                </div>
            )}
            
            {reviewOrderId && (
                <FinancialReviewModal 
                    orderId={reviewOrderId}
                    onClose={() => setReviewOrderId(null)}
                    onOrderUpdated={() => {
                        setReviewOrderId(null);
                        loadData(); 
                    }}
                />
            )}

            {selectedHealthGroup && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">

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
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">OV</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Proyecto / Cliente</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Instancia</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Límite</th>
                                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Semáforo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {selectedHealthGroup.instances.map((inst: any) => (
                                            <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-black text-indigo-600 text-xs">
                                                    {inst.order_folio || '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-slate-800 text-xs">{inst.project_name || '—'}</p>
                                                    <p className="text-[10px] text-slate-500">{inst.client_name || '—'}</p>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-700 text-xs">
                                                    {inst.custom_name || `Instancia ${inst.id}`}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500">
                                                    {inst.delivery_deadline
                                                        ? new Date(inst.delivery_deadline).toLocaleDateString('es-MX')
                                                        : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase ${
                                                        inst.semaphore === 'RED'
                                                            ? 'bg-red-50 text-red-700 border-red-200'
                                                            : inst.semaphore === 'YELLOW'
                                                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                : inst.semaphore === 'BLUE'
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    }`}>
                                                        {inst.semaphore_label || inst.semaphore}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default DirectorDashboard;