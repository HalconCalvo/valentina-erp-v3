import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, PenTool, Package, 
  Users, Truck, PlusCircle, Search, 
  TrendingDown, Shield, Calendar, Clock,
  AlertTriangle, CheckCircle, DollarSign, Wallet,
  FileText, Filter, CheckCircle2, X, Briefcase, TrendingUp, 
  ArrowRight, ClipboardList, Undo2, Eye, Pencil, Trash2, Send, Check, 
  Edit2
} from 'lucide-react';

// SERVICES & HOOKS
import { useSales } from './modules/sales/hooks/useSales';
import { financeService } from './api/finance-service';
import { treasuryService } from './api/treasury-service';

// TYPES
import { AccountsPayableStats, PendingInvoice, SupplierPayment, PaymentRequestPayload } from './types/finance';
import { SalesOrderStatus } from './types/sales';
import { BankAccount } from './types/treasury';

// UI COMPONENTS & MODALS
import Card from './components/ui/Card';
import Button from './components/ui/Button';
import Badge from './components/ui/Badge';
import { FinancialReviewModal } from './modules/management/components/FinancialReviewModal';
import { PaymentRequestModal } from './modules/management/components/PaymentRequestModal';
import { PaymentExecutionModal } from './modules/management/components/PaymentExecutionModal';
import { PaymentApprovalModal } from './modules/management/components/PaymentApprovalModal';

type SalesViewMode = 'NONE' | 'PENDING_AUTH' | 'MONTHLY_SALES';
type PayableViewMode = 'TO_REQUEST' | 'REQUESTED';
type PayableFilter = 'THIS_FRIDAY' | 'NEXT_15_DAYS' | 'FUTURE' | null;

