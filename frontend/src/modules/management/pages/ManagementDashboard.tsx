import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    TrendingUp, AlertTriangle, CheckCircle, Clock, 
    DollarSign, ThumbsDown, RefreshCw, Package, 
    Settings, Edit, FileText, Activity, 
    CalendarDays, Wallet, TrendingDown, LayoutDashboard, History, ListFilter
} from 'lucide-react';

// Hooks & Services
import { useSales } from '../../sales/hooks/useSales'; 
import { useMaterials } from '../../foundations/hooks/useMaterials';
import { inventoryService, AccountsPayableStats } from '../../../api/inventory-service';

// Types & UI
import { SalesOrderStatus } from '../../../types/sales';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { FinancialReviewModal } from '../components/FinancialReviewModal';

const ManagementDashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // 1. DATA: VENTAS
    const { orders, fetchOrders, loading: loadingSales } = useSales();
    const safeOrders = Array.isArray(orders) ? orders : [];
    
    // 2. DATA: INVENTARIO
    const { materials, loading: loadingMats } = useMaterials();

    // 3. DATA: CUENTAS POR PAGAR (Backend Real)
    const [apStats, setApStats] = useState<AccountsPayableStats | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    
    // 4. UI: TABS DE FILTRADO
    const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline' | 'history'>('dashboard');

    useEffect(() => {
        fetchOrders();
        
        inventoryService.getAccountsPayableSummary()
            .then(data => setApStats(data))
            .catch(err => console.error("Error cargando finanzas:", err));

    }, [fetchOrders]);

    // --- FECHAS ---
    const now = new Date();
    const currentMonth = now.getMonth(); 
    const currentYear = now.getFullYear();
    const currentMonthName = now.toLocaleString('es-MX', { month: 'long' });

    // --- CÁLCULOS KPI GLOBALES (Independientes del Tab) ---
    const pendingOrders = safeOrders.filter(o => o.status === SalesOrderStatus.SENT);
    const pendingAmount = pendingOrders.reduce((acc, curr) => acc + (curr.total_price || 0), 0);
    
    const approvedOrdersThisMonth = safeOrders.filter(o => {
        const isSold = o.status === SalesOrderStatus.ACCEPTED || o.status === SalesOrderStatus.SOLD;
        const orderDate = o.created_at ? new Date(o.created_at) : new Date();
        const isCurrentMonth = orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
        return isSold && isCurrentMonth;
    });
    const approvedAmountMonth = approvedOrdersThisMonth.reduce((acc, curr) => acc + (curr.total_price || 0), 0);

    const receivableOrders = safeOrders.filter(o => o.status === SalesOrderStatus.ACCEPTED);
    const receivableAmount = receivableOrders.reduce((acc, curr) => acc + (curr.total_price || 0), 0);
    
    const loading = loadingSales || loadingMats;
    const hasPending = pendingOrders.length > 0;

    // --- FILTRADO POR PESTAÑA ---
    const filteredOrders = useMemo(() => {
        // Excluimos borradores en todas las vistas
        const baseOrders = safeOrders.filter(o => o.status !== SalesOrderStatus.DRAFT);
        
        switch (activeTab) {
            case 'dashboard':
                // AHORA (Antes Tablero): Lo urgente + Resultados del Mes
                return baseOrders.filter(o => {
                    const isUrgent = o.status === SalesOrderStatus.SENT || o.status === SalesOrderStatus.CHANGE_REQUESTED;
                    
                    // Resultados del mes (Vendido o Perdido)
                    const orderDate = o.created_at ? new Date(o.created_at) : new Date();
                    const isThisMonth = orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
                    const isResult = (o.status === SalesOrderStatus.SOLD || o.status === SalesOrderStatus.REJECTED || o.status === SalesOrderStatus.CLIENT_REJECTED) && isThisMonth;
                    
                    // También incluimos las "En Espera" para tener visión completa
                    const isWaiting = o.status === SalesOrderStatus.ACCEPTED;

                    return isUrgent || isWaiting || isResult;
                });
            
            case 'pipeline':
                // EN SEGUIMIENTO: Solo lo que está vivo en la cancha (Autorizadas o en Ajustes)
                return baseOrders.filter(o => 
                    o.status === SalesOrderStatus.ACCEPTED || 
                    o.status === SalesOrderStatus.CHANGE_REQUESTED
                );
            
            case 'history':
                // HISTÓRICO: Todo lo cerrado (Vendido o Perdido) de cualquier fecha
                return baseOrders.filter(o => 
                    o.status === SalesOrderStatus.SOLD || 
                    o.status === SalesOrderStatus.REJECTED || 
                    o.status === SalesOrderStatus.CLIENT_REJECTED
                );

            default:
                return baseOrders;
        }
    }, [safeOrders, activeTab, currentMonth, currentYear]);

    // --- BADGES (SEMÁFORO INTELIGENTE) ---
    const renderStatusBadge = (status: SalesOrderStatus) => {
        switch (status) {
            // INTENSIDAD ALTA (Naranja/Ámbar) - Acción Requerida
            case SalesOrderStatus.SENT:
                return <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded border border-amber-200 text-xs font-bold flex items-center gap-1 w-fit"><AlertTriangle size={12}/> POR AUTORIZAR</span>;
            case SalesOrderStatus.CHANGE_REQUESTED:
                return <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded border border-orange-200 text-xs font-bold flex items-center gap-1 w-fit"><RefreshCw size={12}/> EN AJUSTES</span>;
            
            // INTENSIDAD MEDIA (Azul) - Flujo Normal / Espera
            case SalesOrderStatus.ACCEPTED:
                return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded border border-blue-200 text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12}/> AUTORIZADA / ESPERA</span>;
            
            // INTENSIDAD BAJA (Verde) - Éxito
            case SalesOrderStatus.SOLD:
                return <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded border border-emerald-200 text-xs font-bold flex items-center gap-1 w-fit shadow-sm"><DollarSign size={12}/> VENDIDA</span>;
            
            // INTENSIDAD APAGADA (Gris) - Muertas
            case SalesOrderStatus.CLIENT_REJECTED:
                return <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded border border-slate-200 text-xs font-bold flex items-center gap-1 w-fit"><ThumbsDown size={12}/> PERDIDA</span>;
            case SalesOrderStatus.REJECTED: // Rechazo interno (Gerencia)
                return <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded border border-slate-200 text-xs font-bold w-fit">CANCELADA</span>;
            
            default:
                return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs w-fit">{status}</span>;
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 pb-24">
            
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-4 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
                        <Activity className="text-indigo-600" /> Torre de Control
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Visión global: Auditoría de Ventas y Flujo de Caja Operativo.
                    </p>
                </div>
                <div className="text-right bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha de Corte</p>
                    <p className="text-sm font-bold text-slate-700 font-mono">{new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>

            {/* KPI CARDS (Se mantienen igual) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* 1. POR AUTORIZAR */}
                <Card className={`p-5 border-l-4 ${hasPending ? 'border-l-amber-500' : 'border-l-emerald-500'} bg-white shadow-sm relative overflow-hidden group hover:shadow-lg transition-all`}>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {hasPending ? 'Pendiente Autorizar' : 'Bandeja al Día'}
                            </p>
                            <h3 className="text-2xl font-black text-slate-800 mt-1">
                                ${pendingAmount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                            </h3>
                            <p className={`text-xs ${hasPending ? 'text-amber-600' : 'text-emerald-600'} font-bold mt-2 flex items-center gap-1`}>
                                <Clock size={12}/> {pendingOrders.length} cotizaciones
                            </p>
                        </div>
                        <div className={`p-2 ${hasPending ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'} rounded`}>
                            {hasPending ? <AlertTriangle size={20}/> : <CheckCircle size={20}/>}
                        </div>
                    </div>
                </Card>

                {/* 2. VENTAS DEL MES */}
                <Card className="p-5 border-l-4 border-l-emerald-500 bg-white shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Ventas {currentMonthName}
                            </p>
                            <h3 className="text-2xl font-black text-slate-800 mt-1">
                                ${approvedAmountMonth.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                            </h3>
                            <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1">
                                <CalendarDays size={12}/> {approvedOrdersThisMonth.length} cierres
                            </p>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded text-emerald-500"><DollarSign size={20}/></div>
                    </div>
                </Card>

                {/* 3. CUENTAS POR COBRAR */}
                <Card 
                    onClick={() => alert("Próximamente: Reporte de Antigüedad de Saldos (Clientes).")}
                    className="p-5 border-l-4 border-l-emerald-500 bg-white shadow-sm relative overflow-hidden group hover:shadow-lg transition-all cursor-pointer"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas por Cobrar</p>
                            <h3 className="text-2xl font-black text-slate-800 mt-1">
                                ${receivableAmount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                            </h3>
                            <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1">
                                <Wallet size={12}/> {receivableOrders.length} proyectos activos
                            </p>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded text-emerald-500 group-hover:bg-emerald-100 transition-colors">
                            <TrendingUp size={20}/>
                        </div>
                    </div>
                </Card>

                {/* 4. CUENTAS POR PAGAR */}
                <Card 
                    onClick={() => {
                         if (!apStats) return;
                         alert(`DETALLE DE VENCIMIENTOS PROVEEDORES:\n\n` +
                               `🟢 Corriente: $${apStats.upcoming_amount.toLocaleString()}\n` +
                               `🔴 Vencido Total: $${apStats.overdue_amount.toLocaleString()}\n\n` +
                               `-- Desglose Vencido --\n` +
                               `1-30 días: $${apStats.breakdown_by_age["1-30"].toLocaleString()}\n` +
                               `31-60 días: $${apStats.breakdown_by_age["31-60"].toLocaleString()}\n` +
                               `+90 días: $${apStats.breakdown_by_age["+90"].toLocaleString()}`);
                    }}
                    className="p-5 border-l-4 border-l-red-500 bg-white shadow-sm relative overflow-hidden group hover:shadow-lg transition-all cursor-pointer"
                >
                     <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas por Pagar</p>
                            
                            <h3 className="text-2xl font-black text-slate-800 mt-1">
                                ${ (apStats?.total_payable || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) }
                            </h3>
                            
                            {apStats && apStats.overdue_amount > 0 ? (
                                <p className="text-xs text-red-600 font-bold mt-2 flex items-center gap-1 animate-pulse">
                                    <AlertTriangle size={12}/> Vencido: ${apStats.overdue_amount.toLocaleString()}
                                </p>
                            ) : (
                                <p className="text-xs text-slate-400 font-bold mt-2 flex items-center gap-1">
                                    <CheckCircle size={12}/> Al corriente
                                </p>
                            )}

                        </div>
                        <div className="p-2 bg-red-50 rounded text-red-500 group-hover:bg-red-100 transition-colors">
                            <TrendingDown size={20}/>
                        </div>
                    </div>
                </Card>
            </div>

            {/* TABLA DE AUDITORÍA CON PESTAÑAS */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <FileText size={20} className="text-slate-400"/> Auditoría de Operaciones
                    </h3>

                    {/* CONTROL DE PESTAÑAS */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                        {/* AQUÍ ESTÁ EL CAMBIO: 'AHORA' */}
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <LayoutDashboard size={14}/> Ahora
                        </button>
                        <button
                            onClick={() => setActiveTab('pipeline')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${activeTab === 'pipeline' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <ListFilter size={14}/> En Seguimiento
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <History size={14}/> Histórico Cerrado
                        </button>
                    </div>
                </div>

                <Card className="overflow-hidden bg-white shadow-sm border border-slate-200 min-h-[300px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Folio</th>
                                    <th className="px-6 py-4">Cliente / Proyecto</th>
                                    <th className="px-6 py-4 text-center">Estatus</th>
                                    <th className="px-6 py-4 text-right">Monto Venta</th>
                                    <th className="px-6 py-4 text-center">Gestión</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">Calculando indicadores...</td></tr>
                                ) : filteredOrders.length === 0 ? (
                                    <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">No hay registros en esta vista.</td></tr>
                                ) : filteredOrders.map((order) => (
                                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-800">#{order.id}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900">{order.project_name}</div>
                                            <div className="text-xs text-slate-500">
                                                {new Date(order.created_at || Date.now()).toLocaleDateString('es-MX')} 
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">{renderStatusBadge(order.status as SalesOrderStatus)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="font-bold text-slate-800 text-base">
                                                ${order.total_price?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                            </div>
                                            <div className="text-[10px] text-slate-400">
                                                Margen: {order.applied_margin_percent}%
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            
                                            {/* BOTONES DE ACCIÓN SEGÚN ESTATUS */}

                                            {/* AUDITAR (Solo Gerente en Pendientes) */}
                                            {order.status === SalesOrderStatus.SENT && (
                                                <Button 
                                                    size="sm"
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 transition-all hover:scale-105"
                                                    onClick={() => setSelectedOrderId(order.id)}
                                                >
                                                    <Settings size={14} className="mr-2"/> Auditar
                                                </Button>
                                            )}

                                            {/* VER DETALLE (Para seguimiento o histórico) */}
                                            {order.status !== SalesOrderStatus.SENT && (
                                                <Button 
                                                    size="sm"
                                                    variant="secondary"
                                                    className="border-slate-300 hover:bg-slate-100 text-slate-600"
                                                    onClick={() => setSelectedOrderId(order.id)}
                                                >
                                                    <FileText size={14} className="mr-2"/> Detalle
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* MODAL */}
            {selectedOrderId && (
                <FinancialReviewModal 
                    orderId={selectedOrderId}
                    onClose={() => setSelectedOrderId(null)}
                    onOrderUpdated={() => {
                        setSelectedOrderId(null);
                        fetchOrders();
                    }}
                />
            )}
        </div>
    );
};

export default ManagementDashboard;