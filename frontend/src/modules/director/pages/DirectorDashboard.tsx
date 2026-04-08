import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    TrendingUp, Factory, DollarSign, Scale, Activity,
    ArrowLeft, AlertTriangle, Clock, CheckCircle,
    BarChart3, Target, AlertCircle, PieChart, ShieldAlert,
    ThumbsUp, ThumbsDown, Package, Layers, ArrowLeftCircle,
    FileSearch, RefreshCw
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';

// --- SERVICIOS ---
import { FinancialReviewModal } from '../../management/components/FinancialReviewModal';
import { salesService } from '../../../api/sales-service';
import { SalesOrder } from '../../../types/sales';

// Posibles vistas desplegables (Nivel 1)
type DirectorSection = 'SALES' | 'OPERATIONS' | 'LIQUIDITY' | 'PROFITABILITY' | 'EFFICIENCY' | null;

// Posibles vistas de detalle para VENTAS (Nivel 2 -> 3)
type SalesDetailView = 'PENDING_AUTH' | 'SENT_CLIENT' | 'RED_LIGHT' | 'BATTING_RATE' | null;

const DirectorDashboard: React.FC = () => {
    const navigate = useNavigate();

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
    
    // --- NUEVO: ESTADO PARA FIRMAS DE COMPRAS ---
    const [pendingPurchaseAuths, setPendingPurchaseAuths] = useState<number>(0);

    // --- ESTADOS SIMULADOS ---
    const [mockSalesAdvance] = useState(78); 
    const [mockCriticalInstances] = useState(3); 
    const [mockNetLiquidity] = useState(840500); 
    const [mockProfitability] = useState(32.4); 
    const [mockCostPerBoard] = useState(415.50); 

    useEffect(() => {
        loadData(); 
        const interval = setInterval(() => { loadData(true); }, 15000);
        return () => clearInterval(interval); 
    }, []);

    const loadData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            // 1. Cargar Ventas
            const data = await salesService.getOrders();
            const uniqueOrders = data ? Array.from(new Map(data.map((o: SalesOrder) => [o.id, o])).values()) : [];
            setOrders(uniqueOrders);
            calculateSalesMetrics(uniqueOrders);

            // 2. NUEVO: Cargar Notificaciones de Compras en vivo
            try {
                const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                
                // Normalización de la URL a prueba de fallos
                let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                if (baseUrl.endsWith('/api/v1')) {
                    baseUrl = baseUrl.replace('/api/v1', '');
                }

                const endpoint = `${baseUrl}/api/v1/purchases/notifications/pending-tasks`;
                console.log("Buscando autorizaciones en:", endpoint); // Chismoso 1

                const notifRes = await fetch(endpoint, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                });

                if (notifRes.ok) {
                    const notifData = await notifRes.json();
                    console.log("Notificaciones recibidas:", notifData); // Chismoso 2
                    setPendingPurchaseAuths(notifData.orders_to_authorize || 0);
                } else {
                    console.error("El backend rechazó la petición de notificaciones. Código:", notifRes.status);
                }
            } catch (notifErr) {
                console.error("Fallo de red conectando con notificaciones:", notifErr);
            }

        } catch (error) {
            console.error("Error cargando datos del Director:", error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };
    
    const calculateSalesMetrics = (allOrders: SalesOrder[]) => {
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
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const openMainSection = (section: DirectorSection) => {
        setActiveSection(section);
        setActiveSalesView(null);
    };

    const handleBack = () => {
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
                                <div className="flex justify-end"><div className="text-2xl font-black text-emerald-600 tracking-tight leading-none truncate flex items-baseline gap-1">{mockSalesAdvance}% <span className="text-sm font-bold text-emerald-400 uppercase">vs Meta</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Motor de Ingresos</p><BarChart3 size={14} className="text-emerald-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 2. OPERACIÓN */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('OPERATIONS')} className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group ${mockCriticalInstances > 0 ? 'border-l-red-500 ring-2 ring-red-100' : 'border-l-blue-500'}`}>
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black text-3xl transition-colors ${mockCriticalInstances > 0 ? 'bg-red-50 text-red-600 border-red-100 group-hover:bg-red-100' : 'bg-blue-50 text-blue-700 border-blue-100 group-hover:bg-blue-100'}`}>
                                {mockCriticalInstances}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Ruta Crítica</p><Factory size={16} className={mockCriticalInstances > 0 ? 'text-red-500' : 'text-blue-500'} /></div>
                                <div className="flex justify-end"><div className={`text-2xl font-black tracking-tight leading-none truncate flex items-baseline gap-1 ${mockCriticalInstances > 0 ? 'text-red-600' : 'text-blue-600'}`}>{mockCriticalInstances} <span className={`text-sm font-bold uppercase ${mockCriticalInstances > 0 ? 'text-red-400' : 'text-blue-400'}`}>Críticas</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Ejecución Física</p><AlertCircle size={14} className={mockCriticalInstances > 0 ? 'text-red-400' : 'text-blue-400'}/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 3. LIQUIDEZ */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('LIQUIDITY')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black text-2xl transition-colors group-hover:bg-indigo-100">$</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">3. Liquidez</p><DollarSign size={16} className="text-indigo-500" /></div>
                                <div className="flex justify-end"><div className="text-2xl font-black text-indigo-600 tracking-tight leading-none truncate">{formatCurrency(mockNetLiquidity)}</div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Posición Neta</p><PieChart size={14} className="text-indigo-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 4. RENTABILIDAD */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('PROFITABILITY')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black text-2xl transition-colors group-hover:bg-amber-100">%</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Rentabilidad</p><Scale size={16} className="text-amber-500" /></div>
                                <div className="flex justify-end"><div className="text-2xl font-black text-amber-600 tracking-tight leading-none truncate flex items-baseline gap-1">{mockProfitability}<span className="text-sm font-bold text-amber-400 uppercase">MARGEN</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">La Verdad del Negocio</p><ShieldAlert size={14} className="text-amber-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 5. EFICIENCIA */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('EFFICIENCY')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-slate-700 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black text-2xl transition-colors group-hover:bg-slate-100">$</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">5. Eficiencia Fábrica</p><Activity size={16} className="text-slate-700" /></div>
                                <div className="flex justify-end"><div className="text-2xl font-black text-slate-800 tracking-tight leading-none truncate flex items-baseline gap-1">{mockCostPerBoard.toFixed(2)} <span className="text-sm font-bold text-slate-400 uppercase">/ TABLERO</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Costo de Transformación</p><Target size={14} className="text-slate-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* 6. NUEVO: SALIDAS DE CAPITAL (AUTORIZACIONES DE COMPRA) */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => navigate('/inventory', { state: { openSection: 'PURCHASE_ORDERS', targetTab: 'BRAKE' } as any })} className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white relative overflow-hidden group ${pendingPurchaseAuths > 0 ? 'border-l-red-500 ring-2 ring-red-100' : 'border-l-slate-300'}`}>
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

            {/* ============================================================== */}
            {/* VISTA 2: LOS DESGLOSES INMERSIVOS (ESTANDARIZADOS A h-40) */}
            {/* ============================================================== */}
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
                            <Card className="p-6 border-l-4 border-l-red-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black text-3xl">3</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-red-800 flex items-center gap-2 truncate"><AlertCircle size={18} className="text-red-500"/> A. Cuellos de Botella</h4>
                                    <div className="text-3xl font-black text-red-600 text-right leading-none">Látigo</div>
                                </div>
                            </Card>

                            <Card className="p-6 border-l-4 border-l-amber-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black text-3xl">8</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-amber-800 flex items-center gap-2 truncate"><Clock size={18} className="text-amber-500"/> B. Riesgo a Corto Plazo</h4>
                                    <div className="text-3xl font-black text-amber-600 text-right leading-none">Prevención</div>
                                </div>
                            </Card>

                            <Card className="p-6 border-l-4 border-l-emerald-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-3xl">5</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><CheckCircle size={18} className="text-emerald-500"/> C. Dinero en la Mesa</h4>
                                    <div className="text-3xl font-black text-emerald-600 text-right leading-none">Terminados</div>
                                </div>
                            </Card>

                            <Card className="p-6 border-l-4 border-l-blue-500 bg-white relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black text-3xl">12</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Layers size={18} className="text-blue-500"/> D. Carga de Piso</h4>
                                    <div className="text-3xl font-black text-blue-600 text-right leading-none">Activos</div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* 3. DESGLOSE LIQUIDEZ */}
                    {activeSection === 'LIQUIDITY' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="p-6 border-l-4 border-l-emerald-500 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-100 text-emerald-700 border-r border-emerald-200 font-black text-2xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><TrendingUp size={18} className="text-emerald-500"/> A. Por Cobrar</h4>
                                    <div className="text-3xl font-black text-emerald-600 text-right leading-none">$650K</div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-red-500 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-100 text-red-700 border-r border-red-200 font-black text-2xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><TrendingDown size={18} className="text-red-500"/> B. Por Pagar</h4>
                                    <div className="text-3xl font-black text-red-600 text-right leading-none">$180K</div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-blue-500 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-100 text-blue-700 border-r border-blue-200 font-black text-2xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><DollarSign size={18} className="text-blue-500"/> C. Dinero en la Mesa</h4>
                                    <div className="text-3xl font-black text-blue-600 text-right leading-none">$215K</div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-slate-700 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-200 text-slate-700 border-r border-slate-300 font-black text-2xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Package size={18} className="text-slate-600"/> D. Inventario</h4>
                                    <div className="text-3xl font-black text-slate-700 text-right leading-none">$420K</div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* 4. DESGLOSE RENTABILIDAD */}
                    {activeSection === 'PROFITABILITY' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="p-6 border-l-4 border-l-red-500 bg-red-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-100 text-red-700 border-r border-red-200 font-black text-2xl">!</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-red-800 flex items-center gap-2 truncate"><ShieldAlert size={18} className="text-red-500"/> A. Costo No Calidad</h4>
                                    <div className="text-3xl font-black text-red-600 text-right leading-none">-$12.4K</div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-orange-500 bg-orange-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-orange-100 text-orange-700 border-r border-orange-200 font-black text-2xl">!</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-orange-800 flex items-center gap-2 truncate"><TrendingDown size={18} className="text-orange-500"/> B. Desviación Compras</h4>
                                    <div className="text-3xl font-black text-orange-600 text-right leading-none">-$4.1K</div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-emerald-500 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-100 text-emerald-700 border-r border-emerald-200 font-black text-2xl">★</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><ThumbsUp size={18} className="text-emerald-500"/> C. Héroes y Villanos</h4>
                                    <div className="space-y-2 text-sm mt-1 border-t border-slate-200 pt-2">
                                        <div className="flex justify-between items-center"><span className="text-emerald-600 font-bold truncate">1. OV-102 Cocina</span><span className="font-black text-slate-800">42%</span></div>
                                        <div className="flex justify-between items-center"><span className="text-red-600 font-bold truncate">3. OV-089 Clósets</span><span className="font-black text-slate-800">12%</span></div>
                                    </div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-indigo-500 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-100 text-indigo-700 border-r border-indigo-200 font-black text-2xl">%</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Scale size={18} className="text-indigo-500"/> D. Teórica vs Real</h4>
                                    <div className="flex justify-end gap-2 text-3xl font-black text-indigo-600 leading-none">32.4% <span className="text-sm font-bold text-slate-400">vs 35%</span></div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* 5. DESGLOSE EFICIENCIA */}
                    {activeSection === 'EFFICIENCY' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="p-6 border-l-4 border-l-slate-700 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-200 text-slate-700 border-r border-slate-300 font-black text-2xl">#</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Layers size={18} className="text-slate-600"/> A. Transformación</h4>
                                    <div className="text-3xl font-black text-slate-700 text-right leading-none">240 <span className="text-sm font-normal text-slate-400">Hojas</span></div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-blue-500 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-100 text-blue-700 border-r border-blue-200 font-black text-2xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Activity size={18} className="text-blue-500"/> B. Nómina x Tablero</h4>
                                    <div className="text-3xl font-black text-blue-600 text-right leading-none">$210 <span className="text-sm font-normal text-slate-400">/ TB</span></div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-indigo-500 bg-slate-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-100 text-indigo-700 border-r border-indigo-200 font-black text-2xl">$</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><BarChart3 size={18} className="text-indigo-500"/> C. OPEX x Tablero</h4>
                                    <div className="text-3xl font-black text-indigo-600 text-right leading-none">$205 <span className="text-sm font-normal text-slate-400">/ TB</span></div>
                                </div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-red-500 bg-red-50 relative overflow-hidden h-40 flex flex-col justify-between">
                                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-100 text-red-700 border-r border-red-200 font-black text-2xl">%</div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <h4 className="font-bold text-red-800 flex items-center gap-2 truncate"><AlertTriangle size={18} className="text-red-500"/> D. Monitor Merma</h4>
                                    <div className="text-3xl font-black text-red-600 text-right leading-none">14% <span className="text-sm font-normal text-red-400">vs 8%</span></div>
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
        </div>
    );
};
export default DirectorDashboard;