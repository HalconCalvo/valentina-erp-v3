import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Target, FileText, Coins, Users, Search,
    ArrowLeft, Plus, TrendingUp, Wallet, Clock, 
    AlertTriangle, CheckCircle, ShieldAlert, BadgeDollarSign,
    FileSignature, FileSearch, CalendarClock, Lock, Unlock,
    ArrowLeftCircle, XCircle, Send, FileDown, RefreshCcw, Archive, Trash2, Eye,
    ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

import { salesService } from '../../../api/sales-service';
import { SalesOrder } from '../../../types/sales';
import client from '../../../api/axios-client';

// IMPORTACIONES DE LOS DOS MODALES
import { SalesOrderDetailModal } from '../components/SalesOrderDetailModal';
import { FinancialReviewModal } from '../../management/components/FinancialReviewModal';
import BaptismModal from '../components/BaptismModal';

type SalesSection = 'GOALS' | 'QUOTES' | 'COLLECTIONS' | 'MONITOR' | null;
type GoalDetailView = 'COMMISSIONS' | 'CLOSED' | 'STREET' | 'EFFECTIVENESS' | null;
type QuoteDetailView = 'DRAFTS' | 'REVIEW' | 'AUTHORIZED' | 'EXPIRING' | 'HISTORY' | null;
type CollectionDetailView = 'RETAINED' | 'PAYABLE' | 'ADVANCES' | null;