const Home: React.FC = () => {
  const navigate = useNavigate();
  
  // --- 1. ESTADOS DE USUARIO ---
  const [userRole, setUserRole] = useState('DIRECTOR'); 
  const [userId, setUserId] = useState<number | null>(null);
  const [userName, setUserName] = useState('Usuario');
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- ESTADOS DE DATOS GENERALES ---
  const { orders, fetchOrders } = useSales(); 
  const [apStats, setApStats] = useState<AccountsPayableStats | null>(null);
  
  // --- CONTROL DE VISTAS (DIRECTOR) ---
  const [activeView, setActiveView] = useState<'NONE' | 'SALES_AUDIT' | 'PAYABLES_AUDIT'>('NONE');
  const [salesTab, setSalesTab] = useState<'dashboard' | 'history'>('dashboard');
  
  // --- ESTADOS ESPECÍFICOS: CUENTAS POR PAGAR ---
  const [isPayableLoading, setIsPayableLoading] = useState(false);
  const [payableViewMode, setPayableViewMode] = useState<PayableViewMode>('TO_REQUEST'); 
  const [payableFilter, setPayableFilter] = useState<PayableFilter>(null);
  
  const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
  const [editingRequest, setEditingRequest] = useState<SupplierPayment | null>(null);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [sentRequests, setSentRequests] = useState<SupplierPayment[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<SupplierPayment[]>([]);
  const [approvedPaymentsCount, setApprovedPaymentsCount] = useState(0);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);

  // --- ESTADOS ESPECÍFICOS DE VENTAS (VENDEDOR) ---
  const [salesViewMode, setSalesViewMode] = useState<SalesViewMode>('NONE');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

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
        DRAFT: "Borrador", SENT: "Por Autorizar", ACCEPTED: "Autorizada",
        CHANGE_REQUESTED: "Cambios Solicitados", SOLD: "Vendida", PAID: "Pagada",
        REJECTED: "Rechazada Int.", CLIENT_REJECTED: "Rechazada Cte."
    };
    return (
      <span className={`px-2 py-0.5 inline-flex text-[10px] uppercase tracking-wide font-bold rounded-full border ${colors[status] ? colors[status].replace('text-', 'border-').replace('800', '200') : 'border-gray-200'} ${colors[status] || "bg-gray-100 text-gray-800"}`}>
        {labels[status] || status}
      </span>
    );
  };

  // --- EFECTOS INICIALES ---
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

  useEffect(() => {
    const refreshData = () => {
        if (fetchOrders) fetchOrders();
        if (userRole === 'ADMIN' || userRole === 'DIRECTOR') {
            financeService.getPayableDashboardStats().then(setApStats).catch(console.error);
        }
    };
    refreshData();
    const intervalId = setInterval(refreshData, 30000);
    return () => clearInterval(intervalId);
  }, [userRole, fetchOrders]); 

  // --- LÓGICAS DE DIRECTOR (TOGGLES Y CARGA DE DATOS) ---
  const toggleSalesView = (targetTab: 'dashboard' | 'history') => {
    if (activeView === 'SALES_AUDIT' && salesTab === targetTab) {
        setActiveView('NONE');
    } else {
        setActiveView('SALES_AUDIT');
        setSalesTab(targetTab);
    }
  };

  const togglePayableView = () => {
    if (activeView === 'PAYABLES_AUDIT') {
        setActiveView('NONE');
    } else {
        setActiveView('PAYABLES_AUDIT');
        refreshPayableData(true);
        treasuryService.getAccounts().then(setAccounts).catch(console.error);
    }
  };

  const refreshPayableData = async (showSpinner = true) => {
    if (showSpinner) setIsPayableLoading(true);
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
    } catch (error) {
        console.error("Error al refrescar datos de pagos", error);
    } finally {
        if (showSpinner) setIsPayableLoading(false);
    }
  };

  // --- LÓGICA DE DIRECTOR: FILTRADOS ---
  const directorFilteredOrders = useMemo(() => {
      if (!orders) return [];
      const base = orders.filter(o => o.status !== SalesOrderStatus.DRAFT);
      switch (salesTab) {
          case 'dashboard': return base.filter(o => o.status === SalesOrderStatus.SENT);
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

 // --- LÓGICA DE FILTRADO ANTI-ZONAS HORARIAS ---
  const getFilteredInvoices = () => {
    if (!payableFilter) return [];
    
    // Hoy al MEDIODÍA
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
            12, 0, 0, 0 // <-- El secreto: 12 del mediodía
        );

        // 3. Resta en milisegundos y conversión a días (con Math.round por si acaso)
        const restaMilisegundos = parsedDate.getTime() - today.getTime();
        const restaDias = Math.round(restaMilisegundos / (1000 * 60 * 60 * 24));

        // Filtros idénticos a los del backend
        if (payableFilter === 'THIS_FRIDAY') return restaDias <= 7;
        if (payableFilter === 'NEXT_15_DAYS') return restaDias >= 8 && restaDias <= 29;
        if (payableFilter === 'FUTURE') return restaDias >= 30;
        
        return false;
    });
  };
  
  const filteredPayablesData = getFilteredInvoices();

  // --- ACCIONES MODALES PAGOS ---
  const handleEditRequest = (req: SupplierPayment) => {
    const relatedInvoice = invoices.find(inv => inv.invoice_number === req.invoice_folio && inv.provider_name === req.provider_name);
    setSelectedInvoice(relatedInvoice || null);
    setEditingRequest(req);
  };
  const handleModalSubmit = async (payload: PaymentRequestPayload) => {
    try {
        if (editingRequest) {
            await financeService.updatePaymentRequest(editingRequest.id, payload);
            alert("✅ Solicitud actualizada.");
        } else {
            await financeService.requestPayment(payload);
            alert("✅ Solicitud enviada.");
        }
        closeModal();
        refreshPayableData(true);
    } catch (e) { alert("❌ Error al procesar."); }
  };
  const handleCancelRequest = async (id: number) => {
    if(!confirm("¿Cancelar esta solicitud?")) return;
    try {
        await financeService.cancelPaymentRequest(id);
        refreshPayableData(true);
    } catch (e) { alert("Error al cancelar."); }
  };
  const closeModal = () => { setSelectedInvoice(null); setEditingRequest(null); };

  // --- LÓGICA DE VENDEDOR ---
  const salesKpis = useMemo(() => {
      if (!orders) return { pendingAuth: [], monthlySales: [], monthlyAmount: 0, monthlyCommissions: 0 };
      let myOrders = userRole === 'SALES' && userId ? orders.filter(o => Number(o.user_id) === userId) : orders;
      const now = new Date();
      
      const pendingAuth = myOrders.filter(o => o.status === SalesOrderStatus.SENT);
      const monthlySales = myOrders.filter(o => {
          if (o.status !== SalesOrderStatus.SOLD && o.status !== SalesOrderStatus.PAID) return false;
          const d = o.created_at ? new Date(o.created_at) : new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      const monthlyAmount = monthlySales.reduce((sum, o) => sum + (o.total_price || 0), 0);
      const monthlyCommissions = monthlySales.reduce((sum, o) => sum + (Number(o.commission_amount) || 0), 0);
      return { pendingAuth, monthlySales, monthlyAmount, monthlyCommissions };
  }, [orders, userRole, userId]);

  // --- FORMATO ---
  const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
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
      case 'DESIGN': return { title: 'Ingeniería', subtitle: 'Desarrollo de productos.', color: 'from-pink-500 to-rose-600', shortcuts: [{ label: 'Nuevo Producto', icon: PlusCircle, path: '/design', color: 'bg-pink-100 text-pink-700', state: { openNewModal: true } }, { label: 'Catálogo', icon: PenTool, path: '/design', color: 'bg-purple-100 text-purple-700' }, { label: 'Materiales', icon: Package, path: '/materials', color: 'bg-amber-100 text-amber-700' }, { label: 'Producción', icon: LayoutDashboard, path: '/production', color: 'bg-slate-100 text-slate-700' }] };
      case 'WAREHOUSE': return { title: 'Logística', subtitle: 'Control de inventarios y almacén.', color: 'from-orange-500 to-amber-600', shortcuts: [{ label: 'Entradas Almacén', icon: ClipboardList, path: '/inventory/history', color: 'bg-orange-100 text-orange-700' }, { label: 'Materiales', icon: Package, path: '/materials', color: 'bg-emerald-100 text-emerald-700' }, { label: 'Proveedores', icon: Truck, path: '/providers', color: 'bg-blue-100 text-blue-700' }] };
      case 'PRODUCTION': return { title: 'Fábrica', subtitle: 'Gestión de production.', color: 'from-blue-600 to-indigo-700', shortcuts: [{ label: 'Órdenes', icon: ClipboardList, path: '/production', color: 'bg-blue-100 text-blue-700' }, { label: 'Materiales', icon: Package, path: '/materials', color: 'bg-slate-100 text-slate-700' }] };
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
    <div className="min-h-full p-8 space-y-8 animate-in fade-in duration-500 pb-24 max-w-7xl mx-auto">
      
      {/* HERO SECTION */}
      <div className={`rounded-2xl shadow-xl p-8 text-white bg-gradient-to-r ${config.color} relative overflow-hidden transition-colors duration-500`}>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-sm font-medium mb-1"><Calendar size={14}/> {currentTime.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <h1 className="text-4xl font-black tracking-tight mb-2">{getGreeting()}, <span className="opacity-90">{userName}</span></h1>
            <p className="text-white/80 max-w-lg text-lg">{config.subtitle}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-lg border border-white/10">
            <div className="flex items-center gap-2"><Clock size={18}/><span className="font-mono text-xl font-bold">{currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div>
          </div>
        </div>
      </div>

      {isSales ? (
        // --- VISTA: VENDEDOR ---
         <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card onClick={() => navigate('/sales/new')} className="p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 bg-white shadow-sm h-full">
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Acción Rápida</p><PlusCircle size={14} className="text-emerald-500" /></div>
                    <div className="mt-4"><h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">Nueva Cotización</h3><p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1"><Briefcase size={10}/> Iniciar proceso</p></div>
                </Card>
                <Card onClick={() => setSalesViewMode(salesViewMode === 'PENDING_AUTH' ? 'NONE' : 'PENDING_AUTH')} className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 h-full shadow-sm ${salesViewMode === 'PENDING_AUTH' ? 'bg-amber-50 ring-2 ring-amber-200' : 'bg-white'}`}>
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Autorizar</p><Clock size={14} className="text-amber-500" /></div>
                    <div className="flex flex-row items-baseline mt-1">{salesKpis.pendingAuth.length > 0 && <div className="text-2xl font-black text-amber-600/60">{salesKpis.pendingAuth.length}</div>}<div className="ml-auto text-2xl font-black text-amber-600">{salesKpis.pendingAuth.length}</div></div>
                </Card>
                <Card onClick={() => setSalesViewMode(salesViewMode === 'MONTHLY_SALES' ? 'NONE' : 'MONTHLY_SALES')} className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full shadow-sm ${salesViewMode === 'MONTHLY_SALES' ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'bg-white'}`}>
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas Mes</p><TrendingUp size={14} className="text-indigo-500" /></div>
                    <div className="flex flex-row items-baseline mt-1"><div className="ml-auto text-2xl font-black text-indigo-600">{formatCurrency(salesKpis.monthlyAmount)}</div></div>
                </Card>
                <Card className="p-4 bg-white border-l-4 border-l-emerald-400 h-full shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1">
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Comisiones</p><Wallet size={14} className="text-emerald-400" /></div>
                    <div className="flex flex-row items-baseline mt-1"><div className="ml-auto text-2xl font-black text-emerald-600">{formatCurrency(salesKpis.monthlyCommissions)}</div></div>
                </Card>
            </div>
            {salesViewMode === 'PENDING_AUTH' && (
                 <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                     <button onClick={() => setSalesViewMode('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-amber-500 z-10"><X size={20}/></button>
                     <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center"><h3 className="font-bold text-amber-800 flex items-center gap-2 text-lg"><Clock size={18}/> Cotizaciones Esperando Firma</h3></div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left"><thead className="text-xs text-amber-800 uppercase bg-amber-50/50 border-b border-amber-100"><tr><th className="px-6 py-4">Proyecto</th><th className="px-6 py-4">Monto</th><th className="px-6 py-4">Fecha Envío</th><th className="px-6 py-4 text-center">Estatus</th></tr></thead><tbody className="divide-y divide-slate-50">
                                    {salesKpis.pendingAuth.map(o => <tr key={o.id} className="hover:bg-slate-50"><td className="px-6 py-4 font-bold text-slate-700">{o.project_name}</td><td className="px-6 py-4 text-slate-700">{formatCurrency(o.total_price)}</td><td className="px-6 py-4 text-slate-500">{formatDate(o.created_at)}</td><td className="px-6 py-4 text-center">{renderStatusBadge(o.status as SalesOrderStatus)}</td></tr>)}
                            </tbody></table>
                        </div>
                     </div>
                 </div>
            )}
            {salesViewMode === 'MONTHLY_SALES' && (
                <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setSalesViewMode('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-indigo-500 z-10"><X size={20}/></button>
                    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center"><h3 className="font-bold text-indigo-800 flex items-center gap-2 text-lg"><TrendingUp size={18}/> Ventas del Mes</h3></div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left"><thead className="text-xs text-indigo-800 uppercase bg-indigo-50/50 border-b border-indigo-100"><tr><th className="px-6 py-4">Proyecto</th><th className="px-6 py-4 text-right">Monto Venta</th></tr></thead><tbody className="divide-y divide-slate-50">
                                {salesKpis.monthlySales.map((sale) => <tr key={sale.id} className="hover:bg-slate-50"><td className="px-6 py-4"><div className="font-bold text-slate-700">{sale.project_name}</div><span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs">#{sale.id}</span></td><td className="px-6 py-4 text-right font-black text-slate-800">{formatCurrency(sale.total_price)}</td></tr>)}
                            </tbody></table>
                        </div>
                    </div>
                </div>
            )}
         </div>

      ) : isDirectorOrAdmin ? (
        // --- VISTA: DIRECTOR/ADMIN ---
        <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* 1. POR AUTORIZAR (AMARILLO) */}
                <div onClick={() => toggleSalesView('dashboard')} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95 h-full">
                    <Card className={`p-4 h-full border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-all
                    ${activeView === 'SALES_AUDIT' && salesTab === 'dashboard' ? 'ring-2 ring-amber-400 bg-amber-50/50' : 'bg-white'}`}>
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Autorizar</p>
                            <AlertTriangle size={14} className="text-amber-500" />
                        </div>
                        <div className="flex flex-row items-baseline mt-1 justify-between w-full">
                            {directorPendingAuthCount > 0 ? <div className="text-2xl font-black text-amber-600/40">{directorPendingAuthCount}</div> : <div></div>}
                            <div className="text-xl font-black text-amber-600 text-right">{formatCurrency(directorPendingAuthAmount)}</div>
                        </div>
                        {directorPendingAuthCount > 0 ? <p className="text-[10px] text-amber-600 font-bold mt-1 flex items-center gap-1 animate-pulse"><Clock size={10}/> Requiere atención</p> : <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><CheckCircle2 size={10}/> Al día</p>}
                    </Card>
                </div>

                {/* 2. VENTAS MES (VERDE) */}
                <div onClick={() => toggleSalesView('history')} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95 h-full">
                    <Card className={`p-4 h-full border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all
                    ${activeView === 'SALES_AUDIT' && salesTab === 'history' ? 'ring-2 ring-emerald-400 bg-emerald-50/50' : 'bg-white'}`}>
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas Mes</p>
                            <DollarSign size={14} className="text-emerald-500" />
                        </div>
                        <div className="flex flex-row items-baseline mt-1 justify-end w-full">
                            <div className="text-xl font-black text-emerald-600 text-right">{formatCurrency(directorMonthlySalesAmount)}</div>
                        </div>
                        <p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1"><CheckCircle2 size={10}/> Ingresos confirmados</p>
                    </Card>
                </div>

                {/* 3. CUENTAS POR COBRAR (AZUL) */}
                <div className="h-full">
                    <Card className="p-4 h-full border-l-4 border-l-blue-500 bg-white shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas x Cobrar</p>
                            <Users size={14} className="text-blue-500" />
                        </div>
                        <div className="flex flex-row items-baseline mt-1 justify-end w-full">
                            <div className="text-xl font-black text-blue-600 text-right">{formatCurrency(directorReceivablesAmount)}</div>
                        </div>
                        <p className="text-[10px] text-blue-600 font-bold mt-1 flex items-center gap-1"><TrendingUp size={10}/> Capital en tránsito</p>
                    </Card>
                </div>

                {/* 4. CUENTAS POR PAGAR (ROJO) -> DESPLIEGA EL PANEL DE GERENCIA */}
                <div onClick={togglePayableView} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95 h-full">
                    <Card className={`p-4 h-full border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-all
                    ${activeView === 'PAYABLES_AUDIT' ? 'ring-2 ring-red-400 bg-red-50/50' : 'bg-white'}`}>
                        <div className="flex justify-between items-start">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas x Pagar</p>
                            <TrendingDown size={14} className="text-red-500" />
                        </div>
                        <div className="flex flex-row items-baseline mt-1 justify-between w-full">
                            {totalDocuments > 0 ? <div className="text-2xl font-black text-red-600/40">{totalDocuments}</div> : <div></div>}
                            <div className="text-xl font-black text-red-600 text-right">{formatCurrency(totalDebt)}</div>
                        </div>
                        {pendingApprovals > 0 ? <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 animate-pulse"><Clock size={10}/> {pendingApprovals} solicitudes de pago</p> : <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><CheckCircle2 size={10}/> Al día</p>}
                    </Card>
                </div>
            </div>

            {/* ---> TABLA DE AUDITORÍA DE VENTAS (DIRECTOR) <--- */}
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
                                <div className="text-center py-12 bg-slate-50 rounded border border-dashed border-slate-300"><p className="text-slate-400">No hay registros para mostrar en esta sección.</p></div>
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

            {/* ---> PANEL DE GERENCIA INCRUSTADO (CUENTAS POR PAGAR) <--- */}
            {activeView === 'PAYABLES_AUDIT' && (
                <div className="animate-in slide-in-from-top-4 duration-300 relative mt-6 pt-6 border-t border-slate-200">
                    <button onClick={() => setActiveView('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-red-500 z-10"><X size={20}/></button>

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

                        <Button 
                            className={`font-bold shadow-lg transform transition hover:scale-105 ${approvedPaymentsCount > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-none ring-2 ring-emerald-200' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'}`}
                            onClick={() => setShowExecutionModal(true)}
                        >
                            {approvedPaymentsCount > 0 ? <span className="bg-white text-emerald-700 text-[11px] font-black px-2 py-0.5 rounded-md mr-2 shadow-sm animate-pulse">{approvedPaymentsCount}</span> : <CheckCircle2 size={18} className="mr-2"/>}
                            Pagos Listos para Ejecutar
                        </Button>
                    </div>

                    {/* VISTA 1: POR SOLICITAR (TARJETAS SEMÁFORO) */}
                    {payableViewMode === 'TO_REQUEST' && (
                        <>
                            <div className="flex items-center gap-2 text-slate-400 text-sm font-bold tracking-wide mb-4">
                                <TrendingDown size={16}/> <span>Flujo de Efectivo: Seleccione una tarjeta para auditar</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* ROJA */}
                                <Card onClick={() => setPayableFilter('THIS_FRIDAY')} className={`p-6 cursor-pointer border transition-all ${payableFilter === 'THIS_FRIDAY' ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-xl scale-105 border-transparent' : 'bg-white border-slate-200 hover:border-red-400 hover:shadow-md'}`}>
                                    <div className="flex justify-between items-center mb-4"><span className={`text-xs font-bold uppercase tracking-wider ${payableFilter === 'THIS_FRIDAY' ? 'text-red-100' : 'text-red-600'}`}><AlertTriangle className="inline mr-1 mb-1" size={14}/> Pago Inmediato</span></div>
                                    <p className={`text-sm mb-2 ${payableFilter === 'THIS_FRIDAY' ? 'text-red-100' : 'text-slate-400'}`}>Pagos para el viernes</p>
                                    <div className="flex items-end justify-between">
                                        <div className={`text-xl font-bold leading-none ${payableFilter === 'THIS_FRIDAY' ? 'text-red-200' : 'text-slate-300'}`}>{apStats?.overdue_count || 0}</div>
                                        <div className={`text-xl font-black text-right ${payableFilter === 'THIS_FRIDAY' ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(apStats?.overdue_amount || 0)}</div>
                                    </div>
                                </Card>

                                {/* NARANJA */}
                                <Card onClick={() => setPayableFilter('NEXT_15_DAYS')} className={`p-6 cursor-pointer border transition-all ${payableFilter === 'NEXT_15_DAYS' ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl scale-105 border-transparent' : 'bg-white border-slate-200 hover:border-orange-400 hover:shadow-md'}`}>
                                    <div className="flex justify-between items-center mb-4"><span className={`text-xs font-bold uppercase tracking-wider ${payableFilter === 'NEXT_15_DAYS' ? 'text-orange-100' : 'text-orange-600'}`}><Calendar className="inline mr-1 mb-1" size={14}/> Proyección Corta</span></div>
                                    <p className={`text-sm mb-2 ${payableFilter === 'NEXT_15_DAYS' ? 'text-orange-100' : 'text-slate-400'}`}>Pagos de 8 a 15 días</p>
                                    <div className="flex items-end justify-between">
                                        <div className={`text-xl font-bold leading-none ${payableFilter === 'NEXT_15_DAYS' ? 'text-orange-200' : 'text-slate-300'}`}>{apStats?.next_period_count || 0}</div>
                                        <div className={`text-xl font-black text-right ${payableFilter === 'NEXT_15_DAYS' ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(apStats?.next_period_amount || 0)}</div>
                                    </div>
                                </Card>

                                {/* AMARILLO */}
                                <Card onClick={() => setPayableFilter('FUTURE')} className={`p-6 cursor-pointer border transition-all ${payableFilter === 'FUTURE' ? 'bg-gradient-to-br from-yellow-500 to-yellow-600 text-white shadow-xl scale-105 border-transparent' : 'bg-white border-slate-200 hover:border-yellow-400 hover:shadow-md'}`}>
                                    <div className="flex justify-between items-center mb-4"><span className={`text-xs font-bold uppercase tracking-wider ${payableFilter === 'FUTURE' ? 'text-yellow-100' : 'text-yellow-600'}`}><ArrowRight className="inline mr-1 mb-1" size={14}/> Largo Plazo</span></div>
                                    <p className={`text-sm mb-2 ${payableFilter === 'FUTURE' ? 'text-yellow-100' : 'text-slate-400'}`}>Pagos en más de 15 días</p>
                                    <div className="flex items-end justify-between">
                                        <div className={`text-xl font-bold leading-none ${payableFilter === 'FUTURE' ? 'text-yellow-200' : 'text-slate-300'}`}>{apStats?.future_count || 0}</div>
                                        <div className={`text-xl font-black text-right ${payableFilter === 'FUTURE' ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(apStats?.future_amount || 0)}</div>
                                    </div>
                                </Card>
                            </div>

                            {/* TABLA DE AUDITORÍA PAGOS */}
                            {payableFilter && (
                                <div className="animate-in slide-in-from-bottom-4 duration-500 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden mt-8">
                                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center gap-4">
                                        <h3 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                                            <Filter size={18} className="text-slate-400"/> Auditoría: 
                                            <span className={`uppercase ml-1 font-black px-2 py-0.5 rounded text-sm ${payableFilter === 'THIS_FRIDAY' ? 'bg-red-100 text-red-700' : payableFilter === 'NEXT_15_DAYS' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {payableFilter === 'THIS_FRIDAY' ? 'Pagos para el viernes' : payableFilter === 'NEXT_15_DAYS' ? 'Pagos en 15 días' : 'Pagos mayores a 15 días'}
                                            </span>
                                        </h3>
                                        <Badge variant="secondary">{filteredPayablesData.length} Documentos</Badge>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left"><thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100"><tr><th className="px-6 py-4">Proveedor</th><th className="px-6 py-4">Factura</th><th className="px-6 py-4">Vencimiento</th><th className="px-6 py-4 text-right">Saldo Deuda</th><th className="px-6 py-4 text-center">Acción</th></tr></thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {isPayableLoading ? <tr><td colSpan={5} className="text-center py-12 text-slate-400">Cargando datos...</td></tr> : filteredPayablesData.length === 0 ? <tr><td colSpan={5} className="text-center py-12 text-slate-400 italic">No hay documentos pendientes.</td></tr> : (
                                                    filteredPayablesData.map((inv) => {
                                                        const allActiveRequests = [...sentRequests, ...approvedRequests];
                                                        const activeRequestsForThisInvoice = allActiveRequests.filter(req => req.invoice_folio === inv.invoice_number && req.provider_name === inv.provider_name);
                                                        const hasActiveRequest = activeRequestsForThisInvoice.length > 0;
                                                        const moneyAlreadyRequested = activeRequestsForThisInvoice.reduce((sum, req) => sum + req.amount, 0);
                                                        const isAlreadyApproved = activeRequestsForThisInvoice.some(req => approvedRequests.find(ar => ar.id === req.id));
                                                        
                                                        let accountName = "Sin cuenta sugerida";
                                                        if (hasActiveRequest && (activeRequestsForThisInvoice[0] as any).suggested_account_id) {
                                                            const acc = accounts.find(a => a.id === (activeRequestsForThisInvoice[0] as any).suggested_account_id);
                                                            if (acc) accountName = acc.name;
                                                        }

                                                        return (
                                                            <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                                                <td className="px-6 py-4 font-bold text-slate-700">{inv.provider_name}</td>
                                                                <td className="px-6 py-4"><span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 text-xs">{inv.invoice_number}</span></td>
                                                                <td className="px-6 py-4 text-slate-600"><div className="flex items-center gap-2"><Calendar size={14} className="text-slate-400"/>{formatDate(inv.due_date)}</div></td>
                                                                <td className="px-6 py-4 text-right"><div className="font-black text-slate-800">{formatCurrency(inv.outstanding_balance)}</div></td>
                                                                <td className="px-6 py-4 text-center align-middle">
                                                                    {hasActiveRequest ? (
                                                                        <div className={`inline-flex flex-col items-center justify-center py-1.5 px-3 rounded-md border cursor-not-allowed w-full min-w-[140px] shadow-sm ${isAlreadyApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                                            <span className="text-[11px] font-bold mb-0.5">{isAlreadyApproved ? "Autorizado (Pend. Pago)" : "En Proceso"}: {formatCurrency(moneyAlreadyRequested)}</span>
                                                                            <span className="text-[9px] font-bold bg-white/60 px-2 py-0.5 rounded-full truncate max-w-[140px]" title={accountName}>{accountName}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm w-full min-w-[140px]" onClick={() => setSelectedInvoice(inv)}>
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

                    {/* VISTA 2: SOLICITUDES ENVIADAS */}
                    {payableViewMode === 'REQUESTED' && (
                        <div className="animate-in slide-in-from-right-4 duration-300">
                            <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                                <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                                    <h3 className="font-bold text-indigo-800 flex items-center gap-2 text-lg"><Clock className="text-indigo-600"/> Solicitudes en Espera de Dirección</h3>
                                    {isDirectorOrAdmin && sentRequests.length > 0 && (
                                        <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-md shadow-emerald-200" onClick={() => setShowApprovalModal(true)}>
                                            <Check size={18} className="mr-2"/> Revisar y Autorizar
                                        </Button>
                                    )}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left"><thead className="text-xs text-indigo-800 uppercase bg-indigo-50/50 border-b border-indigo-100"><tr><th className="px-6 py-4">Proveedor</th><th className="px-6 py-4">Detalle Factura</th><th className="px-6 py-4">Monto Solicitado</th><th className="px-6 py-4">Fecha Solicitud</th><th className="px-6 py-4 text-center">Acciones</th></tr></thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {isPayableLoading ? <tr><td colSpan={5} className="text-center py-12 text-slate-400">Cargando solicitudes...</td></tr> : sentRequests.length === 0 ? <tr><td colSpan={5} className="text-center py-12 text-slate-400 italic">No hay solicitudes pendientes de aprobación.</td></tr> : (
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
        </div>
      ) : (
        // --- VISTA: OTROS ROLES ---
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {config.shortcuts.map((item, index) => {
              const borderClass = item.color?.includes('pink') ? 'border-l-pink-500' : 
                                  item.color?.includes('purple') ? 'border-l-purple-500' :
                                  item.color?.includes('amber') ? 'border-l-amber-500' :
                                  item.color?.includes('orange') ? 'border-l-orange-500' :
                                  item.color?.includes('emerald') ? 'border-l-emerald-500' :
                                  item.color?.includes('blue') ? 'border-l-blue-500' : 'border-l-indigo-500';
              const iconColor = borderClass.replace('border-l-', 'text-');

              return (
                <div key={index} onClick={() => navigate(item.path, { state: (item as any).state })} className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95">
                    <Card className={`p-4 h-full border-l-4 ${borderClass} bg-white shadow-sm hover:shadow-lg transition-all`}>
                        <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Módulo</p><item.icon size={14} className={iconColor} /></div>
                        <div className="mt-1 flex justify-between items-end"><div><h3 className="text-xl font-bold text-slate-700">{item.label}</h3><p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><ArrowRight size={10}/> Ingresar</p></div></div>
                    </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* MODALES GLOBALES DIRECTOR */}
      {selectedOrderId && <FinancialReviewModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} onOrderUpdated={() => { setSelectedOrderId(null); fetchOrders(); }}/>}
      
      {/* MODALES DE PAGOS (HEREDADOS DE GERENCIA) */}
      {(selectedInvoice || editingRequest) && <PaymentRequestModal invoice={selectedInvoice || undefined} existingRequest={editingRequest || undefined} onClose={closeModal} onSubmit={handleModalSubmit}/>}
      {showExecutionModal && <PaymentExecutionModal onClose={() => setShowExecutionModal(false)} onSuccess={() => { setShowExecutionModal(false); refreshPayableData(true); }}/>}
      {showApprovalModal && isDirectorOrAdmin && <PaymentApprovalModal onClose={() => setShowApprovalModal(false)} onUpdate={() => refreshPayableData(true)}/>}

    </div>
  );
};

export default Home;