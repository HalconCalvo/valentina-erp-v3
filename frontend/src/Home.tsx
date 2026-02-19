import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, PenTool, Package, 
  Users, Truck, PlusCircle, Search, 
  TrendingDown, Shield, Calendar, Clock,
  AlertTriangle, CheckCircle, DollarSign, Wallet,
  FileText, Filter, CheckCircle2, X, Briefcase, TrendingUp, ArrowRight, ClipboardList, Undo2, Eye, Pencil, Trash2, Send
} from 'lucide-react';

// SERVICES & HOOKS
import { useSales } from './modules/sales/hooks/useSales';
import { financeService } from './api/finance-service';
import { AccountsPayableStats, PendingInvoice } from './types/finance';

// UI COMPONENTS
import { SalesOrderStatus } from './types/sales';
import Card from './components/ui/Card';
import Button from './components/ui/Button';
import Badge from './components/ui/Badge';
import { FinancialReviewModal } from './modules/management/components/FinancialReviewModal';
import { PaymentRequestModal } from './modules/management/components/PaymentRequestModal';
import { PaymentApprovalModal } from './modules/management/components/PaymentApprovalModal'; 

// Tipos locales
type PayableFilter = 'THIS_FRIDAY' | 'NEXT_15_DAYS' | 'FUTURE' | null;
type SalesViewMode = 'NONE' | 'PENDING_AUTH' | 'MONTHLY_SALES';

