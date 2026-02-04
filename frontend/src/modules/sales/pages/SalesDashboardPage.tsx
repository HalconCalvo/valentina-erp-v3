import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Plus, DollarSign, Pencil, Trash2, User, Eye, 
    Send, CheckCircle, AlertTriangle, RefreshCw, Mail, 
    LayoutDashboard, Archive, History, ThumbsDown, Clock, Activity, Wallet, 
    Check, XCircle, FilterX, FileText 
} from 'lucide-react'; 

import { useSales } from '../hooks/useSales';
import { useClients } from '../../foundations/hooks/useClients';
import { salesService } from '../../../api/sales-service'; 
import { SalesOrderStatus } from '../../../types/sales';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { SalesOrderDetailModal } from '../components/SalesOrderDetailModal';
import ExportButton from '../../../components/ui/ExportButton';

const SalesDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    
    // --- HOOKS DE DATOS ---
    const { orders, fetchOrders, loading: loadingSales } = useSales();
    const { clients, fetchClients } = useClients();
    
    // --- ESTADO DE UI ---
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [processingId, setProcessingId] = useState<number | null>(null);
    
    // Pestañas principales
    const [activeTab, setActiveTab] = useState<'active' | 'drafts' | 'history'>('active');
    
    // Filtro Específico (Para cuando das clic a la tarjeta)
    const [specificStatusFilter, setSpecificStatusFilter] = useState<SalesOrderStatus | null>(null);

    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    // --- ESTADO DE USUARIO (SEGURIDAD) ---
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [userRole, setUserRole] = useState<string>('');

    // 1. CARGA INICIAL Y POLLING
    useEffect(() => {
        fetchOrders();
        fetchClients();

        const rawId = localStorage.getItem('user_id');
        const rawRole = localStorage.getItem('user_role');
        
        if (rawId) {
            const cleanId = parseInt(rawId.toString().trim(), 10);
            if (!isNaN(cleanId)) setCurrentUserId(cleanId);
        }
        
        if (rawRole) {
            setUserRole(rawRole.toUpperCase().trim());
        }

        const intervalId = setInterval(() => {
            fetchOrders(undefined, undefined, true); 
            setLastUpdate(new Date()); 
        }, 5000); 

        return () => clearInterval(intervalId);
    }, [fetchOrders, fetchClients]);

    // 2. FILTRO MAESTRO DE SEGURIDAD
    const myOrders = useMemo(() => {
        if (!orders || orders.length === 0) return [];

        if (userRole === 'DIRECTOR' || userRole === 'ADMIN') {
            return orders;
        }

        if (userRole === 'SALES') {
            const fallbackId = localStorage.getItem('user_id')?.trim();
            const myIdStr = currentUserId ? String(currentUserId) : fallbackId;
            if (!myIdStr) return [];

            return orders.filter(order => {
                if (!order.user_id) return false; 
                return String(order.user_id).trim() === String(myIdStr).trim();
            });
        }
        return [];
    }, [orders, userRole, currentUserId]);

    // 3. AUTO-DETECTAR PESTAÑA
    useEffect(() => {
        if (loadingSales) return;
        const hasActive = myOrders.some(o => o.status === SalesOrderStatus.SENT || o.status === SalesOrderStatus.ACCEPTED || o.status === SalesOrderStatus.CHANGE_REQUESTED);
        const hasDrafts = myOrders.some(o => o.status === SalesOrderStatus.DRAFT || o.status === SalesOrderStatus.REJECTED);
        
        if (!hasActive && hasDrafts && activeTab === 'active' && !specificStatusFilter) {
            setActiveTab('drafts');
        }
    }, [myOrders, loadingSales]);

    // 4. CÁLCULO DE KPIs
    const kpiData = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const soldOrders = myOrders.filter(o => o.status === SalesOrderStatus.SOLD);
        const sentOrders = myOrders.filter(o => o.status === SalesOrderStatus.SENT); 

        const monthlyOrders = soldOrders.filter(o => {
            if (!o.created_at) return false;
            const date = new Date(o.created_at);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
        const monthlyCommissions = monthlyOrders.reduce((sum, o) => {
            const commissionRate = (o.applied_commission_percent || 0) / 100;
            return sum + ((o.total_price || 0) * commissionRate);
        }, 0);

        const pendingAuthAmount = sentOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);

        return {
            drafts: myOrders.filter(o => o.status === SalesOrderStatus.DRAFT || o.status === SalesOrderStatus.REJECTED).length,
            inReview: sentOrders.length,
            inReviewAmount: pendingAuthAmount,
            // Agregamos el conteo de ventas del mes para equilibrar el diseño
            monthlyCount: monthlyOrders.length, 
            monthlyRevenue: monthlyRevenue,
            monthlyCommissions: monthlyCommissions
        };
    }, [myOrders]); 

    // 5. FILTRADO
    const filteredOrders = useMemo(() => {
        if (!myOrders) return [];

        let baseList = [];
        
        switch (activeTab) {
            case 'active': 
                baseList = myOrders.filter(o => o.status === SalesOrderStatus.SENT || o.status === SalesOrderStatus.ACCEPTED || o.status === SalesOrderStatus.CHANGE_REQUESTED);
                break;
            case 'drafts': 
                baseList = myOrders.filter(o => o.status === SalesOrderStatus.DRAFT || o.status === SalesOrderStatus.REJECTED);
                break;
            case 'history': 
                baseList = myOrders.filter(o => o.status === SalesOrderStatus.SOLD || o.status === SalesOrderStatus.CLIENT_REJECTED);
                break;
            default: baseList = [];
        }

        if (specificStatusFilter) {
            return baseList.filter(o => o.status === specificStatusFilter);
        }

        return baseList;
    }, [myOrders, activeTab, specificStatusFilter]);

    // --- MANEJADORES DE UI ---
    
    // Helper para formato de moneda (Igual que en Home y Gerencia)
    const formatCurrency = (amount: number) => {
        return amount.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const handleTabChange = (tab: 'active' | 'drafts' | 'history') => {
        setActiveTab(tab);
        setSpecificStatusFilter(null);
    };

    const handleCardClickReview = () => {
        setActiveTab('active');
        setSpecificStatusFilter(SalesOrderStatus.SENT);
    };

    const handleAction = async (action: () => Promise<void>, confirmMsg?: string) => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        try { 
            await action(); 
            await fetchOrders(); 
        } catch (e) { 
            alert("Ocurrió un error al procesar la solicitud."); 
            console.error(e);
        }
    };

    const handleSendEmail = (id: number) => {
        salesService.downloadPDF(id);
    };

    const getClientName = (clientId: number) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.full_name : `Cliente ID: ${clientId}`;
    };

    const renderStatusBadge = (status: SalesOrderStatus) => {
        switch (status) {
            case SalesOrderStatus.SENT: return <span className="px-2 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 w-fit"><Clock size={10}/> EN REVISIÓN</span>;
            case SalesOrderStatus.CHANGE_REQUESTED: return <span className="px-2 py-1 bg-orange-100 text-orange-800 border border-orange-200 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 w-fit"><RefreshCw size={10}/> EN AJUSTES</span>;
            case SalesOrderStatus.ACCEPTED: return <span className="inline-flex flex-col items-center justify-center px-3 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded text-[10px] font-bold uppercase text-center leading-tight shadow-sm"><span className="flex items-center gap-1"><CheckCircle size={10}/> AUTORIZADA</span><span className="text-[9px] text-blue-600 opacity-80">LISTA PARA CLIENTE</span></span>;
            case SalesOrderStatus.SOLD: return <span className="px-2 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 w-fit"><DollarSign size={10}/> VENDIDA</span>;
            case SalesOrderStatus.DRAFT: return <span className="px-2 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-bold uppercase tracking-wide border-dashed border-slate-300">BORRADOR</span>;
            case SalesOrderStatus.CLIENT_REJECTED: return <span className="px-2 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 w-fit"><ThumbsDown size={10}/> PERDIDA</span>;
            case SalesOrderStatus.REJECTED: return <span className="px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 w-fit"><AlertTriangle size={10}/> CORREGIR</span>;
            default: return <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs">{status}</span>;
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-24">
            
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <DollarSign className="text-emerald-600"/> Ventas y Cotizaciones
                    </h1>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span className="font-mono bg-slate-100 px-2 rounded border border-slate-200 text-xs">
                             👤 ID: {currentUserId ?? '?'} | ROL: {userRole}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 text-emerald-600 font-bold">
                            <Activity size={10} className="animate-pulse"/> En vivo {lastUpdate.toLocaleTimeString()}
                        </span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <ExportButton data={myOrders} fileName={`Reporte_Ventas_${userRole}`} label="Excel" mapping={(o: any) => o} />
                    <Button onClick={() => navigate('/sales/new')} className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-200">
                        <Plus size={18} className="mr-2"/> Nueva Cotización
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* 1. BORRADORES (SE MANTIENE EL CERO SIEMPRE) */}
                <Card 
                    className={`p-4 border-l-4 shadow-sm cursor-pointer transition-all ${activeTab === 'drafts' ? 'bg-slate-50 ring-2 ring-slate-200' : 'bg-white'} border-l-slate-400`} 
                    onClick={() => handleTabChange('drafts')}
                >
                    <div className="text-xs text-slate-500 uppercase font-bold">Borradores</div>
                    <div className="text-2xl font-black text-slate-700">{kpiData.drafts}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Clic para ver</div>
                </Card>
                
                {/* 2. POR AUTORIZAR (OCULTAR 0) */}
                <Card 
                    className={`p-4 border-l-4 shadow-sm cursor-pointer transition-all ${specificStatusFilter === SalesOrderStatus.SENT ? 'bg-amber-50 ring-2 ring-amber-200' : 'bg-white'} border-l-amber-500`} 
                    onClick={handleCardClickReview}
                >
                    <div className="flex justify-between items-start">
                        <div className="text-xs text-slate-500 uppercase font-bold">Por Autorizar</div>
                        {specificStatusFilter === SalesOrderStatus.SENT && <Activity size={14} className="text-amber-500 animate-pulse"/>}
                    </div>
                    
                    <div className="flex flex-row items-baseline mt-1">
                        {/* Contador Ocultable */}
                        {kpiData.inReview > 0 && (
                            <div className="text-2xl font-black text-amber-600/60">{kpiData.inReview}</div>
                        )}
                        {/* Dinero Alineado Derecha */}
                        <div className="ml-auto text-2xl font-black text-orange-600">
                            {formatCurrency(kpiData.inReviewAmount)}
                        </div>
                    </div>

                    <div className="text-[10px] text-slate-400 mt-1">Requieren firma Dirección</div>
                </Card>

                {/* 3. VENTAS MES (OCULTAR 0) */}
                <Card className="p-4 bg-white border-l-4 border-l-emerald-500 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div className="text-xs text-slate-500 uppercase font-bold">Ventas Mes</div>
                        <DollarSign size={14} className="text-emerald-500"/>
                    </div>
                    
                    <div className="flex flex-row items-baseline mt-1">
                        {/* Contador Ocultable */}
                        {kpiData.monthlyCount > 0 && (
                            <div className="text-2xl font-black text-emerald-600/50">{kpiData.monthlyCount}</div>
                        )}
                        {/* Dinero Alineado Derecha */}
                        <div className="ml-auto text-2xl font-black text-emerald-600">
                            {formatCurrency(kpiData.monthlyRevenue)}
                        </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Cerradas este mes</div>
                </Card>

                {/* 4. COMISIONES MES (OCULTAR 0) */}
                <Card className="p-4 bg-white border-l-4 border-l-indigo-500 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500 uppercase font-bold">Comisiones Mes</div>
                        <Wallet size={14} className="text-indigo-400"/>
                    </div>
                    
                    <div className="flex flex-row items-baseline mt-1">
                        {/* Contador Ocultable */}
                        {kpiData.monthlyCount > 0 && (
                             <div className="text-2xl font-black text-indigo-600/50">{kpiData.monthlyCount}</div>
                        )}
                        {/* Dinero Alineado Derecha */}
                        <div className="ml-auto text-2xl font-black text-indigo-600">
                            {formatCurrency(kpiData.monthlyCommissions)}
                        </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Ganancia estimada</div>
                </Card>
            </div>

            {/* Pestañas de Navegación + Aviso de Filtro */}
            <div className="flex items-center gap-4">
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-fit">
                    <button onClick={() => handleTabChange('active')} className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${activeTab === 'active' && !specificStatusFilter ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><LayoutDashboard size={14}/> En Proceso (Todas)</button>
                    <button onClick={() => handleTabChange('drafts')} className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${activeTab === 'drafts' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Archive size={14}/> Borradores {kpiData.drafts > 0 && <span className="ml-1 bg-slate-600 text-white text-[9px] px-1.5 rounded-full">{kpiData.drafts}</span>}</button>
                    <button onClick={() => handleTabChange('history')} className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><History size={14}/> Histórico Cerrado</button>
                </div>

                {specificStatusFilter === SalesOrderStatus.SENT && (
                    <div className="flex items-center gap-2 bg-amber-50 text-amber-800 text-xs px-3 py-1.5 rounded-full border border-amber-200 animate-fadeIn">
                        <FilterX size={12}/>
                        <span className="font-bold">Filtrando: Por Autorizar ({filteredOrders.length})</span>
                        <button onClick={() => handleTabChange('active')} className="underline ml-1 hover:text-amber-900">Ver todas</button>
                    </div>
                )}
            </div>

            {/* TABLA PRINCIPAL */}
            <Card className="overflow-hidden bg-white border border-slate-200 shadow-sm min-h-[400px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Folio / Proyecto</th>
                                <th className="px-6 py-3">Cliente</th>
                                <th className="px-6 py-3 text-center">Estatus</th>
                                <th className="px-6 py-3 text-right">Total</th>
                                <th className="px-6 py-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredOrders.length === 0 ? (
                                <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">
                                    {specificStatusFilter === SalesOrderStatus.SENT 
                                        ? "¡Excelente! No hay cotizaciones pendientes de autorización." 
                                        : activeTab === 'drafts' ? "No tienes borradores pendientes." : "No hay cotizaciones en esta vista."}
                                </td></tr>
                            ) : filteredOrders.map((order) => (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{order.project_name}</div>
                                        <div className="text-xs text-slate-400 font-mono">ID: #{order.id}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><User size={16} /></div>
                                            <div>
                                                <div className="font-bold text-slate-700 text-sm">{getClientName(order.client_id)}</div>
                                                <div className="text-[10px] text-slate-400">{new Date(order.created_at || Date.now()).toLocaleDateString('es-MX')}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">{renderStatusBadge(order.status as SalesOrderStatus)}</td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">${order.total_price?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                    
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex justify-center items-center gap-2">
                                            
                                            {(order.status === SalesOrderStatus.DRAFT || order.status === SalesOrderStatus.CHANGE_REQUESTED || order.status === SalesOrderStatus.REJECTED) && (
                                                <>
                                                    <button onClick={() => handleAction(() => salesService.requestAuth(order.id), "¿Enviar a revisión?")} disabled={processingId === order.id} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Enviar a Revisión"><Send size={18} /></button>
                                                    <button onClick={() => navigate(`/sales/edit/${order.id}`)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Editar"><Pencil size={18} /></button>
                                                    <button onClick={() => handleAction(() => salesService.deleteOrder(order.id), "¿Eliminar?")} className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg" title="Eliminar"><Trash2 size={18} /></button>
                                                </>
                                            )}

                                            {order.status === SalesOrderStatus.SENT && (
                                                <div className="flex gap-2 bg-amber-50 p-1 rounded-lg border border-amber-100">
                                                    <button onClick={() => setSelectedOrderId(order.id)} className="p-2 text-slate-600 hover:bg-white rounded shadow-sm" title="Ver Detalles"><Eye size={18} /></button>
                                                    {(userRole === 'DIRECTOR' || userRole === 'ADMIN') && (
                                                        <>
                                                            <div className="w-px bg-amber-200 mx-1"></div>
                                                            <button onClick={() => handleAction(() => salesService.authorizeOrder(order.id), "¿Autorizar esta cotización?")} className="p-2 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded transition-colors" title="Autorizar"><Check size={18} strokeWidth={3} /></button>
                                                            <button onClick={() => handleAction(() => salesService.requestChanges(order.id), "¿Devolver a Ventas para ajustes?")} className="p-2 text-orange-500 hover:bg-orange-100 hover:text-orange-700 rounded transition-colors" title="Solicitar Cambios"><RefreshCw size={18} /></button>
                                                            <button onClick={() => handleAction(() => salesService.rejectOrder(order.id), "¿Rechazar definitivamente?")} className="p-2 text-slate-400 hover:bg-red-100 hover:text-red-600 rounded transition-colors" title="Rechazar"><XCircle size={18} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {order.status === SalesOrderStatus.ACCEPTED && (
                                                <div className="flex gap-1 p-1 bg-green-50 border border-green-100 rounded-lg shadow-sm">
                                                    {/* 1. Ver / Descargar PDF */}
                                                    <button onClick={() => handleSendEmail(order.id)} className="p-2 text-slate-600 hover:bg-blue-100 hover:text-blue-700 rounded" title="Descargar PDF">
                                                        <FileText size={18} />
                                                    </button>
                                                    
                                                    {/* 2. Cliente Aceptó (Vender) */}
                                                    <button onClick={() => handleAction(() => salesService.markAsSold(order.id), "¿Confirmar que el cliente aceptó? Se generará la Orden de Venta.")} className="p-2 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded shadow-sm" title="Cliente Aceptó (Vender)">
                                                        <DollarSign size={18} />
                                                    </button>

                                                    <div className="w-px bg-slate-300 mx-1"></div>
                                                    
                                                    {/* 3. Modificar (Re-enviar) */}
                                                    <button onClick={() => navigate(`/sales/edit/${order.id}`)} className="p-2 text-amber-600 hover:bg-amber-100 rounded" title="Modificar (Re-enviar a Dirección)">
                                                        <Pencil size={18} />
                                                    </button>
                                                    
                                                    {/* 4. Eliminar */}
                                                    <button onClick={() => handleAction(() => salesService.deleteOrder(order.id), "¿Seguro que deseas eliminar esta cotización autorizada?")} className="p-2 text-slate-400 hover:bg-red-100 hover:text-red-600 rounded" title="Eliminar">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            )}

                                            {(order.status === SalesOrderStatus.SOLD || order.status === SalesOrderStatus.CLIENT_REJECTED) && (
                                                 <button onClick={() => setSelectedOrderId(order.id)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><Eye size={18} /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <SalesOrderDetailModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
        </div>
    );
};

export default SalesDashboardPage;