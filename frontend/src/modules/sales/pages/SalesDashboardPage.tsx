import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Plus, DollarSign, Pencil, Trash2, User, Eye, 
    Send, CheckCircle, AlertTriangle, RefreshCw, 
    LayoutDashboard, Archive, History, ThumbsDown, Clock, Activity, Wallet, 
    Check, XCircle, FilterX, FileText, Truck, Calendar, Search, Undo2, X, Download
} from 'lucide-react'; 

import { useSales } from '../hooks/useSales';
import { useClients } from '../../foundations/hooks/useClients';
import { salesService } from '../../../api/sales-service'; 
import { SalesOrderStatus } from '../../../types/sales';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import { SalesOrderDetailModal } from '../components/SalesOrderDetailModal';
import ExportButton from '../../../components/ui/ExportButton';

// Tipos para controlar qué tabla vemos
type ModuleView = 'GENERAL' | 'TRACKING' | 'RECEIVABLES';
// Tipo extendido para las pestañas incluyendo Búsqueda
type TabView = 'active' | 'drafts' | 'history' | 'search';

const SalesDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    
    // --- HOOKS DE DATOS ---
    const { orders, fetchOrders, loading: loadingSales } = useSales();
    const { clients, fetchClients } = useClients();
    
    // --- ESTADO DE UI ---
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [processingId, setProcessingId] = useState<number | null>(null);
    
    // Control de Vistas
    const [currentView, setCurrentView] = useState<ModuleView>('GENERAL');
    const [activeTab, setActiveTab] = useState<TabView>('active'); 
    const [specificStatusFilter, setSpecificStatusFilter] = useState<SalesOrderStatus | null>(null);
    
    // ESTADO PARA LA BÚSQUEDA
    const [searchQuery, setSearchQuery] = useState('');

    // ESTADO PARA PREVISUALIZACIÓN PDF
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [loadingPdf, setLoadingPdf] = useState(false);

    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [userRole, setUserRole] = useState<string>('');

    // 1. CARGA INICIAL
    useEffect(() => {
        fetchOrders();
        fetchClients();

        const rawId = localStorage.getItem('user_id');
        const rawRole = localStorage.getItem('user_role');
        
        if (rawId) {
            const cleanId = parseInt(rawId.toString().trim(), 10);
            if (!isNaN(cleanId)) setCurrentUserId(cleanId);
        }
        if (rawRole) setUserRole(rawRole.toUpperCase().trim());

        const intervalId = setInterval(() => {
            fetchOrders(undefined, undefined, true); 
            setLastUpdate(new Date()); 
        }, 10000); 

        return () => clearInterval(intervalId);
    }, [fetchOrders, fetchClients]);

    // 2. FILTRO MAESTRO (SEGURIDAD)
    const myOrders = useMemo(() => {
        if (!orders || orders.length === 0) return [];
        if (userRole === 'DIRECTOR' || userRole === 'ADMIN') return orders;
        if (userRole === 'SALES') {
            const fallbackId = localStorage.getItem('user_id')?.trim();
            const myIdStr = currentUserId ? String(currentUserId) : fallbackId;
            if (!myIdStr) return [];
            return orders.filter(order => order.user_id && String(order.user_id).trim() === String(myIdStr).trim());
        }
        return [];
    }, [orders, userRole, currentUserId]);

    // 3. CÁLCULO DE KPIs
    const kpiData = useMemo(() => {
        const drafts = myOrders.filter(o => 
            o.status === SalesOrderStatus.DRAFT || 
            o.status === SalesOrderStatus.REJECTED || 
            o.status === SalesOrderStatus.CHANGE_REQUESTED
        );
        
        const pendingAuth = myOrders.filter(o => o.status === SalesOrderStatus.SENT);
        
        // Seguimiento
        const inProgress = myOrders.filter(o => o.status === SalesOrderStatus.ACCEPTED || o.status === SalesOrderStatus.SOLD);
        
        // Cobranza
        const receivables = myOrders.filter(o => o.status === SalesOrderStatus.SOLD);
        const receivableAmount = receivables.reduce((sum, o) => sum + (o.total_price || 0), 0);

        return {
            draftsCount: drafts.length,
            pendingAuthCount: pendingAuth.length,
            trackingCount: inProgress.length,
            receivablesCount: receivables.length,
            receivableAmount: receivableAmount,
            receivablesList: receivables,
            trackingList: inProgress
        };
    }, [myOrders]); 

    // 4. FILTRADO DE LA TABLA
    const filteredOrders = useMemo(() => {
        if (!myOrders) return [];
        
        if (currentView === 'TRACKING') return kpiData.trackingList;
        if (currentView === 'RECEIVABLES') return kpiData.receivablesList;

        let baseList = [];
        switch (activeTab) {
            case 'active': 
                baseList = myOrders.filter(o => 
                    o.status === SalesOrderStatus.SENT || 
                    o.status === SalesOrderStatus.ACCEPTED || 
                    o.status === SalesOrderStatus.SOLD
                );
                break;
            case 'drafts': 
                baseList = myOrders.filter(o => 
                    o.status === SalesOrderStatus.DRAFT || 
                    o.status === SalesOrderStatus.REJECTED || 
                    o.status === SalesOrderStatus.CHANGE_REQUESTED
                );
                break;
            case 'history': 
                baseList = myOrders.filter(o => 
                    o.status === SalesOrderStatus.SOLD || 
                    o.status === SalesOrderStatus.CLIENT_REJECTED
                );
                break;
            case 'search':
                if (!searchQuery.trim()) {
                    baseList = myOrders; 
                } else {
                    const q = searchQuery.toLowerCase();
                    baseList = myOrders.filter(o => {
                        const matchId = String(o.id).includes(q);
                        const matchProject = o.project_name.toLowerCase().includes(q);
                        const clientName = clients.find(c => c.id === o.client_id)?.full_name.toLowerCase() || '';
                        const matchClient = clientName.includes(q);
                        const matchInvoice = o.external_invoice_ref?.toLowerCase().includes(q) || false;
                        return matchId || matchProject || matchClient || matchInvoice;
                    });
                }
                break;
            default: baseList = [];
        }

        if (specificStatusFilter && activeTab !== 'search') {
            return baseList.filter(o => o.status === specificStatusFilter);
        }
        return baseList;
    }, [myOrders, activeTab, specificStatusFilter, currentView, kpiData, searchQuery, clients]);

    // --- UTILS ---
    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
    const getClientName = (clientId: number) => { const c = clients.find(cl => cl.id === clientId); return c ? c.full_name : `ID: ${clientId}`; };

    // --- HANDLERS ---
    const handleResetView = () => {
        setCurrentView('GENERAL');
        setActiveTab('active');
        setSpecificStatusFilter(null);
        setSearchQuery('');
    };

    const handleAction = async (action: () => Promise<void>, confirmMsg?: string) => {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        try { await action(); await fetchOrders(); } catch (e) { alert("Error al procesar."); }
    };

    const handleUndoSubmission = async (orderId: number) => {
        if (!window.confirm("¿Deseas cancelar el envío y regresar esta cotización a BORRADOR para editarla?")) return;
        try {
            await salesService.updateOrder(orderId, { status: SalesOrderStatus.DRAFT });
            await fetchOrders(); 
            setCurrentView('GENERAL');
            setSpecificStatusFilter(null);
            setActiveTab('drafts');
        } catch (error) {
            console.error(error);
            alert("No se pudo cancelar el envío.");
        }
    };

    // --- FUNCIÓN PREVIEW PDF (USANDO EL SERVICIO) ---
    const handlePreviewPDF = async (orderId: number) => {
        setLoadingPdf(true);
        try {
            // Llamamos a la función que agregamos en sales-service.ts
            const pdfBlob = await salesService.getPdfPreview(orderId);
            
            // Creamos una URL temporal
            const url = window.URL.createObjectURL(pdfBlob);
            setPdfPreviewUrl(url);
        } catch (error) {
            console.error("Error cargando PDF:", error);
            alert("No se pudo cargar la vista previa del PDF.");
        } finally {
            setLoadingPdf(false);
        }
    };

    const closePdfPreview = () => {
        if (pdfPreviewUrl) {
            window.URL.revokeObjectURL(pdfPreviewUrl);
        }
        setPdfPreviewUrl(null);
    };

    const renderStatusBadge = (status: SalesOrderStatus) => {
        const styles: any = {
            SENT: "bg-amber-100 text-amber-800 border-amber-200",
            DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
            ACCEPTED: "bg-blue-100 text-blue-800 border-blue-200",
            SOLD: "bg-emerald-100 text-emerald-800 border-emerald-200",
            REJECTED: "bg-red-100 text-red-800 border-red-200",
            CHANGE_REQUESTED: "bg-orange-100 text-orange-800 border-orange-200",
            CLIENT_REJECTED: "bg-gray-100 text-gray-600 border-gray-200"
        };
        const labels: any = {
            SENT: "EN REVISIÓN", DRAFT: "BORRADOR", ACCEPTED: "AUTORIZADA", SOLD: "VENDIDA",
            REJECTED: "RECHAZADA", CHANGE_REQUESTED: "CORREGIR", CLIENT_REJECTED: "PERDIDA"
        };
        return (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[status] || "bg-gray-100"}`}>
                {labels[status] || status}
            </span>
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 pb-24 animate-in fade-in duration-300">
            
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-slate-800">Listado General de Cotizaciones y Ventas</h1>
                    <p className="text-slate-500">Gestión de cotizaciones y órdenes.</p>
                </div>
                <div className="flex gap-3">
                    <ExportButton data={myOrders} fileName="Reporte_Ventas" label="Excel" mapping={(o:any)=>o}/>
                    <Button onClick={() => navigate('/sales/new')} className="bg-emerald-600 hover:bg-emerald-700 shadow-md">
                        <Plus size={18} className="mr-2"/> Nueva Cotización
                    </Button>
                </div>
            </div>

            {/* --- KPIs --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* 1. BORRADORES */}
                <Card onClick={() => { handleResetView(); setActiveTab('drafts'); }} className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-slate-400 transform hover:-translate-y-1 bg-white shadow-sm h-full ${activeTab === 'drafts' && currentView === 'GENERAL' ? 'ring-2 ring-slate-300 bg-slate-50' : ''}`}>
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Borradores</p><Archive size={14} className="text-slate-400" /></div>
                    <div className="mt-1 flex justify-between items-end"><div><h3 className="text-xl font-bold text-slate-700">En Edición</h3><p className="text-[10px] text-slate-400 mt-1">Y correcciones</p></div><div className="text-2xl font-black text-slate-300">{kpiData.draftsCount}</div></div>
                </Card>
                {/* 2. POR AUTORIZAR */}
                <Card onClick={() => { handleResetView(); setSpecificStatusFilter(SalesOrderStatus.SENT); }} className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 bg-white shadow-sm h-full ${specificStatusFilter === SalesOrderStatus.SENT && currentView === 'GENERAL' ? 'ring-2 ring-amber-200 bg-amber-50' : ''}`}>
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Autorizar</p><Clock size={14} className="text-amber-500" /></div>
                    <div className="mt-1 flex justify-between items-end"><div><h3 className="text-xl font-bold text-slate-700">En Revisión</h3>{kpiData.pendingAuthCount > 0 ? <p className="text-[10px] text-amber-600 font-bold mt-1 animate-pulse">¡Pendientes!</p> : <p className="text-[10px] text-slate-400 mt-1">Al día</p>}</div><div className="text-2xl font-black text-amber-600/30">{kpiData.pendingAuthCount}</div></div>
                </Card>
                {/* 3. TRACKING */}
                <Card onClick={() => setCurrentView('TRACKING')} className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-blue-500 transform hover:-translate-y-1 bg-white shadow-sm h-full ${currentView === 'TRACKING' ? 'ring-2 ring-blue-200 bg-blue-50' : ''}`}>
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Operaciones</p><Truck size={14} className="text-blue-500" /></div>
                    <div className="mt-1"><h3 className="text-xl font-bold text-slate-700">Seguimiento</h3><div className="flex justify-between items-end mt-1"><p className="text-[10px] text-slate-400">Estatus Producción</p><div className="text-xl font-black text-blue-600/30">{kpiData.trackingCount}</div></div></div>
                </Card>
                {/* 4. COBRANZA */}
                <Card onClick={() => setCurrentView('RECEIVABLES')} className={`p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-red-500 transform hover:-translate-y-1 bg-white shadow-sm h-full ${currentView === 'RECEIVABLES' ? 'ring-2 ring-red-200 bg-red-50' : ''}`}>
                    <div className="flex justify-between items-start"><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cobranza</p><Wallet size={14} className="text-red-500" /></div>
                    <div className="mt-1"><h3 className="text-xl font-bold text-slate-700">Por Cobrar</h3><div className="flex justify-between items-end mt-1"><p className="text-[10px] text-slate-400 shrink-0 mr-2">{kpiData.receivablesCount} Facturas</p><div className="text-lg font-black text-red-600 text-right">{formatCurrency(kpiData.receivableAmount)}</div></div></div>
                </Card>
            </div>

            {/* --- TABLA PRINCIPAL --- */}
            <div className="space-y-4">
                
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                    {currentView === 'GENERAL' && <LayoutDashboard className="text-slate-400"/>}
                    {currentView === 'TRACKING' && <Truck className="text-blue-500"/>}
                    {currentView === 'RECEIVABLES' && <Wallet className="text-red-500"/>}
                    
                    <h2 className="text-lg font-bold text-slate-700">
                        {currentView === 'GENERAL' && (
                            specificStatusFilter === SalesOrderStatus.SENT 
                                ? 'Cotizaciones Pendientes de Autorización' 
                                : activeTab === 'search' ? 'Resultados de Búsqueda' : 'Listado General de Cotizaciones y Ventas'
                        )}
                        {currentView === 'TRACKING' && 'Tablero de Seguimiento (Producción e Instalación)'}
                        {currentView === 'RECEIVABLES' && 'Cartera de Cobranza'}
                    </h2>
                    
                    {currentView !== 'GENERAL' && (
                        <button onClick={handleResetView} className="text-xs text-indigo-600 hover:underline ml-auto">Volver al listado</button>
                    )}
                </div>

                {/* --- BARRA DE PESTAÑAS Y BÚSQUEDA --- */}
                {currentView === 'GENERAL' && !specificStatusFilter && (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <button onClick={() => setActiveTab('active')} className={`px-4 py-1 text-xs font-bold rounded-full border transition-all ${activeTab === 'active' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Ventas en Proceso</button>
                            <button onClick={() => setActiveTab('drafts')} className={`px-4 py-1 text-xs font-bold rounded-full border transition-all ${activeTab === 'drafts' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Borradores y Ajustes</button>
                            <button onClick={() => setActiveTab('history')} className={`px-4 py-1 text-xs font-bold rounded-full border transition-all ${activeTab === 'history' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Historial</button>
                            <button onClick={() => setActiveTab('search')} className={`ml-auto px-4 py-1 text-xs font-bold rounded-full border transition-all flex items-center gap-2 ${activeTab === 'search' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400'}`}><Search size={14}/> Búsqueda</button>
                        </div>
                        {activeTab === 'search' && (
                            <div className="relative animate-in fade-in slide-in-from-top-1">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por ID, nombre de proyecto, cliente o folio..." className="pl-10 pr-4 py-2 w-full border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm text-sm" autoFocus/>
                            </div>
                        )}
                    </div>
                )}

                <Card className="overflow-hidden bg-white border border-slate-200 shadow-sm min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3">Folio / Proyecto</th>
                                    <th className="px-6 py-3">Cliente</th>
                                    {currentView === 'TRACKING' ? (<><th className="px-6 py-3 text-center">Estatus Producción</th><th className="px-6 py-3 text-center">Entrega Est.</th></>) : currentView === 'RECEIVABLES' ? (<><th className="px-6 py-3 text-right">Total</th><th className="px-6 py-3 text-right">Pagado</th><th className="px-6 py-3 text-right">Saldo</th></>) : (<><th className="px-6 py-3 text-center">Estatus</th><th className="px-6 py-3 text-right">Total</th><th className="px-6 py-3 text-center">Acciones</th></>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredOrders.length === 0 ? (
                                    <tr><td colSpan={6} className="p-12 text-center text-slate-400 italic">{activeTab === 'search' && searchQuery ? "No se encontraron coincidencias." : "No hay registros en esta vista."}</td></tr>
                                ) : filteredOrders.map((order) => (
                                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4"><div className="font-bold text-slate-800">{order.project_name}</div><div className="text-xs text-slate-400 font-mono">#{order.id}</div></td>
                                        <td className="px-6 py-4 text-slate-600 text-sm">{getClientName(order.client_id)}</td>
                                        {currentView === 'TRACKING' ? (
                                            <>
                                                <td className="px-6 py-4 text-center"><span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold uppercase">EN PRODUCCIÓN</span></td>
                                                <td className="px-6 py-4 text-center text-slate-500">{new Date(Date.now() + 86400000 * 5).toLocaleDateString('es-MX')}</td>
                                            </>
                                        ) : currentView === 'RECEIVABLES' ? (
                                            <>
                                                <td className="px-6 py-4 text-right font-mono text-slate-500">{formatCurrency(order.total_price || 0)}</td>
                                                <td className="px-6 py-4 text-right font-mono text-emerald-600">{formatCurrency((order.total_price || 0) * 0.6)}</td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-red-600">{formatCurrency((order.total_price || 0) * 0.4)}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-6 py-4 text-center">{renderStatusBadge(order.status as SalesOrderStatus)}</td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">{formatCurrency(order.total_price || 0)}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        {(order.status === SalesOrderStatus.DRAFT || order.status === SalesOrderStatus.CHANGE_REQUESTED || order.status === SalesOrderStatus.REJECTED) && (
                                                            <>
                                                                <button onClick={() => handleAction(() => salesService.requestAuth(order.id), "Enviar a revisión?")} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Enviar"><Send size={16}/></button>
                                                                <button onClick={() => navigate(`/sales/edit/${order.id}`)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="Editar"><Pencil size={16}/></button>
                                                                <button onClick={() => handleAction(() => salesService.deleteOrder(order.id), "Eliminar?")} className="p-1.5 text-slate-400 hover:text-red-500 rounded" title="Borrar"><Trash2 size={16}/></button>
                                                            </>
                                                        )}
                                                        {order.status === SalesOrderStatus.SENT && (
                                                            <div className="flex items-center gap-1">
                                                                <button onClick={() => setSelectedOrderId(order.id)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Ver Detalles"><Eye size={16}/></button>
                                                                <button onClick={() => handleUndoSubmission(order.id)} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded border border-transparent hover:border-orange-200" title="Cancelar Envío (Regresar a Borrador)"><Undo2 size={16}/></button>
                                                            </div>
                                                        )}
                                                        {order.status === SalesOrderStatus.ACCEPTED && (
                                                            <>
                                                                <button onClick={() => handlePreviewPDF(order.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="Ver PDF"><Eye size={16}/></button>
                                                                <button onClick={() => salesService.downloadPDF(order.id)} className="p-1.5 text-slate-500 hover:text-blue-600 rounded" title="Descargar PDF"><Download size={16}/></button>
                                                                <button onClick={() => handleAction(() => salesService.markAsSold(order.id), "Confirmar Venta?")} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded font-bold border border-emerald-200" title="Vender"><DollarSign size={14}/> VENDER</button>
                                                            </>
                                                        )}
                                                        {(order.status === SalesOrderStatus.SOLD) && (
                                                            <>
                                                                <button onClick={() => handlePreviewPDF(order.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="Ver PDF"><Eye size={16}/></button>
                                                                <button onClick={() => salesService.downloadPDF(order.id)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded" title="Descargar PDF"><Download size={16}/></button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* --- MODAL PARA PREVISUALIZAR PDF --- */}
            {pdfPreviewUrl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col relative overflow-hidden">
                        
                        {/* Header del Modal */}
                        <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <FileText className="text-red-500" size={20}/> Vista Previa del Documento
                            </h3>
                            <button onClick={closePdfPreview} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X size={24} className="text-slate-500"/>
                            </button>
                        </div>

                        {/* Contenido (Iframe) */}
                        <div className="flex-1 bg-slate-100 relative">
                            {loadingPdf && (
                                <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                                </div>
                            )}
                            <iframe 
                                src={pdfPreviewUrl} 
                                className="w-full h-full border-none" 
                                title="Vista Previa PDF"
                            />
                        </div>

                        {/* Footer (Opcional) */}
                        <div className="p-3 bg-white border-t border-slate-200 flex justify-end gap-2">
                             <Button variant="secondary" onClick={closePdfPreview}>Cerrar</Button>
                        </div>
                    </div>
                </div>
            )}

            <SalesOrderDetailModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
        </div>
    );
};

export default SalesDashboardPage;