const SalesDashboardPage: React.FC = () => {
    const navigate = useNavigate();

    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // ESTADOS PARA ORDENAMIENTO DE COLUMNAS (AÑADIDOS DATE Y FOLIO)
    const [quoteSortConfig, setQuoteSortConfig] = useState<{ key: 'DATE' | 'FOLIO' | 'CLIENT' | 'SELLER' | 'STATUS' | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'desc' });

    const [viewingOrderIdForFormat, setViewingOrderIdForFormat] = useState<number | null>(null);
    const [viewingOrderIdForAudit, setViewingOrderIdForAudit] = useState<number | null>(null);
    const [baptismOrderId, setBaptismOrderId] = useState<number | null>(null);

    const [activeSection, setActiveSection] = useState<SalesSection>(
        (sessionStorage.getItem('sales_activeSection') as SalesSection) || null
    );
    const [activeGoalView, setActiveGoalView] = useState<GoalDetailView>(
        (sessionStorage.getItem('sales_activeGoalView') as GoalDetailView) || null
    ); 
    const [activeQuoteView, setActiveQuoteView] = useState<QuoteDetailView>(
        (sessionStorage.getItem('sales_activeQuoteView') as QuoteDetailView) || null
    ); 
    const [activeCollectionView, setActiveCollectionView] = useState<CollectionDetailView>(
        (sessionStorage.getItem('sales_activeCollectionView') as CollectionDetailView) || null
    );

    useEffect(() => {
        if (activeCollectionView) sessionStorage.setItem('sales_activeCollectionView', activeCollectionView);
        else sessionStorage.removeItem('sales_activeCollectionView');
    }, [activeCollectionView]);

    useEffect(() => {
        if (activeSection) sessionStorage.setItem('sales_activeSection', activeSection);
        else sessionStorage.removeItem('sales_activeSection');
    }, [activeSection]);

    useEffect(() => {
        if (activeGoalView) sessionStorage.setItem('sales_activeGoalView', activeGoalView);
        else sessionStorage.removeItem('sales_activeGoalView');
    }, [activeGoalView]);

    useEffect(() => {
        if (activeQuoteView) sessionStorage.setItem('sales_activeQuoteView', activeQuoteView);
        else sessionStorage.removeItem('sales_activeQuoteView');
    }, [activeQuoteView]);

    const [stats, setStats] = useState({
        commGenerated: 0, activeCommCount: 0, wonCount: 0, closedSales: 0, moneyOnStreet: 0, streetCount: 0, battingRate: 0, totalResolved: 0,
        drafts: 0, draftsVal: 0, inReview: 0, reviewVal: 0, authorized: 0, authVal: 0, expiring: 0, expiringVal: 0,
        retainedComm: 0, retainedCount: 0, payableComm: 0, payableCount: 0, pendingAdvance: 0, advanceVal: 0, pendingInvoices: 0, invoicesVal: 0,
        activeProjectsCount: 0, historyCount: 0
    });

    useEffect(() => {
        loadData(); 
        const interval = setInterval(() => { loadData(true); }, 15000);
        return () => clearInterval(interval); 
    }, []);

    const loadData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const data = await salesService.getOrders();
            const uniqueOrders = data ? Array.from(new Map(data.map((o: SalesOrder) => [o.id, o])).values()) : [];
            setOrders(uniqueOrders as SalesOrder[]);
            calculateMetrics(uniqueOrders as SalesOrder[]);
        } catch (error) {
            console.error("Error cargando cotizaciones:", error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const handleRequestAuth = async (orderId: number) => {
        if (!window.confirm("¿Estás seguro de enviar esta cotización a Dirección para su revisión y autorización?")) return;
        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
            const response = await fetch(`${baseUrl}/sales/orders/${orderId}/request-auth`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Error al solicitar autorización');
            await loadData();
        } catch (error) {
            alert("Hubo un problema al enviar la cotización a revisión.");
            setIsLoading(false);
        }
    };

    const handleMarkAdvance = async (orderId: number) => {
        if (!window.confirm("¿El cliente ha aceptado la cotización? Se ejecutará el Semáforo Financiero para validar la vigencia de los costos antes de proceder.")) return;
        setIsLoading(true);
        try {
            await client.post(`/sales/orders/${orderId}/mark_waiting_advance`);
            alert("🟢 SEMÁFORO VERDE: Los costos son estables. La orden ha pasado a 'Esperando Anticipo'.");
            await loadData();
        } catch (error: any) {
            if (error.response?.status === 409) {
                alert(`🔴 ALERTA FINANCIERA\n\n${error.response.data.detail}`);
                await loadData(); 
            } else {
                alert("Error al procesar: " + (error.response?.data?.detail || error.message));
                setIsLoading(false);
            }
        }
    };

    const handleViewPDF = async (orderId: number) => {
        const pdfWindow = window.open('', '_blank');
        if (pdfWindow) {
            pdfWindow.document.write('<div style="font-family: sans-serif; padding: 40px; text-align: center; color: #666;"><h3>Generando documento PDF...</h3><p>Por favor espere un momento.</p></div>');
        } else {
            alert("⚠️ Tu navegador bloqueó la ventana emergente. Por favor permite las ventanas emergentes para este sitio en la barra de direcciones.");
            return;
        }
        setIsLoading(true);
        try {
            const response = await client.get(`/sales/orders/${orderId}/pdf`, { responseType: 'blob' });
            const fileURL = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            pdfWindow.location.href = fileURL;
        } catch (error: any) {
            pdfWindow.close(); 
            alert("Error al cargar el PDF. Revisa tu conexión o contacta a soporte.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestChanges = async (orderId: number) => {
        if (!window.confirm("¿El cliente solicitó ajustes? La cotización regresará al estatus de Borrador (Desbloqueada) para que la edites.")) return;
        setIsLoading(true);
        try {
            await client.post(`/sales/orders/${orderId}/request_changes`);
            alert("Cotización desbloqueada. Búscala en tus Borradores para editarla.");
            await loadData();
        } catch (error: any) {
            alert("Error al procesar: " + (error.response?.data?.detail || error.message));
            setIsLoading(false);
        }
    };

    const handleMarkLost = async (orderId: number) => {
        if (!window.confirm("¿Estás seguro de marcar esta cotización como PERDIDA? Esta acción cerrará el proyecto.")) return;
        setIsLoading(true);
        try {
            await client.post(`/sales/orders/${orderId}/mark_lost`);
            await loadData();
        } catch (error: any) {
            alert("Error al procesar: " + (error.response?.data?.detail || error.message));
            setIsLoading(false);
        }
    };

    const handleDeleteDraft = async (orderId: number) => {
        if (!window.confirm("¿Estás seguro de eliminar este borrador de forma permanente? Esta acción no se puede deshacer.")) return;
        setIsLoading(true);
        try {
            await client.delete(`/sales/orders/${orderId}`);
            await loadData();
        } catch (error: any) {
            alert("Error al eliminar: " + (error.response?.data?.detail || error.message));
            setIsLoading(false);
        }
    };

    const calculateMetrics = (allOrders: SalesOrder[]) => {
        let s = {
            commGenerated: 0, activeCommCount: 0, wonCount: 0, closedSales: 0, moneyOnStreet: 0, streetCount: 0, battingRate: 0, totalResolved: 0,
            drafts: 0, draftsVal: 0, inReview: 0, reviewVal: 0, authorized: 0, authVal: 0, expiring: 0, expiringVal: 0,
            retainedComm: 0, retainedCount: 0, payableComm: 0, payableCount: 0, pendingAdvance: 0, advanceVal: 0, pendingInvoices: 0, invoicesVal: 0, finalInvoices: 0, finalInvoicesVal: 0,
            activeProjectsCount: 0,
            historyCount: allOrders.length 
        };

        let lostCount = 0;
        const fifteenDaysFromNow = new Date();
        fifteenDaysFromNow.setDate(new Date().getDate() + 15);

        allOrders.forEach(o => {
            const st = o.status;
            const price = Number(o.total_price) || 0;
            const comm = Number(o.commission_amount) || 0;
            
            if (['SOLD', 'INSTALLED', 'FINISHED'].includes(st)) {
                s.closedSales += price; 
                s.wonCount++; 
            }
            
            if (['SOLD', 'INSTALLED'].includes(st)) {
                s.commGenerated += comm; 
                s.activeCommCount++; 
                s.payableComm += comm; 
                s.payableCount++;
            }

            if (st === 'CLIENT_REJECTED') lostCount++;
            if (['ACCEPTED', 'WAITING_ADVANCE', 'SENT'].includes(st)) { s.moneyOnStreet += comm; s.streetCount++; }
            if (['DRAFT', 'CHANGE_REQUESTED', 'REJECTED'].includes(st)) { s.drafts++; s.draftsVal += price; }
            if (st === 'SENT') { s.inReview++; s.reviewVal += price; }
            if (st === 'ACCEPTED') { s.authorized++; s.authVal += price; }

            if (o.valid_until && ['DRAFT', 'ACCEPTED', 'SENT'].includes(st)) {
                const validDate = new Date(o.valid_until);
                if (validDate <= fifteenDaysFromNow) { s.expiring++; s.expiringVal += price; }
            }

            if (['ACCEPTED', 'WAITING_ADVANCE'].includes(st)) { s.retainedComm += comm; s.retainedCount++; }
            
            if (['SOLD', 'IN_PRODUCTION', 'INSTALLED'].includes(st)) {
                s.activeProjectsCount++;
            }

            if (st === 'WAITING_ADVANCE') { 
                const advancePercentage = (o.advance_percent || 60) / 100;
                s.pendingAdvance++; 
                s.advanceVal += (price * advancePercentage); 
            }

            if (o.payments && Array.isArray(o.payments)) {
                o.payments.forEach((p: any) => {
                    if (p.status === 'PENDING') {
                        s.pendingInvoices++;
                        s.invoicesVal += Number(p.amount) || 0;
                    }
                });
            }
        });

        s.totalResolved = s.wonCount + lostCount;
        s.battingRate = s.totalResolved > 0 ? Math.round((s.wonCount / s.totalResolved) * 100) : 0;
        setStats(s);
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const getCountSize = (count: number) => {
        const len = count.toString().length;
        if (len > 3) return 'text-xl';
        if (len === 3) return 'text-2xl';
        return 'text-3xl';
    };

    const getDocumentPrefix = (status: string) => {
        return ['DRAFT', 'SENT', 'REJECTED', 'CHANGE_REQUESTED', 'CLIENT_REJECTED'].includes(status) ? 'COT' : 'OV';
    };

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            'DRAFT': 'Borrador',
            'SENT': 'Esperando Autorización',
            'ACCEPTED': 'Autorizada',
            'REJECTED': 'Rechazada (Dirección)',
            'CHANGE_REQUESTED': 'Cambios Solicitados',
            'WAITING_ADVANCE': 'Esperando Anticipo',
            'SOLD': 'Vendida / En Producción',
            'CLIENT_REJECTED': 'Perdida',
            'INSTALLED': 'Instalada',
            'FINISHED': 'Finalizada Cerrada'
        };
        return labels[status] || status;
    };

    const getClientName = (order: SalesOrder) => {
        const o = order as any; 
        return o.client_name || o.client?.full_name || o.client?.name || o.customer?.name || 'Cliente por Defecto';
    };

    const getSellerName = (order: SalesOrder) => {
        const oAny = order as any;
        return oAny.user?.full_name || oAny.user?.username || (order.user_id ? `Asesor #${order.user_id}` : 'N/A');
    };

    // ---> LÓGICA DE ORDENAMIENTO EXTENDIDA <---
    const handleQuoteSort = (key: 'DATE' | 'FOLIO' | 'CLIENT' | 'SELLER' | 'STATUS') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (quoteSortConfig.key === key && quoteSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setQuoteSortConfig({ key, direction });
    };

    const renderSortIcon = (key: string) => {
        if (quoteSortConfig.key !== key) return <ArrowUpDown size={14} className="inline ml-1 opacity-30" />;
        return quoteSortConfig.direction === 'asc' 
            ? <ArrowUp size={14} className="inline ml-1 text-indigo-600" /> 
            : <ArrowDown size={14} className="inline ml-1 text-indigo-600" />;
    };

    const openMainSection = (section: SalesSection) => { 
        setActiveSection(section); 
        setActiveGoalView(null); 
        setActiveQuoteView(null); 
        setActiveCollectionView(null);
        setSearchQuery(''); 
        setQuoteSortConfig({ key: 'DATE', direction: 'desc' }); // Orden por defecto más reciente
    };

    const handleBack = () => {
        setSearchQuery(''); 
        setQuoteSortConfig({ key: null, direction: 'asc' });
        if (activeGoalView !== null) setActiveGoalView(null); 
        else if (activeQuoteView !== null) setActiveQuoteView(null);
        else if (activeCollectionView !== null) setActiveCollectionView(null);
        else { 
            setActiveSection(null); setActiveGoalView(null); 
            setActiveQuoteView(null); setActiveCollectionView(null);
        }
    };

    const getSectionTitle = () => {
        if (activeGoalView === 'COMMISSIONS') return 'Detalle: Comisiones Generadas';
        if (activeGoalView === 'CLOSED') return 'Detalle: Venta Cerrada (Histórico)';
        if (activeGoalView === 'STREET') return 'Detalle: Comisiones por Confirmar';
        if (activeGoalView === 'EFFECTIVENESS') return 'Detalle: Efectividad (Ganadas vs Perdidas)';
        if (activeQuoteView === 'DRAFTS') return 'Archivo: Borradores y Ajustes';
        if (activeQuoteView === 'REVIEW') return 'Archivo: En Revisión (Freno)';
        if (activeQuoteView === 'AUTHORIZED') return 'Archivo: Cotizaciones Autorizadas';
        if (activeQuoteView === 'EXPIRING') return 'Radar de Vigencia (Auditoría)';
        if (activeQuoteView === 'HISTORY') return 'Archivo: Histórico General';
        if (activeCollectionView === 'RETAINED') return 'Gestión: Comisiones Retenidas';
        if (activeCollectionView === 'PAYABLE') return 'Gestión: Comisiones Pagables';
        if (activeCollectionView === 'ADVANCES') return 'Gestión: Anticipos Pendientes';
        switch(activeSection) {
            case 'GOALS': return 'Mi Meta y Mis Ingresos';
            case 'QUOTES': return 'Mis Cotizaciones (Archivo)';
            case 'COLLECTIONS': return 'Cobranza y Comisiones';
            case 'MONITOR': return 'Monitor Operativo — Órdenes de Venta Activas';
            default: return 'La Trinchera Comercial';
        }
    };

    const renderGoalDetailTable = () => {
        let filteredOrders: SalesOrder[] = [];
        let emptyMessage = "No hay datos para mostrar.";

        if (activeGoalView === 'COMMISSIONS') {
            filteredOrders = orders.filter(o => ['SOLD', 'INSTALLED'].includes(o.status));
            emptyMessage = "No tienes comisiones activas en proceso de entrega/cobro.";
        } 
        else if (activeGoalView === 'CLOSED') {
            filteredOrders = orders.filter(o => ['SOLD', 'INSTALLED', 'FINISHED'].includes(o.status));
            emptyMessage = "Aún no hay ventas cerradas en tu histórico.";
        } 
        else if (activeGoalView === 'STREET') {
            filteredOrders = orders.filter(o => ['ACCEPTED', 'WAITING_ADVANCE', 'SENT'].includes(o.status));
            emptyMessage = "No tienes cotizaciones enviadas o esperando respuesta del cliente.";
        } 
        else if (activeGoalView === 'EFFECTIVENESS') {
            filteredOrders = orders.filter(o => ['SOLD', 'INSTALLED', 'FINISHED', 'CLIENT_REJECTED'].includes(o.status));
            emptyMessage = "Aún no tienes proyectos ganados o perdidos para medir efectividad.";
        }

        if (filteredOrders.length === 0) return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">{emptyMessage}</div>;

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6 animate-in slide-in-from-right-4 duration-300">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-bold">Cliente</th>
                            <th className="px-6 py-4 font-bold">Folio / Proyecto</th>
                            <th className="px-6 py-4 font-bold">Estatus</th>
                            <th className="px-6 py-4 font-bold text-right">Monto de Venta</th>
                            {['COMMISSIONS', 'CLOSED', 'STREET'].includes(activeGoalView || '') && (
                                <th className="px-6 py-4 font-bold text-right text-emerald-600">Tu Comisión</th>
                            )}
                            {activeGoalView === 'EFFECTIVENESS' && <th className="px-6 py-4 font-bold text-center">Resultado</th>}
                            <th className="px-6 py-4 font-bold text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map(order => (
                            <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-600">{getClientName(order)}</td>
                                <td className="px-6 py-4 font-bold text-slate-800">{getDocumentPrefix(order.status)}-{order.id?.toString().padStart(4,'0')} - {order.project_name}</td>
                                <td className="px-6 py-4"><Badge variant="outline" className="bg-white">{getStatusLabel(order.status)}</Badge></td>
                                <td className="px-6 py-4 text-right font-bold text-slate-700">{formatCurrency(order.total_price || 0)}</td>
                                
                                {['COMMISSIONS', 'CLOSED', 'STREET'].includes(activeGoalView || '') && (
                                    <td className="px-6 py-4 text-right font-black text-emerald-600">
                                        {formatCurrency(order.commission_amount || 0)}
                                    </td>
                                )}
                                
                                {activeGoalView === 'EFFECTIVENESS' && (
                                    <td className="px-6 py-4 text-center">
                                        {['SOLD', 'INSTALLED', 'FINISHED'].includes(order.status) ? (
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle size={12} className="mr-1"/> Ganada</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle size={12} className="mr-1"/> Perdida</Badge>
                                        )}
                                    </td>
                                )}
                                <td className="px-6 py-4 flex justify-center items-center gap-2">
                                    <Button variant="outline" size="sm" className="text-xs px-3" onClick={() => setViewingOrderIdForFormat(order.id!)}>Ver Formato</Button>
                                    <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 px-2" onClick={() => handleViewPDF(order.id!)} title="Descargar PDF">
                                        <FileDown size={14} />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderCollectionDetailTable = () => {
        let filteredOrders: SalesOrder[] = [];
        let emptyMessage = "No hay datos para mostrar.";

        if (activeCollectionView === 'RETAINED') {
            filteredOrders = orders.filter(o => ['ACCEPTED', 'WAITING_ADVANCE'].includes(o.status));
            emptyMessage = "No tienes comisiones retenidas. Todo está cobrado o en borrador.";
        } else if (activeCollectionView === 'PAYABLE') {
            filteredOrders = orders.filter(o => ['SOLD', 'INSTALLED', 'FINISHED'].includes(o.status));
            emptyMessage = "No tienes comisiones liberadas para pago en este momento.";
        } else if (activeCollectionView === 'ADVANCES') {
            filteredOrders = orders.filter(o => o.status === 'WAITING_ADVANCE');
            emptyMessage = "Excelente, no hay anticipos pendientes por cobrar.";
        } 

        if (filteredOrders.length === 0) return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">{emptyMessage}</div>;

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6 animate-in slide-in-from-right-4 duration-300">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-bold">Cliente</th>
                            <th className="px-6 py-4 font-bold">Folio / Proyecto</th>
                            <th className="px-6 py-4 font-bold">Estatus</th>
                            <th className="px-6 py-4 font-bold text-right">Monto Total</th>
                            <th className="px-6 py-4 font-bold text-right text-indigo-600">
                                {['RETAINED', 'PAYABLE'].includes(activeCollectionView || '') ? 'Tu Comisión' : 'Anticipo Requerido'}
                            </th>
                            <th className="px-6 py-4 font-bold text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map(order => {
                            const total = Number(order.total_price) || 0;
                            const comm = Number(order.commission_amount) || 0;
                            const advPerc = (order.advance_percent || 60) / 100;
                            
                            let highlightValue = 0;
                            if (activeCollectionView === 'RETAINED' || activeCollectionView === 'PAYABLE') highlightValue = comm;
                            if (activeCollectionView === 'ADVANCES') highlightValue = total * advPerc;

                            return (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-600">{getClientName(order)}</td>
                                    <td className="px-6 py-4 font-bold text-slate-800">{getDocumentPrefix(order.status)}-{order.id?.toString().padStart(4,'0')} - {order.project_name}</td>
                                    <td className="px-6 py-4"><Badge variant="outline" className="bg-white">{getStatusLabel(order.status)}</Badge></td>
                                    <td className="px-6 py-4 text-right text-slate-500">{formatCurrency(total)}</td>
                                    <td className="px-6 py-4 text-right font-black text-indigo-600">{formatCurrency(highlightValue)}</td>
                                    <td className="px-6 py-4 flex justify-center items-center gap-2">
                                        <Button variant="outline" size="sm" className="text-xs px-3" onClick={() => setViewingOrderIdForFormat(order.id!)}>Ver Formato</Button>
                                        <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 px-2" onClick={() => handleViewPDF(order.id!)} title="Descargar PDF">
                                            <FileDown size={14} />
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };
    
    const renderQuoteDetailTable = () => {
        let filteredOrders: SalesOrder[] = [];
        let emptyMessage = "No hay datos para mostrar.";

        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            filteredOrders = orders.filter(o => {
                const oAny = o as any; 
                const bolsaDeTexto = `
                    ${o.id || ''} 
                    ${o.project_name || ''} 
                    ${oAny.client_name || ''} 
                    ${oAny.client?.full_name || ''} 
                    ${oAny.client?.name || ''}
                    ${oAny.customer?.name || ''}
                `.toLowerCase();
                return bolsaDeTexto.includes(q);
            });
            emptyMessage = `No se encontraron resultados para "${searchQuery}".`;
        }
        else if (activeQuoteView === 'DRAFTS') {
            filteredOrders = orders.filter(o => ['DRAFT', 'CHANGE_REQUESTED', 'REJECTED'].includes(o.status));
            emptyMessage = "Bandeja limpia. No tienes borradores ni rechazos de Dirección pendientes.";
        } else if (activeQuoteView === 'REVIEW') {
            filteredOrders = orders.filter(o => o.status === 'SENT');
            emptyMessage = "No tienes cotizaciones esperando autorización de Dirección.";
        } else if (activeQuoteView === 'AUTHORIZED') {
            filteredOrders = orders.filter(o => o.status === 'ACCEPTED');
            emptyMessage = "No tienes cotizaciones autorizadas pendientes de enviar al cliente.";
        } else if (activeQuoteView === 'EXPIRING') {
            const fifteenDaysFromNow = new Date(); fifteenDaysFromNow.setDate(new Date().getDate() + 15);
            filteredOrders = orders.filter(o => {
                if (!o.valid_until || !['DRAFT', 'ACCEPTED', 'SENT'].includes(o.status)) return false;
                return new Date(o.valid_until) <= fifteenDaysFromNow;
            });
            emptyMessage = "¡Excelente! Tu cartera está sana. Ninguna cotización vence en los próximos 15 días.";
        } else if (activeQuoteView === 'HISTORY') {
            filteredOrders = [...orders]; 
            emptyMessage = "Tu archivo histórico está vacío.";
        }

        // MOTOR DE ORDENAMIENTO APLICADO (FECHA, FOLIO, CLIENTE, VENDEDOR, ESTATUS)
        if (quoteSortConfig.key) {
            filteredOrders.sort((a, b) => {
                if (quoteSortConfig.key === 'DATE') {
                    const dateA = new Date((a as any).created_at || 0).getTime();
                    const dateB = new Date((b as any).created_at || 0).getTime();
                    return quoteSortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                }
                
                if (quoteSortConfig.key === 'FOLIO') {
                    const idA = a.id || 0;
                    const idB = b.id || 0;
                    return quoteSortConfig.direction === 'asc' ? idA - idB : idB - idA;
                }

                let aValue = '';
                let bValue = '';
                
                if (quoteSortConfig.key === 'CLIENT') {
                    aValue = getClientName(a).toLowerCase();
                    bValue = getClientName(b).toLowerCase();
                } else if (quoteSortConfig.key === 'SELLER') {
                    aValue = getSellerName(a).toLowerCase();
                    bValue = getSellerName(b).toLowerCase();
                } else if (quoteSortConfig.key === 'STATUS') {
                    aValue = getStatusLabel(a.status).toLowerCase();
                    bValue = getStatusLabel(b.status).toLowerCase();
                }

                if (aValue < bValue) return quoteSortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return quoteSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        if (filteredOrders.length === 0) return <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 mt-4 shadow-sm">{emptyMessage}</div>;

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6 animate-in slide-in-from-right-4 duration-300">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleQuoteSort('DATE')}>
                                Fecha {renderSortIcon('DATE')}
                            </th>
                            <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleQuoteSort('FOLIO')}>
                                Folio / Proyecto {renderSortIcon('FOLIO')}
                            </th>
                            <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleQuoteSort('CLIENT')}>
                                Cliente {renderSortIcon('CLIENT')}
                            </th>
                            {activeQuoteView === 'HISTORY' && (
                                <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleQuoteSort('SELLER')}>
                                    Vendedor {renderSortIcon('SELLER')}
                                </th>
                            )}
                            <th className="px-6 py-4 font-bold cursor-pointer hover:bg-slate-200 transition-colors select-none" onClick={() => handleQuoteSort('STATUS')}>
                                Estatus {renderSortIcon('STATUS')}
                            </th>
                            <th className="px-6 py-4 font-bold text-right">Monto de Venta</th>
                            <th className="px-6 py-4 font-bold text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map(order => {
                            return (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className="text-slate-600 font-medium whitespace-nowrap">
                                            {(order as any).created_at ? new Date((order as any).created_at).toLocaleDateString('es-MX') : 'S/F'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-800 whitespace-nowrap">{getDocumentPrefix(order.status)}-{order.id?.toString().padStart(4,'0')}</p>
                                        <p className="text-xs text-slate-500 font-medium">{order.project_name}</p>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-600">{getClientName(order)}</td>
                                    
                                    {activeQuoteView === 'HISTORY' && (
                                        <td className="px-6 py-4 text-xs font-bold text-indigo-600 bg-indigo-50/50 whitespace-nowrap">
                                            {getSellerName(order)}
                                        </td>
                                    )}

                                    <td className="px-6 py-4">
                                        <Badge variant="outline" className={`bg-white whitespace-nowrap ${order.status === 'REJECTED' ? 'text-red-600 border-red-300 bg-red-50' : ''}`}>
                                            {getStatusLabel(order.status)}
                                        </Badge>
                                        {['REJECTED', 'CLIENT_REJECTED'].includes(order.status) && order.notes && (
                                            <p className="text-[10px] text-red-500 mt-1 max-w-[150px] truncate" title={order.notes}>
                                                Razón: {order.notes}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-700">{formatCurrency(order.total_price || 0)}</td>
                                    <td className="px-6 py-4 flex justify-center items-center gap-2">
                                        
                                        {/* ACCIONES DEL HISTÓRICO GENERAL (Usa el Modal de Autorización Auditable) */}
                                        {activeQuoteView === 'HISTORY' ? (
                                            <>
                                                <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 px-3 shadow-sm flex items-center gap-1" onClick={() => setViewingOrderIdForAudit(order.id!)}>
                                                    <Eye size={14} /> Auditar
                                                </Button>
                                                <Button variant="outline" size="sm" className="text-slate-500 border-slate-200 hover:bg-slate-50 px-2" onClick={(e) => { e.preventDefault(); handleViewPDF(order.id!); }} title="Descargar PDF">
                                                    <FileDown size={14} />
                                                </Button>
                                            </>
                                        ) : 
                                        
                                        /* ACCIONES PARA DRAFTS Y RECHAZADOS */
                                        ['DRAFT', 'CHANGE_REQUESTED', 'REJECTED'].includes(order.status) ? (
                                            <>
                                                <Button variant="outline" size="sm" className="text-xs px-3" onClick={() => navigate(`/sales/edit/${order.id}`)}>Editar</Button>
                                                <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 px-2" onClick={(e) => { e.preventDefault(); handleViewPDF(order.id!); }} title="Descargar PDF">
                                                    <FileDown size={14} />
                                                </Button>
                                                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 px-2 shadow-sm" onClick={() => handleRequestAuth(order.id!)}>
                                                    <Send size={14} /> Auth.
                                                </Button>
                                                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 px-2 shadow-sm" onClick={() => handleDeleteDraft(order.id!)} title="Eliminar Cotización">
                                                    <Trash2 size={14} />
                                                </Button>
                                            </>
                                        ) : 
                                        
                                        /* ACCIONES PARA AUTORIZADOS Y ESPERANDO ANTICIPO */
                                        order.status === 'ACCEPTED' ? (
                                            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                                                <button onClick={() => setViewingOrderIdForFormat(order.id!)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors" title="Revisar Formato">
                                                    <FileSearch size={18} />
                                                </button>
                                                <button onClick={(e) => { e.preventDefault(); handleViewPDF(order.id!); }} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded transition-colors" title="Descargar PDF">
                                                    <FileDown size={18} />
                                                </button>
                                                <button onClick={() => handleRequestChanges(order.id!)} className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-100 rounded transition-colors" title="Desbloquear para Editar (Cliente pide cambios)">
                                                    <RefreshCcw size={18} />
                                                </button>
                                                <button onClick={() => handleMarkLost(order.id!)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-100 rounded transition-colors" title="Marcar como Perdida (Rechazada)">
                                                    <XCircle size={18} />
                                                </button>
                                                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                                                <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white flex items-center gap-1 ml-1 shadow-sm px-2 text-xs" onClick={() => handleMarkAdvance(order.id!)}>
                                                    <CheckCircle size={14} /> Confirmar
                                                </Button>
                                            </div>
                                        ) : 
                                        
                                        /* ACCIONES POR DEFECTO (EN BÚSQUEDA LIBRE O REVISIÓN) */
                                        (
                                            <>
                                                <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 px-3 shadow-sm flex items-center gap-1" onClick={() => setViewingOrderIdForAudit(order.id!)}>
                                                    <Eye size={14} /> Auditar
                                                </Button>
                                                <Button variant="outline" size="sm" className="text-slate-500 border-slate-200 hover:bg-slate-50 px-2" onClick={(e) => { e.preventDefault(); handleViewPDF(order.id!); }} title="Descargar PDF">
                                                    <FileDown size={14} />
                                                </Button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    // ── MONITOR OPERATIVO: Render ──────────────────────────────────────
    const renderMonitorSection = () => {
        const activeOrders = orders.filter(o =>
            ['SOLD', 'IN_PRODUCTION', 'INSTALLED'].includes(o.status)
        );

        const MONITOR_STATUS_COLORS: Record<string, string> = {
            'SOLD':          'bg-emerald-50 text-emerald-700 border-emerald-200',
            'IN_PRODUCTION': 'bg-blue-50 text-blue-700 border-blue-200',
            'INSTALLED':     'bg-violet-50 text-violet-700 border-violet-200',
        };

        if (activeOrders.length === 0) {
            return (
                <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-bold">No hay proyectos activos en este momento.</p>
                    <p className="text-sm mt-1">Las OVs en estatus SOLD, EN PRODUCCIÓN e INSTALADO aparecerán aquí.</p>
                </div>
            );
        }

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-right-4 duration-300">
                {/* Sub-header */}
                <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                        <Users size={14} /> Órdenes de Venta Activas
                        <span className="bg-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 text-[10px]">
                            {activeOrders.length}
                        </span>
                    </p>
                    <p className="text-[10px] text-indigo-500">Haz clic en "Bautizar" para asignar alias a las instancias antes de enviarlas a planeación.</p>
                </div>

                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3 font-bold">Folio / Proyecto</th>
                            <th className="px-6 py-3 font-bold">Cliente</th>
                            <th className="px-6 py-3 font-bold">Estatus</th>
                            <th className="px-6 py-3 font-bold text-right">Total</th>
                            <th className="px-6 py-3 font-bold text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {activeOrders.map(order => {
                            const colorClass = MONITOR_STATUS_COLORS[order.status] ?? 'bg-slate-50 text-slate-600 border-slate-200';
                            const instances: any[] = (order.items ?? []).flatMap((it: any) => it.instances ?? []);
                            const hasUnnamed = instances.some((inst: any) =>
                                !inst.custom_name || /instancia \d+/i.test(inst.custom_name)
                            );

                            return (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-800">OV-{String(order.id).padStart(4,'0')}</p>
                                        <p className="text-xs text-slate-500 font-medium truncate max-w-[200px]">{order.project_name}</p>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-600">{getClientName(order)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${colorClass}`}>
                                            {getStatusLabel(order.status)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-700">{formatCurrency(order.total_price || 0)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-xs px-3"
                                                onClick={() => setViewingOrderIdForFormat(order.id!)}
                                            >
                                                Ver Detalle
                                            </Button>
                                            <button
                                                onClick={() => setBaptismOrderId(order.id!)}
                                                className={`
                                                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all
                                                    ${hasUnnamed
                                                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm'
                                                        : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'}
                                                `}
                                                title="Asignar alias a las instancias de esta OV"
                                            >
                                                🏷️ {hasUnnamed ? 'Bautizar ⚡' : 'Gestionar Identidad'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
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
                        {activeSection === null ? 'Radar de ventas, comisiones y seguimiento de clientes.' : (activeGoalView !== null || activeQuoteView !== null || activeCollectionView !== null) ? 'Desglose detallado de Cobranza.' : 'Ejecución y detalle operativo.'}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={() => navigate('/sales/new')} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-2"><Plus size={18} /> Nueva Cotización</Button>
                    {activeSection !== null && (
                        <button onClick={handleBack} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-sm">
                            <ArrowLeft size={18} /> {(activeGoalView || activeQuoteView || activeCollectionView) ? 'Regresar a Tarjetas' : 'Regresar al Tablero'}
                        </button>
                    )}
                </div>
            </div>

            {activeSection === null && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
                    
                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('GOALS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black transition-colors group-hover:bg-emerald-100 ${getCountSize(stats.activeCommCount)}`}>
                                {stats.activeCommCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">1. Mis Ingresos</p>
                                    <Target size={16} className="text-emerald-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                                        {formatCurrency(stats.commGenerated)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Comisión Generada</p>
                                    <TrendingUp size={14} className="text-emerald-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('QUOTES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-blue-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black transition-colors group-hover:bg-blue-100 ${getCountSize(stats.drafts + stats.inReview + stats.authorized)}`}>
                               {stats.drafts + stats.inReview + stats.authorized}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Cotizaciones</p>
                                    <FileText size={16} className="text-blue-500" />
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Click para Buscar</p>
                                    <Search size={14} className="text-blue-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('COLLECTIONS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black transition-colors group-hover:bg-amber-100 ${getCountSize(stats.pendingAdvance + stats.pendingInvoices)}`}>
                                {stats.pendingAdvance + stats.pendingInvoices}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">3. Cobranza</p>
                                    <Coins size={16} className="text-amber-500" />
                                </div>
                                <div className="flex justify-end">
                                    <div className="text-lg font-black text-amber-600 tracking-tight leading-none truncate">
                                        {formatCurrency(stats.advanceVal + stats.invoicesVal)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Total por Cobrar (Vivo)</p>
                                    <Wallet size={14} className="text-amber-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card onClick={() => openMainSection('MONITOR')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 ${getCountSize(stats.activeProjectsCount)}`}>
                                {stats.activeProjectsCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Monitor Operativo</p>
                                    <Users size={16} className="text-indigo-500" />
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">OVs Activas + Bautizo</p>
                                    <Search size={14} className="text-indigo-400"/>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {activeSection !== null && (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500 mt-2">

                    {activeSection === 'GOALS' && (
                        <>
                            {activeGoalView === null ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveGoalView('COMMISSIONS')} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(stats.wonCount)}`}>
                                                {stats.wonCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><BadgeDollarSign size={18} className="text-emerald-500"/> A. Comisiones Generadas</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Tu dinero ganado en el mes.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-emerald-200 group-hover:text-emerald-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-emerald-600 text-right leading-none truncate">{formatCurrency(stats.commGenerated)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveGoalView('CLOSED')} className="p-6 border-l-4 border-l-blue-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black group-hover:bg-blue-100 transition-colors ${getCountSize(stats.wonCount)}`}>
                                                {stats.wonCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-blue-500"/> B. Venta Cerrada</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Monto acumulado de OV generadas.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-blue-200 group-hover:text-blue-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-blue-600 text-right leading-none truncate">{formatCurrency(stats.closedSales)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveGoalView('STREET')} className="p-6 border-l-4 border-l-indigo-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black group-hover:bg-indigo-100 transition-colors ${getCountSize(stats.streetCount)}`}>
                                                {stats.streetCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                       <h4 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={18} className="text-indigo-500"/> C. Comisiones por Confirmar</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Tu dinero en cotizaciones "Enviadas".</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-indigo-200 group-hover:text-indigo-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-indigo-600 text-right leading-none truncate">{formatCurrency(stats.moneyOnStreet)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveGoalView('EFFECTIVENESS')} className="p-6 border-l-4 border-l-slate-800 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-100 text-slate-700 border-r border-slate-200 font-black group-hover:bg-slate-200 transition-colors ${getCountSize(stats.totalResolved)}`}>
                                                {stats.totalResolved}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><Target size={18} className="text-slate-600"/> D. Efectividad</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Éxito (Ganadas vs Perdidas).</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-slate-300 group-hover:text-slate-600 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-slate-800 text-right leading-none truncate">{stats.battingRate}% <span className="text-sm font-normal text-slate-400">De Bateo</span></div>
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            ) : ( renderGoalDetailTable() )}
                        </>
                    )}

                    {activeSection === 'QUOTES' && (
                        <div className="space-y-6">
                            {activeQuoteView === null && (
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                    <Search className="text-slate-400 shrink-0" />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar por Folio (ej. 12) o Proyecto..." 
                                        className="w-full outline-none text-slate-700 bg-transparent font-medium"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-red-500 transition-colors">
                                            <XCircle size={18} />
                                        </button>
                                    )}
                                </div>
                            )}

                            {activeQuoteView === null && !searchQuery ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    
                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('DRAFTS')} className="p-6 border-l-4 border-l-slate-400 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-600 border-r border-slate-200 font-black group-hover:bg-slate-100 transition-colors ${getCountSize(stats.drafts)}`}>
                                                {stats.drafts}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><FileSignature size={18} className="text-slate-500"/> A. Borradores</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Propuestas en armado hoy.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-slate-300 group-hover:text-slate-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-slate-600 text-right leading-none truncate">{formatCurrency(stats.draftsVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('REVIEW')} className="p-6 border-l-4 border-l-amber-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black group-hover:bg-amber-100 transition-colors ${getCountSize(stats.inReview)}`}>
                                                {stats.inReview}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-amber-800 flex items-center gap-2"><ShieldAlert size={18} className="text-amber-500"/> B. En Revisión (Freno)</h4>
                                                        <p className="text-sm text-amber-700/80 mt-1 mb-2 truncate">Esperando a Dirección.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-amber-300 group-hover:text-amber-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-amber-600 text-right leading-none truncate">{formatCurrency(stats.reviewVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('AUTHORIZED')} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(stats.authorized)}`}>
                                                {stats.authorized}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500"/> C. Autorizadas</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Listas para enviar/cobrar.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-emerald-200 group-hover:text-emerald-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-emerald-600 text-right leading-none truncate">{formatCurrency(stats.authVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('EXPIRING')} className="p-6 border-l-4 border-l-red-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black group-hover:bg-red-100 transition-colors ${getCountSize(stats.expiring)}`}>
                                                {stats.expiring}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-red-800 flex items-center gap-2"><CalendarClock size={18} className="text-red-500"/> D. Radar de Vigencia</h4>
                                                        <p className="text-sm text-red-600/80 mt-1 mb-2 truncate">Cotizaciones a punto de vencer.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-red-300 group-hover:text-red-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-red-600 text-right leading-none truncate">{formatCurrency(stats.expiringVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveQuoteView('HISTORY')} className="p-6 border-l-4 border-l-slate-700 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-800 border-r border-slate-200 font-black group-hover:bg-slate-100 transition-colors ${getCountSize(stats.historyCount)}`}>
                                                {stats.historyCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><Archive size={18} className="text-slate-600"/> E. Histórico General</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Todas tus cotizaciones.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-slate-300 group-hover:text-slate-600 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-slate-700 text-right leading-none truncate">{stats.historyCount} <span className="text-sm font-normal text-slate-400">Docs</span></div>
                                            </div>
                                        </Card>
                                    </div>
                                    
                                </div>
                            ) : ( 
                                renderQuoteDetailTable() 
                            )}
                        </div>
                    )}

                    {activeSection === 'MONITOR' && renderMonitorSection()}

                    {activeSection === 'COLLECTIONS' && (
                        <>
                            {activeCollectionView === null ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveCollectionView('RETAINED')} className="p-6 border-l-4 border-l-red-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black group-hover:bg-red-100 transition-colors ${getCountSize(stats.retainedCount)}`}>
                                                {stats.retainedCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-red-800 flex items-center gap-2"><Lock size={18} className="text-red-500"/> A. Comisiones Retenidas</h4>
                                                        <p className="text-sm text-red-600/80 mt-1 mb-2 truncate">El cliente no ha pagado anticipo.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-red-200 group-hover:text-red-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-red-600 text-right leading-none truncate">{formatCurrency(stats.retainedComm)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveCollectionView('PAYABLE')} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(stats.payableCount)}`}>
                                                {stats.payableCount}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-emerald-800 flex items-center gap-2"><Unlock size={18} className="text-emerald-500"/> B. Comisiones Pagables</h4>
                                                        <p className="text-sm text-emerald-700/80 mt-1 mb-2 truncate">Liberadas para pagarse en nómina.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-emerald-200 group-hover:text-emerald-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-emerald-600 text-right leading-none truncate">{formatCurrency(stats.payableComm)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => setActiveCollectionView('ADVANCES')} className="p-6 border-l-4 border-l-amber-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black group-hover:bg-amber-100 transition-colors ${getCountSize(stats.pendingAdvance)}`}>
                                                {stats.pendingAdvance}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500"/> C. Anticipos Pendientes</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Ventas bloqueadas por depósito.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-amber-300 group-hover:text-amber-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-amber-600 text-right leading-none truncate">{formatCurrency(stats.advanceVal)}</div>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="w-full relative h-40">
                                        <Card onClick={() => navigate('/finance/pending-invoices')} className="p-6 border-l-4 border-l-indigo-500 bg-white cursor-pointer hover:shadow-lg transition-all group overflow-hidden h-full flex flex-col justify-between">
                                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black group-hover:bg-indigo-100 transition-colors ${getCountSize(stats.pendingInvoices)}`}>
                                                {stats.pendingInvoices}
                                            </div>
                                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2"><FileSearch size={18} className="text-indigo-500"/> D. Cuentas por Cobrar</h4>
                                                        <p className="text-sm text-slate-500 mt-1 mb-2 truncate">Facturas emitidas y pendientes de cobro.</p>
                                                    </div>
                                                    <ArrowLeftCircle size={20} className="text-indigo-200 group-hover:text-indigo-500 transform rotate-180 transition-all"/>
                                                </div>
                                                <div className="text-lg font-black text-indigo-600 text-right leading-none truncate">{formatCurrency(stats.invoicesVal)}</div>
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            ) : (
                                renderCollectionDetailTable()
                            )}
                        </>
                    )}
                </div>
            )}

            {/* SE MANTIENE EL MODAL DE FORMATOS PARA PROCESOS ACTIVOS */}
            {viewingOrderIdForFormat !== null && (
                <SalesOrderDetailModal 
                    orderId={viewingOrderIdForFormat}
                    onClose={() => setViewingOrderIdForFormat(null)}
                />
            )}
            
            {/* EL MODAL DE AUDITORÍA HISTÓRICA CONECTADO A TODAS LAS VISTAS DE LECTURA */}
            {viewingOrderIdForAudit !== null && (
                <FinancialReviewModal 
                    orderId={viewingOrderIdForAudit}
                    onClose={() => setViewingOrderIdForAudit(null)}
                    readOnly={true}
                />
            )}

            {/* MODAL DE BAUTIZO DE INSTANCIAS */}
            {baptismOrderId !== null && (
                <BaptismModal
                    orderId={baptismOrderId}
                    order={orders.find(o => o.id === baptismOrderId) ?? null}
                    onClose={() => setBaptismOrderId(null)}
                    onComplete={() => { setBaptismOrderId(null); loadData(); }}
                />
            )}

        </div>
    );
};

export default SalesDashboardPage;