const Home: React.FC = () => {
  const navigate = useNavigate();
  
  // --- 1. ESTADOS DE USUARIO ---
  const [userRole, setUserRole] = useState('DIRECTOR'); 
  const [userId, setUserId] = useState<number | null>(null);
  const [userName, setUserName] = useState('Usuario');
  const [currentTime, setCurrentTime] = useState(new Date());

  // ESTADOS DE DATOS
  const { orders, fetchOrders } = useSales(); 
  const [apStats, setApStats] = useState<AccountsPayableStats | null>(null);
  
  // --- ESTADOS PARA PAGOS (TIPO GERENCIA) ---
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [loadingPayables, setLoadingPayables] = useState(false);
  const [activeFilter, setActiveFilter] = useState<PayableFilter>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
  
  // CONTROL DE VISTAS Y MODALES (DIRECTOR)
  const [activeView, setActiveView] = useState<'NONE' | 'PAYABLES' | 'SALES_AUDIT'>('NONE');
  const [salesTab, setSalesTab] = useState<'dashboard' | 'history'>('dashboard');
  
  // --- ESTADOS ESPECÍFICOS DE VENTAS (VENDEDOR) ---
  const [salesViewMode, setSalesViewMode] = useState<SalesViewMode>('NONE');
  
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // --- FUNCIÓN STATUS BADGE ---
  const renderStatusBadge = (status: SalesOrderStatus) => {
    const colors: any = {
      DRAFT: "bg-gray-100 text-gray-800",
      SENT: "bg-amber-100 text-amber-800",
      ACCEPTED: "bg-blue-100 text-blue-800", 
      CHANGE_REQUESTED: "bg-orange-100 text-orange-800",
      SOLD: "bg-emerald-100 text-emerald-800",  
      PAID: "bg-teal-100 text-teal-800",        
      REJECTED: "bg-red-100 text-red-800",
      CLIENT_REJECTED: "bg-red-100 text-red-800",
    };

    const labels: any = {
        DRAFT: "Borrador",
        SENT: "Por Autorizar",
        ACCEPTED: "Autorizada",
        CHANGE_REQUESTED: "Cambios Solicitados",
        SOLD: "Vendida",
        PAID: "Pagada",
        REJECTED: "Rechazada Int.",
        CLIENT_REJECTED: "Rechazada Cte."
    };
    
    return (
      <span className={`px-2 py-0.5 inline-flex text-[10px] uppercase tracking-wide font-bold rounded-full border ${colors[status] ? colors[status].replace('text-', 'border-').replace('800', '200') : 'border-gray-200'} ${colors[status] || "bg-gray-100 text-gray-800"}`}>
        {labels[status] || status}
      </span>
    );
  };

  // --- EFECTO 1: RELOJ Y ROL ---
  useEffect(() => {
    const storedRole = (localStorage.getItem('user_role') || 'DIRECTOR').toUpperCase();
    const storedName = localStorage.getItem('full_name') || localStorage.getItem('user_name') || 'Usuario';
    const storedId = localStorage.getItem('user_id');

    setUserRole(storedRole);
    setUserName(storedName);
    if (storedId) setUserId(parseInt(storedId));

    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000 * 60); 
    return () => clearInterval(clockTimer);
  }, []);

  // --- EFECTO 2: POLLING DE DATOS (AUTO-REFRESH) ---
  useEffect(() => {
    const refreshData = () => {
        // 1. Siempre actualizamos las órdenes
        if (fetchOrders) fetchOrders();
        
        // 2. Si es Director, actualizamos finanzas
        if (userRole === 'ADMIN' || userRole === 'DIRECTOR') {
            financeService.getPayableDashboardStats()
                .then(stats => setApStats(stats))
                .catch(err => console.error("Error polling finance:", err));
        }
    };

    // Carga inicial
    refreshData();

    // Intervalo de 30 segundos
    const intervalId = setInterval(refreshData, 30000);

    return () => clearInterval(intervalId);
  }, [userRole, fetchOrders]); 

  // --- LÓGICA DE KPI PARA VENDEDOR ---
  const salesKpis = useMemo(() => {
      if (!orders) return { pendingAuth: [], monthlySales: [], monthlyAmount: 0, monthlyCommissions: 0 };
      
      let myOrders = orders;
      if (userRole === 'SALES' && userId) {
          myOrders = orders.filter(o => Number(o.user_id) === userId);
      }

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // 1. Por Autorizar
      const pendingAuth = myOrders.filter(o => o.status === SalesOrderStatus.SENT);

      // 2. Ventas del Mes
      const monthlySales = myOrders.filter(o => {
          if (o.status !== SalesOrderStatus.SOLD && o.status !== SalesOrderStatus.PAID) return false;
          const d = o.created_at ? new Date(o.created_at) : new Date();
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const monthlyAmount = monthlySales.reduce((sum, o) => sum + (o.total_price || 0), 0);
      
      // 3. Comisiones (LECTURA DIRECTA LIMPIA)
      const monthlyCommissions = monthlySales.reduce((sum, o) => {
          const realCommission = Number(o.commission_amount) || 0;
          return sum + realCommission;
      }, 0);

      return {
          pendingAuth,
          monthlySales,
          monthlyAmount,
          monthlyCommissions
      };
  }, [orders, userRole, userId]);

  // --- LÓGICA DE DIRECTOR: TOGGLE VIEW ---
  const toggleSalesView = (targetTab: 'dashboard' | 'history') => {
    if (activeView === 'SALES_AUDIT' && salesTab === targetTab) {
        setActiveView('NONE');
    } else {
        setActiveView('SALES_AUDIT');
        setSalesTab(targetTab);
    }
  };

  const togglePayables = () => {
    if (activeView === 'PAYABLES') setActiveView('NONE');
    else setActiveView('PAYABLES');
  };

  // --- LÓGICA DE DIRECTOR: FILTRADO TABLA ---
  const directorFilteredOrders = useMemo(() => {
      if (!orders) return [];
      const base = orders.filter(o => o.status !== SalesOrderStatus.DRAFT);
      
      switch (salesTab) {
          case 'dashboard': 
              // Solo mostrar SENT.
              return base.filter(o => o.status === SalesOrderStatus.SENT);
          case 'history': 
              const now = new Date();
              return base.filter(o => {
                  const isSold = o.status === SalesOrderStatus.PAID || o.status === SalesOrderStatus.SOLD;
                  const d = o.created_at ? new Date(o.created_at) : new Date();
                  return isSold && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              });
          default: return base;
      }
  }, [orders, salesTab]);

  // --- CARGA DE FACTURAS (DIRECTOR) ---
  useEffect(() => {
      if (activeView === 'PAYABLES') {
          setLoadingPayables(true);
          financeService.getPendingInvoices()
              .then(data => setInvoices(data))
              .finally(() => setLoadingPayables(false));
      } else {
          setActiveFilter(null);
      }
  }, [activeView]);

  const getFilteredInvoices = () => {
      if (!activeFilter) return [];
      const today = new Date();
      today.setHours(0,0,0,0);
      const dayOfWeek = today.getDay(); 
      let daysUntilFriday = 5 - dayOfWeek;
      if (dayOfWeek === 6) { daysUntilFriday = 6; }
      const cutoffDate = new Date(today);
      cutoffDate.setDate(today.getDate() + daysUntilFriday);
      cutoffDate.setHours(23, 59, 59, 999);
      const nextPeriodLimit = new Date(cutoffDate);
      nextPeriodLimit.setDate(cutoffDate.getDate() + 15);

      return invoices.filter(inv => {
          const dueDate = new Date(inv.due_date + 'T12:00:00'); 
          if (activeFilter === 'THIS_FRIDAY') return dueDate <= cutoffDate;
          if (activeFilter === 'NEXT_15_DAYS') return dueDate > cutoffDate && dueDate <= nextPeriodLimit;
          if (activeFilter === 'FUTURE') return dueDate > nextPeriodLimit;
          return false;
      });
  };
  const filteredPayables = getFilteredInvoices();

  const handleRequestPayment = async (payload: any) => {
      try {
          await financeService.requestPayment(payload);
          alert("Solicitud enviada a Dirección");
          setSelectedInvoice(null);
          const stats = await financeService.getPayableDashboardStats();
          setApStats(stats);
          const newInvoices = await financeService.getPendingInvoices();
          setInvoices(newInvoices);
      } catch (e) {
          alert("Error al solicitar pago");
      }
  };

  // --- FORMATO ---
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  };
  const formatDate = (dateStr: string) => {
      if (!dateStr) return "-";
      if (dateStr.includes('T')) return new Date(dateStr).toLocaleDateString('es-MX', {day: '2-digit', month: '2-digit'});
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}`;
  };

  // --- CONFIG HERO ---
  const getRoleConfig = () => {
    switch (userRole) {
      case 'SALES': return { title: 'Panel Comercial', subtitle: 'Tus objetivos y seguimiento.', color: 'from-emerald-500 to-teal-600', shortcuts: [] };
      case 'DESIGN': return { title: 'Ingeniería', subtitle: 'Desarrollo de productos.', color: 'from-pink-500 to-rose-600', shortcuts: [{ label: 'Nuevo Producto', icon: PlusCircle, path: '/design', color: 'bg-pink-100 text-pink-700' }, { label: 'Catálogo', icon: PenTool, path: '/design', color: 'bg-purple-100 text-purple-700' }, { label: 'Materiales', icon: Package, path: '/materials', color: 'bg-amber-100 text-amber-700' }, { label: 'Producción', icon: LayoutDashboard, path: '/production', color: 'bg-slate-100 text-slate-700' }] };
      case 'WAREHOUSE': return { title: 'Logística', subtitle: 'Control de inventarios.', color: 'from-orange-500 to-amber-600', shortcuts: [{ label: 'Recepción', icon: ClipboardList, path: '/inventory/reception', color: 'bg-orange-100 text-orange-700' }, { label: 'Inventario', icon: Package, path: '/materials', color: 'bg-emerald-100 text-emerald-700' }, { label: 'Proveedores', icon: Truck, path: '/providers', color: 'bg-blue-100 text-blue-700' }, { label: 'Movimientos', icon: Search, path: '/inventory/movements', color: 'bg-slate-100 text-slate-700' }] };
      case 'PRODUCTION': return { title: 'Fábrica', subtitle: 'Gestión de producción.', color: 'from-blue-600 to-indigo-700', shortcuts: [{ label: 'Órdenes', icon: ClipboardList, path: '/production', color: 'bg-blue-100 text-blue-700' }, { label: 'Materiales', icon: Package, path: '/materials', color: 'bg-slate-100 text-slate-700' }] };
      case 'ADMIN': return { title: 'Administración', subtitle: 'Finanzas y Control.', color: 'from-indigo-600 to-violet-800', shortcuts: [] };
      default: return { title: 'Dirección General', subtitle: 'Cuadro de Mando Integral.', color: 'from-slate-800 to-black', shortcuts: [] };
    }
  };
  const config = getRoleConfig();
  const getGreeting = () => { const h = currentTime.getHours(); return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches'; };

  const isDirectorOrAdmin = userRole === 'ADMIN' || userRole === 'DIRECTOR';
  const isSales = userRole === 'SALES';

  // --- KPI DATA PARA DIRECTOR ---
  const pendingApprovals = apStats?.total_pending_approval || 0;
  const totalDebt = (apStats?.overdue_amount || 0) + (apStats?.next_period_amount || 0) + (apStats?.future_amount || 0);
  const totalDocuments = (apStats?.overdue_count || 0) + (apStats?.next_period_count || 0) + (apStats?.future_count || 0);
  
  const directorPendingAuthCount = orders ? orders.filter(o => o.status === SalesOrderStatus.SENT).length : 0;
  const directorPendingAuthAmount = orders ? orders.filter(o => o.status === SalesOrderStatus.SENT).reduce((sum, o) => sum + (o.total_price || 0), 0) : 0;
  
  const directorMonthlySalesAmount = orders ? orders.filter(o => {
      const isSold = o.status === SalesOrderStatus.PAID || o.status === SalesOrderStatus.SOLD;
      const d = o.created_at ? new Date(o.created_at) : new Date();
      return isSold && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
  }).reduce((sum, o) => sum + (o.total_price || 0), 0) : 0;

  const directorReceivablesAmount = orders ? orders.filter(o => o.status === SalesOrderStatus.SOLD).reduce((sum, o) => sum + (o.total_price || 0), 0) : 0;


  return (
    <div className="min-h-full p-8 space-y-8 animate-in fade-in duration-500 pb-24">
      
      {/* HERO SECTION */}
      <div className={`rounded-2xl shadow-xl p-8 text-white bg-gradient-to-r ${config.color} relative overflow-hidden transition-colors duration-500`}>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-sm font-medium mb-1">
              <Calendar size={14}/> {currentTime.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-2">{getGreeting()}, <span className="opacity-90">{userName}</span></h1>
            <p className="text-white/80 max-w-lg text-lg">{config.subtitle}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-lg border border-white/10">
            <div className="flex items-center gap-2"><Clock size={18}/><span className="font-mono text-xl font-bold">{currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div>
          </div>
        </div>
      </div>

      {/* --- VISTA: VENDEDOR (SALES) --- */}
      {isSales ? (
         <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* 1. NUEVA COTIZACIÓN */}
                <Card 
                    onClick={() => navigate('/sales/new')}
                    className="p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 bg-white shadow-sm h-full"
                >
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Acción Rápida</p>
                        <PlusCircle size={14} className="text-emerald-500" />
                    </div>
                    <div className="mt-4">
                        <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">Nueva Cotización</h3>
                        <p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1"><Briefcase size={10}/> Iniciar proceso</p>
                    </div>
                </Card>

                {/* 2. POR AUTORIZAR */}
                <Card 
                    onClick={() => setSalesViewMode(salesViewMode === 'PENDING_AUTH' ? 'NONE' : 'PENDING_AUTH')}
                    className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 h-full shadow-sm
                    ${salesViewMode === 'PENDING_AUTH' ? 'bg-amber-50 ring-2 ring-amber-200' : 'bg-white'}`}
                >
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Autorizar</p>
                        <Clock size={14} className="text-amber-500" />
                    </div>
                    <div className="flex flex-row items-baseline mt-1">
                        {salesKpis.pendingAuth.length > 0 && <div className="text-2xl font-black text-amber-600/60">{salesKpis.pendingAuth.length}</div>}
                        <div className="ml-auto text-2xl font-black text-amber-600">
                             {salesKpis.pendingAuth.length}
                        </div>
                    </div>
                </Card>

                {/* 3. VENTAS MES */}
                <Card 
                    onClick={() => setSalesViewMode(salesViewMode === 'MONTHLY_SALES' ? 'NONE' : 'MONTHLY_SALES')}
                    className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full shadow-sm
                    ${salesViewMode === 'MONTHLY_SALES' ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'bg-white'}`}
                >
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas Mes</p>
                        <TrendingUp size={14} className="text-indigo-500" />
                    </div>
                    <div className="flex flex-row items-baseline mt-1">
                        <div className="ml-auto text-2xl font-black text-indigo-600">{formatCurrency(salesKpis.monthlyAmount)}</div>
                    </div>
                </Card>

                {/* 4. COMISIONES */}
                <Card className="p-4 bg-white border-l-4 border-l-emerald-400 h-full shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1">
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Comisiones</p>
                        <Wallet size={14} className="text-emerald-400" />
                    </div>
                    <div className="flex flex-row items-baseline mt-1">
                        <div className="ml-auto text-2xl font-black text-emerald-600">{formatCurrency(salesKpis.monthlyCommissions)}</div>
                    </div>
                </Card>
            </div>

            {/* SECCIONES INTERACTIVAS VENDEDOR */}
            {salesViewMode === 'PENDING_AUTH' && (
                 <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                     <button onClick={() => setSalesViewMode('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-amber-500 z-10"><X size={20}/></button>
                     <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
                            <h3 className="font-bold text-amber-800 flex items-center gap-2 text-lg"><Clock size={18}/> Cotizaciones Esperando Firma</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-amber-800 uppercase bg-amber-50/50 border-b border-amber-100">
                                    <tr><th className="px-6 py-4">Proyecto</th><th className="px-6 py-4">Monto</th><th className="px-6 py-4">Fecha Envío</th><th className="px-6 py-4 text-center">Estatus</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {salesKpis.pendingAuth.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-slate-400 italic">No hay cotizaciones pendientes.</td></tr>
                                    ) : (
                                        salesKpis.pendingAuth.map(o => (
                                            <tr key={o.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 font-bold text-slate-700">{o.project_name}</td>
                                                <td className="px-6 py-4 text-slate-700">{formatCurrency(o.total_price)}</td>
                                                <td className="px-6 py-4 text-slate-500">{formatDate(o.created_at)}</td>
                                                <td className="px-6 py-4 text-center">{renderStatusBadge(o.status as SalesOrderStatus)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                     </div>
                 </div>
            )}
            
            {salesViewMode === 'MONTHLY_SALES' && (
                <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setSalesViewMode('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-indigo-500 z-10"><X size={20}/></button>
                    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                            <h3 className="font-bold text-indigo-800 flex items-center gap-2 text-lg"><TrendingUp size={18}/> Ventas del Mes y Estatus de Producción</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-indigo-800 uppercase bg-indigo-50/50 border-b border-indigo-100">
                                    <tr><th className="px-6 py-4">Proyecto</th><th className="px-6 py-4 text-right">Monto Venta</th><th className="px-6 py-4 text-center">Estatus Producción (Simulado)</th><th className="px-6 py-4 text-center">Entrega Estimada</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {salesKpis.monthlySales.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-slate-400 italic">No hay ventas cerradas este mes.</td></tr>
                                    ) : (
                                        salesKpis.monthlySales.map((sale) => {
                                            const statuses = ['EN PRODUCCIÓN', 'LISTO PARA ENTREGA', 'EN INSTALACIÓN', 'ENTREGADO'];
                                            const randomStatus = statuses[sale.id % statuses.length]; 
                                            let badgeColor = 'bg-slate-100 text-slate-600';
                                            if (randomStatus === 'EN PRODUCCIÓN') badgeColor = 'bg-blue-100 text-blue-700';
                                            if (randomStatus === 'LISTO PARA ENTREGA') badgeColor = 'bg-amber-100 text-amber-700';
                                            if (randomStatus === 'EN INSTALACIÓN') badgeColor = 'bg-purple-100 text-purple-700';
                                            if (randomStatus === 'ENTREGADO') badgeColor = 'bg-emerald-100 text-emerald-700';
                                            return (
                                                <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4"><div className="font-bold text-slate-700">{sale.project_name}</div><span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs">#{sale.id}</span></td>
                                                    <td className="px-6 py-4 text-right font-black text-slate-800">{formatCurrency(sale.total_price)}</td>
                                                    <td className="px-6 py-4 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${badgeColor}`}>{randomStatus}</span></td>
                                                    <td className="px-6 py-4 text-center text-slate-500">{new Date(Date.now() + (sale.id * 100000000)).toLocaleDateString('es-MX')}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
         </div>

      ) : isDirectorOrAdmin ? (
        // --- VISTA: DIRECTOR/ADMIN ---
        <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* 1. POR AUTORIZAR (Toggle Table) */}
                <div onClick={() => toggleSalesView('dashboard')} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95">
                    <Card className={`p-4 h-full border-l-4 ${directorPendingAuthCount > 0 ? 'border-l-amber-500 ring-2 ring-amber-100 bg-amber-50/50' : 'border-l-emerald-500 bg-white shadow-sm'} ${activeView === 'SALES_AUDIT' && salesTab === 'dashboard' ? 'ring-2 ring-indigo-500' : ''}`}>
                        <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Autorizar</p>{directorPendingAuthCount > 0 ? <AlertTriangle size={14} className="text-amber-500 animate-pulse"/> : <CheckCircle size={14} className="text-emerald-500"/>}</div>
                        <div className="flex flex-row items-baseline mt-1">
                            {directorPendingAuthCount > 0 && <div className={`text-2xl font-black ${directorPendingAuthCount > 0 ? 'text-amber-600/60' : 'text-emerald-600/60'}`}>{directorPendingAuthCount}</div>}
                            <div className={`ml-auto text-2xl font-black ${directorPendingAuthCount > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{formatCurrency(directorPendingAuthAmount)}</div>
                        </div>
                    </Card>
                </div>

                {/* 2. VENTAS MES (Toggle Table) */}
                <div onClick={() => toggleSalesView('history')} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95">
                    <Card className={`p-4 h-full border-l-4 border-l-emerald-500 bg-white shadow-sm ${activeView === 'SALES_AUDIT' && salesTab === 'history' ? 'ring-2 ring-indigo-500' : ''}`}>
                        <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas {new Date().toLocaleString('es-MX', { month: 'long' })}</p><DollarSign size={14} className="text-emerald-500"/></div>
                        <div className="flex flex-row items-baseline mt-1">
                            <div className="ml-auto text-2xl font-black text-emerald-600">{formatCurrency(directorMonthlySalesAmount)}</div>
                        </div>
                    </Card>
                </div>

                {/* 3. CUENTAS POR COBRAR */}
                <Card className="p-4 h-full border-l-4 border-l-emerald-500 bg-white shadow-sm">
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas x Cobrar</p><Wallet size={14} className="text-indigo-400"/></div>
                    <div className="flex flex-row items-baseline mt-1">
                        <div className="ml-auto text-2xl font-black text-indigo-600">{formatCurrency(directorReceivablesAmount)}</div>
                    </div>
                </Card>

                {/* 4. CUENTAS POR PAGAR (Toggle) */}
                <div onClick={togglePayables} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95">
                    <Card className={`p-4 h-full border-l-4 border-l-red-500 ${activeView === 'PAYABLES' ? 'bg-slate-50 ring-2 ring-indigo-500 shadow-md' : 'bg-white shadow-sm'}`}>
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas x Pagar</p>
                            <TrendingDown size={14} className="text-red-500"/>
                        </div>
                        <div className="flex flex-row items-baseline mt-1 justify-between w-full">
                            {totalDocuments > 0 ? (
                                <div className="text-2xl font-black text-red-600/50 animate-pulse">{totalDocuments}</div>
                            ) : <div></div>}
                            <div className="text-xl font-black text-red-600 text-right">{formatCurrency(totalDebt)}</div>
                        </div>
                        {pendingApprovals > 0 ? (
                            <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle size={10}/> ¡{pendingApprovals} firmas pendientes!</p>
                        ) : (
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><CheckCircle size={10}/> Sin solicitudes</p>
                        )}
                    </Card>
                </div>
            </div>

            {/* TABLA DE AUDITORÍA DE VENTAS (DIRECTOR) */}
            {activeView === 'SALES_AUDIT' && (
                <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setActiveView('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-red-500 z-10"><X size={20}/></button>
                     <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                {salesTab === 'dashboard' ? <AlertTriangle className="text-amber-500"/> : <CheckCircle className="text-emerald-500"/>}
                                {salesTab === 'dashboard' ? 'Cotizaciones por Autorizar' : 'Ventas del Mes'}
                            </h3>

                            {directorFilteredOrders.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 rounded border border-dashed border-slate-300">
                                    <p className="text-slate-400">No hay registros para mostrar en esta sección.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-200">
                                            <tr><th className="px-6 py-4">Proyecto</th><th className="px-6 py-4 text-center">Estatus</th><th className="px-6 py-4 text-right">Monto</th><th className="px-6 py-4 text-center">Acción</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {directorFilteredOrders.map(o => (
                                                <tr key={o.id}>
                                                    <td className="px-6 py-4 font-bold">{o.project_name}</td>
                                                    <td className="px-6 py-4 text-center">{renderStatusBadge(o.status as SalesOrderStatus)}</td>
                                                    <td className="px-6 py-4 text-right">{formatCurrency(o.total_price)}</td>
                                                    <td className="px-6 py-4 text-center"><Button size="sm" variant="ghost" onClick={() => setSelectedOrderId(o.id)}>Ver</Button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* VISTA DE PAGOS (DIRECTOR) */}
            {activeView === 'PAYABLES' && apStats && (
                 <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setActiveView('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-red-500 z-10"><X size={20}/></button>
                    {pendingApprovals > 0 && (
                        <div className="mb-6 bg-gradient-to-r from-indigo-600 to-violet-700 rounded-xl p-6 text-white shadow-lg flex items-center justify-between animate-pulse-slow">
                            <div><h3 className="text-xl font-black flex items-center gap-2"><FileText/> Firmas Requeridas</h3><p className="opacity-90">Tienes {pendingApprovals} solicitudes de pago.</p></div>
                            <Button className="bg-white !text-indigo-700 hover:!bg-indigo-700 hover:!text-white transition-colors font-bold border-none shadow-sm" onClick={() => setShowPaymentModal(true)}>Revisar Solicitudes</Button>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-500 font-medium mb-4"><TrendingDown size={18}/> <span>Flujo de Efectivo: Seleccione una tarjeta para auditar</span></div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card onClick={() => setActiveFilter('THIS_FRIDAY')} className={`p-6 cursor-pointer border transition-all group relative overflow-hidden ${activeFilter === 'THIS_FRIDAY' ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-xl scale-105 border-transparent' : 'bg-white border-slate-200 hover:border-red-400 hover:shadow-md'}`}>
                            <div className="relative z-10">
                                <div className="flex justify-between items-center mb-4"><span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'THIS_FRIDAY' ? 'text-red-100' : 'text-red-600'}`}><AlertTriangle className="inline mr-1 mb-1" size={14}/> Pago Inmediato</span></div>
                                <p className={`text-sm mb-2 ${activeFilter === 'THIS_FRIDAY' ? 'text-red-100' : 'text-slate-400'}`}>Vencido + Este Viernes</p>
                                <div className="flex items-end justify-between"><div className={`text-xl font-bold leading-none ${activeFilter === 'THIS_FRIDAY' ? 'text-red-200' : 'text-slate-300'}`}>{apStats.overdue_count || 0}</div><div className={`text-xl font-black text-right ${activeFilter === 'THIS_FRIDAY' ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(apStats.overdue_amount)}</div></div>
                            </div>
                        </Card>
                        <Card onClick={() => setActiveFilter('NEXT_15_DAYS')} className={`p-6 cursor-pointer border transition-all group relative overflow-hidden ${activeFilter === 'NEXT_15_DAYS' ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl scale-105 border-transparent' : 'bg-white border-slate-200 hover:border-orange-400 hover:shadow-md'}`}>
                            <div className="relative z-10">
                                <div className="flex justify-between items-center mb-4"><span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'NEXT_15_DAYS' ? 'text-orange-100' : 'text-orange-600'}`}><Calendar className="inline mr-1 mb-1" size={14}/> Proyección Corta</span></div>
                                <p className={`text-sm mb-2 ${activeFilter === 'NEXT_15_DAYS' ? 'text-orange-100' : 'text-slate-400'}`}>Siguientes 15 Días</p>
                                <div className="flex items-end justify-between"><div className={`text-xl font-bold leading-none ${activeFilter === 'NEXT_15_DAYS' ? 'text-orange-200' : 'text-slate-300'}`}>{apStats.next_period_count || 0}</div><div className={`text-xl font-black text-right ${activeFilter === 'NEXT_15_DAYS' ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(apStats.next_period_amount)}</div></div>
                            </div>
                        </Card>
                        <Card onClick={() => setActiveFilter('FUTURE')} className={`p-6 cursor-pointer border transition-all group relative overflow-hidden ${activeFilter === 'FUTURE' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xl scale-105 border-transparent' : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md'}`}>
                            <div className="relative z-10">
                                <div className="flex justify-between items-center mb-4"><span className={`text-xs font-bold uppercase tracking-wider ${activeFilter === 'FUTURE' ? 'text-emerald-100' : 'text-emerald-600'}`}><CheckCircle className="inline mr-1 mb-1" size={14}/> Largo Plazo</span></div>
                                <p className={`text-sm mb-2 ${activeFilter === 'FUTURE' ? 'text-emerald-100' : 'text-slate-400'}`}>Vencimientos Futuros</p>
                                <div className="flex items-end justify-between"><div className={`text-xl font-bold leading-none ${activeFilter === 'FUTURE' ? 'text-emerald-200' : 'text-slate-300'}`}>{apStats.future_count || 0}</div><div className={`text-xl font-black text-right ${activeFilter === 'FUTURE' ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(apStats.future_amount)}</div></div>
                            </div>
                        </Card>
                     </div>
                     {activeFilter && (
                        <div className="animate-fadeInUp bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mt-8">
                            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Filter size={18} className="text-slate-400"/> Auditoría: <span className={`uppercase ml-1 font-black px-2 py-0.5 rounded text-sm ${activeFilter === 'THIS_FRIDAY' ? 'bg-red-100 text-red-700' : activeFilter === 'NEXT_15_DAYS' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>{activeFilter === 'THIS_FRIDAY' ? 'Pago Inmediato' : activeFilter === 'NEXT_15_DAYS' ? 'Proyección 15 Días' : 'Futuros'}</span></h3><Badge variant="secondary">{filteredPayables.length} Documentos</Badge></div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left"><thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100"><tr><th className="px-6 py-4">Proveedor</th><th className="px-6 py-4">Factura</th><th className="px-6 py-4">Vencimiento</th><th className="px-6 py-4 text-right">Saldo</th><th className="px-6 py-4 text-center">Acción</th></tr></thead><tbody className="divide-y divide-slate-50">{loadingPayables ? (<tr><td colSpan={5} className="text-center py-12 text-slate-400">Cargando datos...</td></tr>) : filteredPayables.length === 0 ? (<tr><td colSpan={5} className="text-center py-12 text-slate-400 italic">No hay documentos pendientes.</td></tr>) : (filteredPayables.map((inv) => (<tr key={inv.id} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-4 font-bold text-slate-700">{inv.provider_name}</td><td className="px-6 py-4 font-mono text-slate-500">{inv.invoice_number}</td><td className="px-6 py-4 text-slate-600"><div className="flex items-center gap-2"><Calendar size={14} className="text-slate-400"/>{formatDate(inv.due_date)}</div></td><td className="px-6 py-4 text-right font-black text-slate-800">{formatCurrency(inv.outstanding_balance)}</td><td className="px-6 py-4 text-center"><Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setSelectedInvoice(inv)}><CheckCircle2 size={16} className="mr-1"/> Autorizar</Button></td></tr>)))}</tbody></table>
                            </div>
                        </div>
                     )}
                 </div>
            )}
        </div>
      ) : (
        // --- VISTA: OTROS ROLES (ACCESOS DIRECTOS) ---
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Shield size={18} className="text-slate-400"/> Accesos Directos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {config.shortcuts.map((item, index) => (
              <button key={index} onClick={() => navigate(item.path)} className="group bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-left">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${item.color} group-hover:scale-110 transition-transform`}><item.icon size={24} /></div>
                <h3 className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{item.label}</h3>
                <p className="text-xs text-slate-400 mt-1">Ir a {item.label.toLowerCase()}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* MODALES */}
      {selectedOrderId && <FinancialReviewModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} onOrderUpdated={() => { setSelectedOrderId(null); fetchOrders(); }}/>}
      {selectedInvoice && <PaymentRequestModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} onSubmit={handleRequestPayment}/>}
      {showPaymentModal && <PaymentApprovalModal onClose={() => setShowPaymentModal(false)} onUpdate={() => {fetchOrders(); financeService.getPayableDashboardStats().then(setApStats);}}/>}
    </div>
  );
};

export default Home;