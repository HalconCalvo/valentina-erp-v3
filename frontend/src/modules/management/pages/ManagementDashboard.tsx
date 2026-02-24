import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    TrendingDown, Users, DollarSign, 
    AlertTriangle, Calendar, ArrowRight, Filter, CheckSquare,
    CheckCircle2, X, Clock, Trash2, Edit2, Search, Check, TrendingUp
} from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import { financeService } from '../../../api/finance-service';
import { salesService } from '../../../api/sales-service';
import { treasuryService } from '../../../api/treasury-service';
import { AccountsPayableStats, PendingInvoice, SupplierPayment, PaymentRequestPayload } from '../../../types/finance';
import { SalesOrderStatus, SalesOrder } from '../../../types/sales';
import { BankAccount } from '../../../types/treasury'; 
import { PaymentRequestModal } from '../components/PaymentRequestModal';
import { PaymentExecutionModal } from '../components/PaymentExecutionModal';
import { PaymentApprovalModal } from '../components/PaymentApprovalModal';

// Agregamos 'MONTHLY_SALES' a los posibles estados
type DashboardSection = 'INVENTORY' | 'PAYROLL' | 'EXPENSES' | 'PAYABLE' | 'QUOTES' | 'MONTHLY_SALES' | null;
type PayableFilter = 'THIS_FRIDAY' | 'NEXT_15_DAYS' | 'FUTURE' | null;
type PayableViewMode = 'TO_REQUEST' | 'REQUESTED';

const ManagementDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // --- SEGURIDAD: Leer el Rol ---
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const isDirector = ['ADMIN', 'ADMINISTRADOR', 'DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);

    // --- ESTADOS ---
    const [stats, setStats] = useState<AccountsPayableStats | null>(null);
    const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
    
    const [sentRequests, setSentRequests] = useState<SupplierPayment[]>([]); 
    const [approvedRequests, setApprovedRequests] = useState<SupplierPayment[]>([]);
    const [approvedPaymentsCount, setApprovedPaymentsCount] = useState(0);

    const [accounts, setAccounts] = useState<BankAccount[]>([]); 
    
    // --- ESTADOS DE VENTAS ---
    const [pendingQuotes, setPendingQuotes] = useState<SalesOrder[]>([]);
    const [monthlySales, setMonthlySales] = useState<SalesOrder[]>([]);
    const [monthlySalesAmount, setMonthlySalesAmount] = useState(0);

    const [loading, setLoading] = useState(false);

    // Navegación Interactiva
    const [activeSection, setActiveSection] = useState<DashboardSection>(null);
    const [payableViewMode, setPayableViewMode] = useState<PayableViewMode>('TO_REQUEST'); 
    const [activeFilter, setActiveFilter] = useState<PayableFilter>(null);
    
    // Modales
    const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
    const [editingRequest, setEditingRequest] = useState<SupplierPayment | null>(null);
    const [showExecutionModal, setShowExecutionModal] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);

    // --- CARGA DE DATOS INICIALES ---
    useEffect(() => {
        loadStats();
        loadSalesData();
        loadAccounts(); 
        if (location.state && location.state.openSection) {
            setActiveSection(location.state.openSection as DashboardSection);
            window.history.replaceState({}, document.title); 
        }
    }, [location.state]);

    // --- RADAR INVISIBLE (AUTO-REFRESCO CADA 15 SEGUNDOS) ---
    useEffect(() => {
        const intervalId = setInterval(() => {
            loadStats();
            loadSalesData();
            if (activeSection === 'PAYABLE') {
                refreshPayableData(false);
            }
        }, 15000);
        return () => clearInterval(intervalId);
    }, [activeSection, payableViewMode]);
    
    const loadStats = async () => {
        try {
            const data = await financeService.getPayableDashboardStats();
            setStats(data);
        } catch (error) {
            console.error("Error cargando KPIs:", error);
        }
    };

    // --- NUEVA CARGA DE DATOS DE VENTAS (COTIZACIONES + VENTAS DEL MES) ---
    const loadSalesData = async () => {
        try {
            const allQuotes = await salesService.getOrders();
            
            // 1. Cotizaciones Pendientes
            const strictPendingQuotes = allQuotes.filter(
                (quote: SalesOrder) => quote.status === 'SENT' || quote.status === SalesOrderStatus.SENT
            );
            setPendingQuotes(strictPendingQuotes);

            // 2. Ventas del Mes
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            const currentMonthlySales = allQuotes.filter((o: SalesOrder) => {
                const isSold = o.status === 'PAID' || o.status === 'SOLD' || o.status === SalesOrderStatus.PAID || o.status === SalesOrderStatus.SOLD;
                const d = o.created_at ? new Date(o.created_at) : new Date();
                return isSold && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            });

            setMonthlySales(currentMonthlySales);
            setMonthlySalesAmount(currentMonthlySales.reduce((sum, o) => sum + (o.total_price || 0), 0));

        } catch (error) {
            console.error("Error cargando datos comerciales:", error);
        }
    };

    const loadAccounts = async () => {
        try {
            const accs = await treasuryService.getAccounts();
            setAccounts(accs);
        } catch (error) {
            console.error("Error cargando cuentas de tesorería:", error);
        }
    };

    // --- CARGA DE DATOS AL ENTRAR A SECCIÓN ---
    useEffect(() => {
        if (activeSection === 'PAYABLE') {
            refreshPayableData(true);
        }
        if (activeSection === 'QUOTES' || activeSection === 'MONTHLY_SALES') {
            loadSalesData();
        }
    }, [activeSection, payableViewMode]);

    const refreshPayableData = async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        try {
            const [invoicesData, pendingReqData, approvedReqData] = await Promise.all([
                financeService.getPendingInvoices(),
                financeService.getPendingApprovals(), 
                financeService.getApprovedPayments()  
            ]);
            setInvoices(invoicesData);
            setSentRequests(pendingReqData);
            setApprovedRequests(approvedReqData);
            setApprovedPaymentsCount(approvedReqData.length); 
            
            if (showSpinner) loadStats(); 
        } catch (error) {
            console.error("Error al refrescar datos", error);
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    // --- LÓGICA DE FILTRADO ANTI-ZONAS HORARIAS (BLINDADA) ---
    const getFilteredInvoices = () => {
        if (!activeFilter) return [];

        // Hoy al MEDIODÍA (para evitar cambios de día por UTC/CST)
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        return invoices.filter(inv => {
            if (!inv.due_date) return false;

            // 1. Cortamos los primeros 10 caracteres (YYYY-MM-DD) a la fuerza
            const dateString = String(inv.due_date).substring(0, 10);
            const [yearStr, monthStr, dayStr] = dateString.split('-');
            
            // 2. Armamos la fecha forzándola al MEDIODÍA (12:00:00) local
            const parsedDate = new Date(
                parseInt(yearStr, 10), 
                parseInt(monthStr, 10) - 1, // En JS los meses empiezan en 0
                parseInt(dayStr, 10), 
                12, 0, 0, 0
            );

            // 3. Resta en milisegundos y conversión a días (con Math.round)
            const restaMilisegundos = parsedDate.getTime() - today.getTime();
            const restaDias = Math.round(restaMilisegundos / (1000 * 60 * 60 * 24));

            // Filtros exactos que coinciden con los totales del Backend
            if (activeFilter === 'THIS_FRIDAY') return restaDias <= 7;
            if (activeFilter === 'NEXT_15_DAYS') return restaDias >= 8 && restaDias <= 29;
            if (activeFilter === 'FUTURE') return restaDias >= 30;
            
            return false;
        });
    };

    const filteredData = getFilteredInvoices();

    // --- FORMATO ---
    const formatCurrency = (amount: number) => 
        amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    
    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        if (dateStr.includes('T')) return new Date(dateStr).toLocaleDateString('es-MX', {day: '2-digit', month: '2-digit'});
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    };

    // --- ACCIONES PAGOS ---
    const handleEditRequest = (req: SupplierPayment) => {
        const relatedInvoice = invoices.find(inv => 
            inv.invoice_number === req.invoice_folio && inv.provider_name === req.provider_name
        );
        setSelectedInvoice(relatedInvoice || null);
        setEditingRequest(req);
    };

    const handleModalSubmit = async (payload: PaymentRequestPayload) => {
        try {
            if (editingRequest) {
                await financeService.updatePaymentRequest(editingRequest.id, payload);
                alert("✅ Solicitud actualizada correctamente.");
            } else {
                await financeService.requestPayment(payload);
                alert("✅ Solicitud enviada a Dirección.");
            }
            closeModal();
            refreshPayableData(true);
        } catch (e) {
            alert("❌ Error al procesar la solicitud.");
        }
    };

    const handleCancelRequest = async (id: number) => {
        if(!confirm("¿Estás seguro de cancelar esta solicitud? Se eliminará y el saldo volverá a estar disponible.")) return;
        try {
            await financeService.cancelPaymentRequest(id);
            refreshPayableData(true);
        } catch (e) {
            alert("Error al cancelar la solicitud.");
        }
    };

    const closeModal = () => {
        setSelectedInvoice(null);
        setEditingRequest(null);
    };

    // --- CÁLCULOS DE TOTALES ---
    const totalDebt = (stats?.overdue_amount || 0) + (stats?.next_period_amount || 0) + (stats?.future_amount || 0);
    const pendingApprovals = stats?.total_pending_approval || 0;
    const totalDocuments = (stats?.overdue_count || 0) + (stats?.next_period_count || 0) + (stats?.future_count || 0);
    
    const quotesPendingCount = pendingQuotes.length;

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-8 animate-fadeIn">
            
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-black text-slate-800">Panel de Gerencia</h1>
                <p className="text-slate-500">Visión Estratégica y Flujo de Efectivo.</p>
            </div>

            {/* --- NIVEL 1: TARJETAS SUPERIORES --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* 1. COTIZACIONES */}
                <Card 
                    onClick={() => setActiveSection(activeSection === 'QUOTES' ? null : 'QUOTES')}
                    className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full
                    ${activeSection === 'QUOTES' ? 'ring-2 ring-indigo-500 bg-indigo-50 shadow-md' : 'bg-white shadow-sm'}`}
                >
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cotizaciones</p>
                        <CheckSquare size={14} className="text-indigo-500" />
                    </div>
                    <div className="mt-1 flex justify-between items-end">
                        <div>
                            <h3 className="text-xl font-bold text-slate-700">Por Autorizar</h3>
                            {quotesPendingCount > 0 ? (
                                <p className="text-[10px] text-indigo-600 font-bold mt-1 flex items-center gap-1 animate-pulse">
                                    <Clock size={10}/> {quotesPendingCount} Pendientes
                                </p>
                            ) : (
                                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                    <CheckCircle2 size={10}/> Al día
                                </p>
                            )}
                        </div>
                        <div className="text-2xl font-black text-indigo-600/20">
                            {quotesPendingCount}
                        </div>
                    </div>
                </Card>

                {/* 2. VENTAS MES (AHORA ACTIVA Y CON COLOR VERDE/EMERALD) */}
                <Card 
                    onClick={() => setActiveSection(activeSection === 'MONTHLY_SALES' ? null : 'MONTHLY_SALES')}
                    className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full
                    ${activeSection === 'MONTHLY_SALES' ? 'ring-2 ring-emerald-500 bg-emerald-50 shadow-md' : 'bg-white shadow-sm'}`}
                >
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas Mes</p>
                        <DollarSign size={14} className="text-emerald-500" />
                    </div>
                    <div className="mt-3 flex flex-col justify-end">
                        <div className="text-2xl font-black text-emerald-600 text-right">
                            {formatCurrency(monthlySalesAmount)}
                        </div>
                    </div>
                </Card>

                {/* 3. INGRESOS */}
                <Card className="p-4 opacity-60 grayscale cursor-not-allowed border-l-4 border-l-emerald-400 bg-white h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ingresos</p>
                        <Users size={14} className="text-emerald-400" />
                    </div>
                    <div className="mt-1">
                        <h3 className="text-xl font-bold text-slate-700">Ctas. por Cobrar</h3>
                        <p className="text-[10px] text-slate-400 mt-1">Próximamente</p>
                    </div>
                </Card>

                {/* 4. CUENTAS POR PAGAR */}
                <Card 
                    onClick={() => {
                        setActiveSection(activeSection === 'PAYABLE' ? null : 'PAYABLE');
                        setActiveFilter(null);
                        setPayableViewMode('TO_REQUEST');
                    }}
                    className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-red-500 transform hover:-translate-y-1 h-full
                    ${activeSection === 'PAYABLE' ? 'ring-2 ring-red-500 bg-slate-50 shadow-md' : 'bg-white shadow-sm'}`}
                >
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas x Pagar</p>
                        <TrendingDown size={14} className="text-red-500" />
                    </div>
                    <div className="flex flex-row items-baseline mt-1 justify-between w-full">
                        {totalDocuments > 0 ? (
                            <div className="text-2xl font-black text-red-600/50">
                                {totalDocuments}
                            </div>
                        ) : <div></div>}
                        <div className="text-xl font-black text-red-600 text-right">
                            {formatCurrency(totalDebt)}
                        </div>
                    </div>
                    {pendingApprovals > 0 ? (
                        <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1">
                            <Clock size={10}/> {pendingApprovals} solicitudes
                        </p>
                    ) : (
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <CheckCircle2 size={10}/> Al día
                        </p>
                    )}
                </Card>
            </div>

            {/* --- NIVEL 2: MÓDULO DE COTIZACIONES --- */}
            {activeSection === 'QUOTES' && (
                <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setActiveSection(null)} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-indigo-500 z-10"><X size={20}/></button>

                    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                            <h3 className="font-bold text-indigo-800 flex items-center gap-2 text-lg">
                                <CheckSquare className="text-indigo-600"/> Cotizaciones Pendientes de Autorización
                            </h3>
                            <Badge variant="default" className="bg-indigo-600">{quotesPendingCount} Pendientes</Badge>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-indigo-800 uppercase bg-indigo-50/50 border-b border-indigo-100">
                                    <tr>
                                        <th className="px-6 py-4">Folio / Proyecto</th>
                                        <th className="px-6 py-4">Cliente</th>
                                        <th className="px-6 py-4 text-right">Importe Total</th>
                                        <th className="px-6 py-4">Fecha Creación</th>
                                        <th className="px-6 py-4 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {quotesPendingCount === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-slate-400 italic">No hay cotizaciones esperando autorización. ¡Todo al día!</td></tr>
                                    ) : (
                                        pendingQuotes.map((quote) => (
                                            <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-700">{quote.project_name}</div>
                                                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs">#{quote.id}</span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600">
                                                    {quote.client_name || `Cliente ID: ${quote.client_id}`}
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-slate-800">
                                                    {formatCurrency(quote.total_price)}
                                                </td>
                                                <td className="px-6 py-4 text-slate-500">
                                                    {new Date(quote.created_at).toLocaleDateString('es-MX')}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <Button 
                                                        size="sm" 
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200"
                                                        onClick={() => navigate(`/sales/edit/${quote.id}`)}
                                                    >
                                                        <Search size={16} className="mr-1"/> Revisar
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- NIVEL 2: MÓDULO DE VENTAS DEL MES --- */}
            {activeSection === 'MONTHLY_SALES' && (
                <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setActiveSection(null)} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-emerald-500 z-10"><X size={20}/></button>

                    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                            <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-lg">
                                <TrendingUp className="text-emerald-600"/> Ventas del Mes
                            </h3>
                            <Badge variant="default" className="bg-emerald-600">{monthlySales.length} Operaciones</Badge>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-emerald-800 uppercase bg-emerald-50/50 border-b border-emerald-100">
                                    <tr>
                                        <th className="px-6 py-4">Folio / Proyecto</th>
                                        <th className="px-6 py-4">Cliente</th>
                                        <th className="px-6 py-4 text-right">Importe Total</th>
                                        <th className="px-6 py-4">Fecha Venta</th>
                                        <th className="px-6 py-4 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {monthlySales.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-slate-400 italic">No hay ventas registradas este mes.</td></tr>
                                    ) : (
                                        monthlySales.map((sale) => (
                                            <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-700">{sale.project_name}</div>
                                                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs">#{sale.id}</span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600">
                                                    {sale.client_name || `Cliente ID: ${sale.client_id}`}
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-slate-800">
                                                    {formatCurrency(sale.total_price)}
                                                </td>
                                                <td className="px-6 py-4 text-slate-500">
                                                    {new Date(sale.created_at).toLocaleDateString('es-MX')}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <Button 
                                                        size="sm" 
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200"
                                                        onClick={() => navigate(`/sales/edit/${sale.id}`)}
                                                    >
                                                        <Search size={16} className="mr-1"/> Revisar
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- NIVEL 2: MÓDULO DE PAGOS --- */}
            {activeSection === 'PAYABLE' && (
                <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setActiveSection(null)} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-red-500 z-10"><X size={20}/></button>

                    {/* TABS DE NAVEGACIÓN Y BOTÓN DE EJECUCIÓN */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
                            <button onClick={() => setPayableViewMode('TO_REQUEST')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${payableViewMode === 'TO_REQUEST' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <TrendingDown size={16}/> Por Solicitar
                            </button>
                            <button onClick={() => setPayableViewMode('REQUESTED')} className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${payableViewMode === 'REQUESTED' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <Clock size={16}/> En Espera de Autorización {pendingApprovals > 0 && <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{pendingApprovals}</span>}
                            </button>
                        </div>

                        {/* EL NUEVO BOTÓN DE EJECUCIÓN (CON EL NÚMERO INTEGRADO) */}
                        <Button 
                            className={`font-bold shadow-lg transform transition hover:scale-105 ${approvedPaymentsCount > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-none ring-2 ring-emerald-200' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'}`}
                            onClick={() => setShowExecutionModal(true)}
                        >
                            {approvedPaymentsCount > 0 ? (
                                <span className="bg-white text-emerald-700 text-[11px] font-black px-2 py-0.5 rounded-md mr-2 shadow-sm animate-pulse">
                                    {approvedPaymentsCount}
                                </span>
                            ) : (
                                <CheckCircle2 size={18} className="mr-2"/>
                            )}
                            Pagos Listos para Ejecutar
                        </Button>
                    </div>

                    {/* --- VISTA 1: POR SOLICITAR --- */}
                    {payableViewMode === 'TO_REQUEST' && (
                        <>
                            <div className="flex items-center gap-2 text-slate-400 text-sm font-bold tracking-wide mb-4">
                                <TrendingDown size={16}/> <span>Flujo de Efectivo: Seleccione una tarjeta para auditar</span>
                            </div>

                            {/* TARJETAS SEMÁFORO */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* ROJA */}
                                <Card 
                                    onClick={() => setActiveFilter('THIS_FRIDAY')}
                                    className={`p-6 cursor-pointer border transition-all group relative overflow-hidden
                                    ${activeFilter === 'THIS_FRIDAY' 
                                        ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-xl scale-105 border-transparent' 
                                        : 'bg-white border-slate-200 hover:border-red-400 hover:shadow-md'}`}
                                >
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'THIS_FRIDAY' ? 'text-red-100' : 'text-red-600'}`}>
                                                <AlertTriangle className="inline mr-1 mb-1" size={14}/> Pago Inmediato
                                            </span>
                                        </div>
                                        <p className={`text-sm mb-2 ${activeFilter === 'THIS_FRIDAY' ? 'text-red-100' : 'text-slate-400'}`}>
                                            0 a 7 días
                                        </p>
                                        <div className="flex items-end justify-between">
                                            <div className={`text-xl font-bold leading-none ${activeFilter === 'THIS_FRIDAY' ? 'text-red-200' : 'text-slate-300'}`}>
                                                {stats?.overdue_count || 0}
                                            </div>
                                            <div className={`text-xl font-black text-right ${activeFilter === 'THIS_FRIDAY' ? 'text-white' : 'text-slate-800'}`}>
                                                {formatCurrency(stats?.overdue_amount || 0)}
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                {/* NARANJA */}
                                <Card 
                                    onClick={() => setActiveFilter('NEXT_15_DAYS')}
                                    className={`p-6 cursor-pointer border transition-all group relative overflow-hidden
                                    ${activeFilter === 'NEXT_15_DAYS' 
                                        ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl scale-105 border-transparent' 
                                        : 'bg-white border-slate-200 hover:border-orange-400 hover:shadow-md'}`}
                                >
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'NEXT_15_DAYS' ? 'text-orange-100' : 'text-orange-600'}`}>
                                                <Calendar className="inline mr-1 mb-1" size={14}/> Proyección Corta
                                            </span>
                                        </div>
                                        <p className={`text-sm mb-2 ${activeFilter === 'NEXT_15_DAYS' ? 'text-orange-100' : 'text-slate-400'}`}>
                                            8 a 29 días
                                        </p>
                                        <div className="flex items-end justify-between">
                                            <div className={`text-xl font-bold leading-none ${activeFilter === 'NEXT_15_DAYS' ? 'text-orange-200' : 'text-slate-300'}`}>
                                                {stats?.next_period_count || 0}
                                            </div>
                                            <div className={`text-xl font-black text-right ${activeFilter === 'NEXT_15_DAYS' ? 'text-white' : 'text-slate-800'}`}>
                                                {formatCurrency(stats?.next_period_amount || 0)}
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                {/* AMARILLO */}
                                <Card 
                                    onClick={() => setActiveFilter('FUTURE')}
                                    className={`p-6 cursor-pointer border transition-all group relative overflow-hidden
                                    ${activeFilter === 'FUTURE' 
                                        ? 'bg-gradient-to-br from-yellow-500 to-yellow-600 text-white shadow-xl scale-105 border-transparent' 
                                        : 'bg-white border-slate-200 hover:border-yellow-400 hover:shadow-md'}`}
                                >
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'FUTURE' ? 'text-yellow-100' : 'text-yellow-600'}`}>
                                                <ArrowRight className="inline mr-1 mb-1" size={14}/> Largo Plazo
                                            </span>
                                        </div>
                                        <p className={`text-sm mb-2 ${activeFilter === 'FUTURE' ? 'text-yellow-100' : 'text-slate-400'}`}>
                                            30 días o más
                                        </p>
                                        <div className="flex items-end justify-between">
                                            <div className={`text-xl font-bold leading-none ${activeFilter === 'FUTURE' ? 'text-yellow-200' : 'text-slate-300'}`}>
                                                {stats?.future_count || 0}
                                            </div>
                                            <div className={`text-xl font-black text-right ${activeFilter === 'FUTURE' ? 'text-white' : 'text-slate-800'}`}>
                                                {formatCurrency(stats?.future_amount || 0)}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            {/* TABLA DE AUDITORÍA PAGOS */}
                            {activeFilter && (
                                <div className="animate-in slide-in-from-bottom-4 duration-500 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden mt-8">
                                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                                        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                                            <Filter size={18} className="text-slate-400"/> Auditoría: 
                                            <span className={`uppercase ml-1 font-black px-2 py-0.5 rounded text-sm ${activeFilter === 'THIS_FRIDAY' ? 'bg-red-100 text-red-700' : activeFilter === 'NEXT_15_DAYS' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {activeFilter === 'THIS_FRIDAY' ? 'Pago Inmediato' : activeFilter === 'NEXT_15_DAYS' ? 'Proyección 15 Días' : 'Futuros'}
                                            </span>
                                        </h3>
                                        <Badge variant="secondary" className="text-sm px-3 py-1">{filteredData.length} Documentos</Badge>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                                                <tr><th className="px-6 py-4">Proveedor</th><th className="px-6 py-4">Factura</th><th className="px-6 py-4">Vencimiento</th><th className="px-6 py-4 text-right">Saldo Deuda</th><th className="px-6 py-4 text-center">Acción</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {loading ? (
                                                    <tr><td colSpan={5} className="text-center py-12 text-slate-400">Cargando datos...</td></tr>
                                                ) : filteredData.length === 0 ? (
                                                    <tr><td colSpan={5} className="text-center py-12 text-slate-400 italic">No hay documentos pendientes.</td></tr>
                                                ) : (
                                                    filteredData.map((inv) => {
                                                        const allActiveRequests = [...sentRequests, ...approvedRequests];
                                                        
                                                        const activeRequestsForThisInvoice = allActiveRequests.filter(
                                                            req => req.invoice_folio === inv.invoice_number && req.provider_name === inv.provider_name
                                                        );
                                                        
                                                        const hasActiveRequest = activeRequestsForThisInvoice.length > 0;
                                                        const moneyAlreadyRequested = activeRequestsForThisInvoice.reduce((sum, req) => sum + req.amount, 0);
                                                        
                                                        const isAlreadyApproved = activeRequestsForThisInvoice.some(req => 
                                                            approvedRequests.find(ar => ar.id === req.id)
                                                        );
                                                        
                                                        const statusLabel = isAlreadyApproved ? "Autorizado (Pend. Pago)" : "En Proceso";

                                                        let accountName = "Sin cuenta sugerida";
                                                        if (hasActiveRequest && activeRequestsForThisInvoice[0].suggested_account_id) {
                                                            const acc = accounts.find(a => a.id === activeRequestsForThisInvoice[0].suggested_account_id);
                                                            if (acc) accountName = acc.name;
                                                        }

                                                        return (
                                                            <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                                                <td className="px-6 py-4 font-bold text-slate-700">{inv.provider_name}</td>
                                                                <td className="px-6 py-4"><span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 text-xs">{inv.invoice_number}</span></td>
                                                                <td className="px-6 py-4 text-slate-600"><div className="flex items-center gap-2"><Calendar size={14} className="text-slate-400"/>{formatDate(inv.due_date)}</div></td>
                                                                
                                                                <td className="px-6 py-4 text-right">
                                                                    <div className="font-black text-slate-800">{formatCurrency(inv.outstanding_balance)}</div>
                                                                </td>
                                                                
                                                                <td className="px-6 py-4 text-center align-middle">
                                                                    {hasActiveRequest ? (
                                                                        <div className={`inline-flex flex-col items-center justify-center py-1.5 px-3 rounded-md border cursor-not-allowed w-full min-w-[140px] shadow-sm ${isAlreadyApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                                            <span className="text-[11px] font-bold mb-0.5">{statusLabel}: {formatCurrency(moneyAlreadyRequested)}</span>
                                                                            <span className="text-[9px] font-bold bg-white/60 px-2 py-0.5 rounded-full truncate max-w-[140px]" title={accountName}>
                                                                                {accountName}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <Button 
                                                                            size="sm" 
                                                                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm w-full min-w-[140px]"
                                                                            onClick={() => setSelectedInvoice(inv)}
                                                                        >
                                                                            <CheckCircle2 size={16} className="mr-1"/> Solicitar
                                                                        </Button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* --- VISTA 2: SOLICITUDES ENVIADAS --- */}
                    {payableViewMode === 'REQUESTED' && (
                        <div className="animate-in slide-in-from-right-4 duration-300">
                            <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                                <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                                    <h3 className="font-bold text-indigo-800 flex items-center gap-2 text-lg"><Clock className="text-indigo-600"/> Solicitudes en Espera de Dirección</h3>
                                    
                                    {/* --- BOTÓN DE AUTORIZACIÓN PARA EL DIRECTOR --- */}
                                    {isDirector && sentRequests.length > 0 && (
                                        <Button 
                                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-md shadow-emerald-200"
                                            onClick={() => setShowApprovalModal(true)}
                                        >
                                            <Check size={18} className="mr-2"/> Revisar y Autorizar
                                        </Button>
                                    )}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-xs text-indigo-800 uppercase bg-indigo-50/50 border-b border-indigo-100">
                                            <tr><th className="px-6 py-4">Proveedor</th><th className="px-6 py-4">Detalle Factura</th><th className="px-6 py-4">Monto Solicitado</th><th className="px-6 py-4">Fecha Solicitud</th><th className="px-6 py-4 text-center">Acciones</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {loading ? (
                                                <tr><td colSpan={5} className="text-center py-12 text-slate-400">Cargando solicitudes...</td></tr>
                                            ) : sentRequests.length === 0 ? (
                                                <tr><td colSpan={5} className="text-center py-12 text-slate-400 italic">No hay solicitudes pendientes de aprobación.</td></tr>
                                            ) : (
                                                sentRequests.map((req) => (
                                                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-6 py-4 font-bold text-slate-700">{req.provider_name}</td>
                                                        <td className="px-6 py-4"><div className="flex flex-col"><span className="font-mono text-xs text-slate-500">Folio: {req.invoice_folio}</span>{req.notes && <span className="text-[10px] text-amber-600 mt-1 italic">"{req.notes}"</span>}</div></td>
                                                        <td className="px-6 py-4 font-black text-slate-800">{formatCurrency(req.amount)}</td>
                                                        <td className="px-6 py-4 text-slate-500">{new Date(req.created_at).toLocaleDateString('es-MX')}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button onClick={() => handleEditRequest(req)} title="Editar Solicitud" className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"><Edit2 size={16}/></button>
                                                                <button onClick={() => handleCancelRequest(req.id)} title="Cancelar Solicitud" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={16}/></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
            )}

            {/* MODALES */}
            
            {(selectedInvoice || editingRequest) && (
                <PaymentRequestModal 
                    invoice={selectedInvoice || undefined}
                    existingRequest={editingRequest || undefined}
                    onClose={closeModal}
                    onSubmit={handleModalSubmit}
                />
            )}

            {showExecutionModal && (
                <PaymentExecutionModal 
                    onClose={() => setShowExecutionModal(false)}
                    onSuccess={() => {
                        setShowExecutionModal(false);
                        refreshPayableData(true);
                    }}
                />
            )}

            {/* MODAL DE AUTORIZACIÓN PARA DIRECCIÓN */}
            {showApprovalModal && isDirector && (
                <PaymentApprovalModal 
                    onClose={() => setShowApprovalModal(false)}
                    onUpdate={() => refreshPayableData(true)}
                />
            )}

        </div>
    );
};

export default ManagementDashboard;