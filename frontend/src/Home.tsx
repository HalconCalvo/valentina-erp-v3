import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, PenTool, Package, 
  Users, Truck, PlusCircle, Search, 
  TrendingUp, ClipboardList, Shield, Calendar, Clock,
  AlertTriangle, CheckCircle, DollarSign, Wallet, TrendingDown,
  FileText, ListFilter, History, X, RefreshCw, Briefcase, Hammer
} from 'lucide-react';

import { useSales } from './modules/sales/hooks/useSales';
import { inventoryService, AccountsPayableStats } from './api/inventory-service';
import { SalesOrderStatus } from './types/sales';
import Card from './components/ui/Card';
import Button from './components/ui/Button';
import { FinancialReviewModal } from './modules/management/components/FinancialReviewModal';

const Home: React.FC = () => {
  const navigate = useNavigate();
  
  // --- 1. ESTADOS DE USUARIO ---
  const [userRole, setUserRole] = useState('DIRECTOR'); 
  const [userName, setUserName] = useState('Usuario');
  const [currentTime, setCurrentTime] = useState(new Date());

  // ESTADOS DE DATOS
  const { orders, fetchOrders } = useSales(); 
  const [apStats, setApStats] = useState<AccountsPayableStats | null>(null);
  
  // CONTROL DE VISTAS
  const [activeView, setActiveView] = useState<'NONE' | 'SALES_AUDIT' | 'RECEIVABLES' | 'PAYABLES'>('NONE');
  const [salesTab, setSalesTab] = useState<'dashboard' | 'pipeline' | 'history'>('dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  useEffect(() => {
    const storedRole = (localStorage.getItem('user_role') || 'DIRECTOR').toUpperCase();
    const storedName = localStorage.getItem('full_name') || localStorage.getItem('user_name') || 'Usuario';

    setUserRole(storedRole);
    setUserName(storedName);

    const timer = setInterval(() => setCurrentTime(new Date()), 1000 * 60); 

    // Solo cargamos datos financieros si es Jefe (ADMIN o DIRECTOR)
    if (storedRole === 'ADMIN' || storedRole === 'DIRECTOR') {
        fetchOrders();
        inventoryService.getAccountsPayableSummary()
            .then(setApStats)
            .catch(err => console.error("Error al cargar finanzas:", err));
    }

    return () => clearInterval(timer);
  }, [fetchOrders]);

  // --- CÁLCULOS KPI ---
  const safeOrders = Array.isArray(orders) ? orders : [];
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const pendingOrders = safeOrders.filter(o => o.status === SalesOrderStatus.SENT);
  const pendingAmount = pendingOrders.reduce((acc, curr) => acc + (curr.total_price || 0), 0);
  const hasPending = pendingOrders.length > 0;

  const approvedOrdersThisMonth = safeOrders.filter(o => {
      const isSold = o.status === SalesOrderStatus.ACCEPTED || o.status === SalesOrderStatus.SOLD;
      const d = o.created_at ? new Date(o.created_at) : new Date();
      return isSold && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const approvedAmountMonth = approvedOrdersThisMonth.reduce((acc, curr) => acc + (curr.total_price || 0), 0);

  const receivableOrders = safeOrders.filter(o => o.status === SalesOrderStatus.ACCEPTED);
  const receivableAmount = receivableOrders.reduce((acc, curr) => acc + (curr.total_price || 0), 0);

  // --- FILTRADO DE TABLA ---
  const filteredOrders = useMemo(() => {
      const base = safeOrders.filter(o => o.status !== SalesOrderStatus.DRAFT);
      switch (salesTab) {
          case 'dashboard':
              return base.filter(o => {
                  const isUrgent = o.status === SalesOrderStatus.SENT || o.status === SalesOrderStatus.CHANGE_REQUESTED;
                  const isWaiting = o.status === SalesOrderStatus.ACCEPTED;
                  const d = o.created_at ? new Date(o.created_at) : new Date();
                  const isThisMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                  const isResult = (o.status === SalesOrderStatus.SOLD || o.status === SalesOrderStatus.REJECTED || o.status === SalesOrderStatus.CLIENT_REJECTED) && isThisMonth;
                  return isUrgent || isWaiting || isResult;
              });
          case 'pipeline':
               return base.filter(o => o.status === SalesOrderStatus.ACCEPTED || o.status === SalesOrderStatus.CHANGE_REQUESTED);
          case 'history':
               return base.filter(o => o.status === SalesOrderStatus.SOLD || o.status === SalesOrderStatus.REJECTED || o.status === SalesOrderStatus.CLIENT_REJECTED);
          default: return base;
      }
  }, [safeOrders, salesTab, currentMonth, currentYear]);

  // --- CONFIGURACIÓN HERO Y COLORES ---
  const getRoleConfig = () => {
    switch (userRole) {
      // 1. VENTAS (VERDE)
      case 'SALES': 
        return { 
            title: 'Panel Comercial', 
            subtitle: 'Gestiona cotizaciones.', 
            color: 'from-emerald-500 to-teal-600', 
            shortcuts: [
                { label: 'Nueva Cotización', icon: PlusCircle, path: '/sales/new', color: 'bg-emerald-100 text-emerald-700' }, 
                { label: 'Ver Ventas', icon: ShoppingCart, path: '/sales', color: 'bg-blue-100 text-blue-700' }, 
                { label: 'Clientes', icon: Users, path: '/clients', color: 'bg-indigo-100 text-indigo-700' }, 
                { label: 'Stock', icon: Search, path: '/materials', color: 'bg-slate-100 text-slate-700' }
            ] 
        };
      
      // 2. DISEÑO (ROSA) - CORREGIDO
      case 'DESIGN': 
        return { 
            title: 'Ingeniería', 
            subtitle: 'Desarrollo de productos.', 
            color: 'from-pink-500 to-rose-600', // <--- AHORA ES ROSA
            shortcuts: [
                { label: 'Nuevo Producto', icon: PlusCircle, path: '/design', color: 'bg-pink-100 text-pink-700' }, 
                { label: 'Catálogo', icon: PenTool, path: '/design', color: 'bg-purple-100 text-purple-700' }, 
                { label: 'Materiales', icon: Package, path: '/materials', color: 'bg-amber-100 text-amber-700' }, 
                { label: 'Producción', icon: LayoutDashboard, path: '/production', color: 'bg-slate-100 text-slate-700' }
            ] 
        };

      // 3. ALMACÉN (NARANJA)
      case 'WAREHOUSE': 
        return { 
            title: 'Logística', 
            subtitle: 'Control de inventarios.', 
            color: 'from-orange-500 to-amber-600', 
            shortcuts: [
                { label: 'Recepción', icon: ClipboardList, path: '/inventory/reception', color: 'bg-orange-100 text-orange-700' }, 
                { label: 'Inventario', icon: Package, path: '/materials', color: 'bg-emerald-100 text-emerald-700' }, 
                { label: 'Proveedores', icon: Truck, path: '/providers', color: 'bg-blue-100 text-blue-700' }, 
                { label: 'Movimientos', icon: Search, path: '/inventory/movements', color: 'bg-slate-100 text-slate-700' }
            ] 
        };

      // 4. PRODUCCIÓN (AZUL)
      case 'PRODUCTION': 
        return { 
            title: 'Fábrica', 
            subtitle: 'Gestión de producción.', 
            color: 'from-blue-600 to-indigo-700', 
            shortcuts: [
                { label: 'Órdenes', icon: ClipboardList, path: '/production', color: 'bg-blue-100 text-blue-700' }, 
                { label: 'Materiales', icon: Package, path: '/materials', color: 'bg-slate-100 text-slate-700' }
            ] 
        };

      // 5. ADMINISTRACIÓN (ÍNDIGO) - NUEVO CASO AGREGADO
      case 'ADMIN': 
        return { 
            title: 'Administración', 
            subtitle: 'Finanzas y Control.', 
            color: 'from-indigo-600 to-violet-800', // <--- ÍNDIGO
            shortcuts: [] // Los admins ven el dashboard directivo, no shortcuts
        };

      // 6. DIRECCIÓN (NEGRO) - DEFAULT
      default: 
        return { 
            title: 'Dirección General', 
            subtitle: 'Cuadro de Mando Integral.', 
            color: 'from-slate-800 to-black', // <--- NEGRO
            shortcuts: [] 
        };
    }
  };
  const config = getRoleConfig();

  const getGreeting = () => {
    const h = currentTime.getHours();
    return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  };

  const renderStatusBadge = (status: SalesOrderStatus) => {
      switch (status) {
          case SalesOrderStatus.SENT: return <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded border border-amber-200 text-xs font-bold flex items-center gap-1 w-fit"><AlertTriangle size={10}/> POR AUTORIZAR</span>;
          case SalesOrderStatus.CHANGE_REQUESTED: return <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded border border-orange-200 text-xs font-bold flex items-center gap-1 w-fit"><RefreshCw size={10}/> EN AJUSTES</span>;
          case SalesOrderStatus.ACCEPTED: return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded border border-blue-200 text-xs font-bold flex items-center gap-1 w-fit"><Clock size={10}/> EN ESPERA</span>;
          case SalesOrderStatus.SOLD: return <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded border border-emerald-200 text-xs font-bold flex items-center gap-1 w-fit"><DollarSign size={10}/> VENDIDA</span>;
          case SalesOrderStatus.CLIENT_REJECTED: return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded border border-slate-200 text-xs font-bold flex items-center gap-1 w-fit"><TrendingDown size={10}/> PERDIDA</span>;
          case SalesOrderStatus.REJECTED: return <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded border border-slate-200 text-xs font-bold w-fit">CANCELADA</span>;
          default: return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs w-fit">{status}</span>;
      }
  };

  const isDirectorOrAdmin = userRole === 'ADMIN' || userRole === 'DIRECTOR';

  return (
    <div className="min-h-full p-8 space-y-8 animate-in fade-in duration-500 pb-24">
      
      {/* 1. HERO SECTION */}
      <div className={`rounded-2xl shadow-xl p-8 text-white bg-gradient-to-r ${config.color} relative overflow-hidden transition-colors duration-500`}>
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-black/10 rounded-full blur-xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-sm font-medium mb-1">
              <Calendar size={14}/> {currentTime.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-2">
              {getGreeting()}, <span className="opacity-90">{userName}</span>
            </h1>
            <p className="text-white/80 max-w-lg text-lg">{config.subtitle}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-lg border border-white/10">
            <div className="flex items-center gap-2">
               <Clock size={18}/>
               <span className="font-mono text-xl font-bold">
                 {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
               </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CONTENIDO DINÁMICO POR ROL */}
      
      {!isDirectorOrAdmin ? (
        // VISTA OPERATIVA (Ventas, Diseño, Almacén, Producción)
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Shield size={18} className="text-slate-400"/> Accesos Directos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {config.shortcuts.map((item, index) => (
              <button
                key={index}
                onClick={() => navigate(item.path)}
                className="group bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-left"
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${item.color} group-hover:scale-110 transition-transform`}>
                  <item.icon size={24} />
                </div>
                <h3 className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">
                  {item.label}
                </h3>
                <p className="text-xs text-slate-400 mt-1">Ir a {item.label.toLowerCase()}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        // VISTA DIRECTIVA (ADMIN Y DIRECTOR)
        <div className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* 1. POR AUTORIZAR */}
                <div 
                    onClick={() => {
                        if (activeView === 'SALES_AUDIT' && salesTab === 'dashboard') {
                            setActiveView('NONE');
                        } else {
                            setActiveView('SALES_AUDIT');
                            setSalesTab('dashboard');
                        }
                    }}
                    className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
                >
                    <Card className={`p-5 h-full border-l-4 ${hasPending ? 'border-l-amber-500 ring-2 ring-amber-100' : 'border-l-emerald-500'} ${activeView === 'SALES_AUDIT' && salesTab === 'dashboard' ? 'bg-slate-50 ring-2 ring-indigo-500' : 'bg-white shadow-sm'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Autorizar</p>
                                <h3 className="text-2xl font-black text-slate-800 mt-1">${pendingAmount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</h3>
                                <p className={`text-xs ${hasPending ? 'text-amber-600' : 'text-emerald-600'} font-bold mt-2 flex items-center gap-1`}>
                                    <Clock size={12}/> {pendingOrders.length} pendientes
                                </p>
                            </div>
                            <div className={`p-2 rounded ${hasPending ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`}>
                            {hasPending ? <AlertTriangle size={20}/> : <CheckCircle size={20}/>}
                            </div>
                        </div>
                    </Card>
                </div>

                {/* 2. VENTAS MES */}
                <div 
                    onClick={() => {
                        if (activeView === 'SALES_AUDIT' && salesTab === 'history') {
                            setActiveView('NONE');
                        } else {
                            setActiveView('SALES_AUDIT');
                            setSalesTab('history');
                        }
                    }}
                    className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
                >
                    <Card className={`p-5 h-full border-l-4 border-l-emerald-500 ${activeView === 'SALES_AUDIT' && salesTab === 'history' ? 'bg-slate-50 ring-2 ring-indigo-500' : 'bg-white shadow-sm'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ventas {new Date().toLocaleString('es-MX', { month: 'long' })}</p>
                                <h3 className="text-2xl font-black text-slate-800 mt-1">${approvedAmountMonth.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</h3>
                                <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1">
                                    <TrendingUp size={12}/> {approvedOrdersThisMonth.length} cierres
                                </p>
                            </div>
                            <div className="p-2 bg-emerald-50 rounded text-emerald-500"><DollarSign size={20}/></div>
                        </div>
                    </Card>
                </div>

                {/* 3. CUENTAS POR COBRAR */}
                <div 
                    onClick={() => setActiveView(activeView === 'RECEIVABLES' ? 'NONE' : 'RECEIVABLES')}
                    className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
                >
                    <Card className={`p-5 h-full border-l-4 border-l-emerald-500 ${activeView === 'RECEIVABLES' ? 'bg-slate-50 ring-2 ring-indigo-500' : 'bg-white shadow-sm'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas por Cobrar</p>
                                <h3 className="text-2xl font-black text-slate-800 mt-1">${receivableAmount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</h3>
                                <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1">
                                    <Wallet size={12}/> {receivableOrders.length} proyectos
                                </p>
                            </div>
                            <div className="p-2 bg-emerald-50 rounded text-emerald-500"><TrendingUp size={20}/></div>
                        </div>
                    </Card>
                </div>

                {/* 4. CUENTAS POR PAGAR */}
                <div 
                    onClick={() => setActiveView(activeView === 'PAYABLES' ? 'NONE' : 'PAYABLES')}
                    className="cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
                >
                    <Card className={`p-5 h-full border-l-4 border-l-red-500 ${activeView === 'PAYABLES' ? 'bg-slate-50 ring-2 ring-indigo-500' : 'bg-white shadow-sm'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas por Pagar</p>
                                <h3 className="text-2xl font-black text-slate-800 mt-1">${(apStats?.total_payable || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</h3>
                                {apStats && apStats.overdue_amount > 0 ? (
                                    <p className="text-xs text-red-600 font-bold mt-2 flex items-center gap-1 animate-pulse"><AlertTriangle size={12}/> Vencido: ${apStats.overdue_amount.toLocaleString()}</p>
                                ) : (
                                    <p className="text-xs text-slate-400 font-bold mt-2 flex items-center gap-1"><CheckCircle size={12}/> Al corriente</p>
                                )}
                            </div>
                            <div className="p-2 bg-red-50 rounded text-red-500"><TrendingDown size={20}/></div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* --- ÁREA DE DESPLIEGUE --- */}
            {activeView === 'SALES_AUDIT' && (
                <div className="animate-in slide-in-from-top-4 duration-300">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden relative">
                        <button onClick={() => setActiveView('NONE')} className="absolute top-2 right-2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full z-20"><X size={20}/></button>

                        <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <FileText className="text-indigo-600"/> Auditoría de Operaciones
                                </h3>
                                <p className="text-xs text-slate-500">Gestión de cotizaciones, autorizaciones y seguimiento.</p>
                            </div>
                            <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                                {/* PESTAÑAS (AHORA, PIPELINE, HISTORY) */}
                                <button onClick={() => setSalesTab('dashboard')} className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${salesTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><LayoutDashboard size={14}/> Ahora</button>
                                <button onClick={() => setSalesTab('pipeline')} className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${salesTab === 'pipeline' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><RefreshCw size={14}/> En Proceso</button>
                                <button onClick={() => setSalesTab('history')} className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${salesTab === 'history' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><History size={14}/> Histórico Cerrado</button>
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto max-h-[600px]">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white text-slate-500 font-bold text-xs uppercase border-b border-slate-100 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-6 py-4">Proyecto</th>
                                        <th className="px-6 py-4 text-center">Estatus</th>
                                        <th className="px-6 py-4 text-right">Monto</th>
                                        <th className="px-6 py-4 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredOrders.length === 0 ? (
                                        <tr><td colSpan={4} className="p-12 text-center text-slate-400 italic">No hay registros en esta vista.</td></tr>
                                    ) : filteredOrders.map(o => (
                                        <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800">{o.project_name}</div>
                                                <div className="text-xs text-slate-400 flex items-center gap-1">
                                                    <Calendar size={10}/> {new Date(o.created_at).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">{renderStatusBadge(o.status as SalesOrderStatus)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="font-mono font-bold text-slate-700">${o.total_price?.toLocaleString()}</div>
                                                <div className="text-[10px] text-slate-400">Margen: {o.applied_margin_percent}%</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {o.status === SalesOrderStatus.SENT ? (
                                                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200" onClick={() => setSelectedOrderId(o.id)}><Briefcase size={14} className="mr-1"/> Auditar</Button>
                                                ) : (
                                                    <Button size="sm" variant="ghost" className="text-slate-500 hover:text-indigo-600" onClick={() => setSelectedOrderId(o.id)}><FileText size={14} className="mr-1"/> Detalle</Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* VISTAS RESTANTES (COBRAR Y PAGAR) */}
            {activeView === 'RECEIVABLES' && (
                <div className="animate-in slide-in-from-top-4 duration-300 p-12 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center relative">
                    <button onClick={() => setActiveView('NONE')} className="absolute top-2 right-2 p-2 text-slate-400 hover:text-red-500"><X size={20}/></button>
                    <Wallet size={64} className="mx-auto text-slate-300 mb-6"/>
                    <h3 className="text-xl font-bold text-slate-700 mb-2">Módulo de Cobranza</h3>
                    <p className="text-slate-500 max-w-md mx-auto">Visualización detallada de saldos por cliente y factura.</p>
                </div>
            )}

            {activeView === 'PAYABLES' && apStats && (
                 <div className="animate-in slide-in-from-top-4 duration-300 relative">
                    <button onClick={() => setActiveView('NONE')} className="absolute -top-3 -right-2 p-2 bg-white shadow-md rounded-full text-slate-400 hover:text-red-500 z-10"><X size={20}/></button>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl border-l-4 border-red-500 shadow-sm"><div className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2">Vencido (+90 Días)</div><div className="text-3xl font-black text-slate-800">${apStats.breakdown_by_age["+90"]?.toLocaleString()}</div></div>
                        <div className="bg-white p-6 rounded-xl border-l-4 border-orange-500 shadow-sm"><div className="text-sm font-bold text-orange-500 uppercase tracking-wider mb-2">Por Vencer (30 Días)</div><div className="text-3xl font-black text-slate-800">${apStats.breakdown_by_age["1-30"]?.toLocaleString()}</div></div>
                        <div className="bg-white p-6 rounded-xl border-l-4 border-emerald-500 shadow-sm"><div className="text-sm font-bold text-emerald-500 uppercase tracking-wider mb-2">Al Corriente</div><div className="text-3xl font-black text-slate-800">${apStats.upcoming_amount.toLocaleString()}</div></div>
                     </div>
                 </div>
            )}

        </div>
      )}

      {selectedOrderId && (
          <FinancialReviewModal 
              orderId={selectedOrderId}
              onClose={() => setSelectedOrderId(null)}
              onOrderUpdated={() => { setSelectedOrderId(null); fetchOrders(); }}
          />
      )}
    </div>
  );
};

export default Home;