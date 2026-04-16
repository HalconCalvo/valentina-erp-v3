import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Lock, Unlock, ChevronDown, BadgeDollarSign, FileSearch, ArrowUpDown, ArrowUp, ArrowDown, Layers, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { salesService } from '../../../api/sales-service';
import { InvoicingRightsRead, SalesOrder } from '../../../types/sales';
import { normalizeOrderStatus, STATUS_WAITING_ADVANCE } from '../utils/pendingInvoiceBuckets';
import { ReceivableChargeModal } from './ReceivableChargeModal';
import { OrderStatementModal } from './OrderStatementModal';

// ---> 1. AGREGAMOS EL FILTRO 'ALL' <---
type ReceivableFilter = 'ALL' | 'ADVANCES' | null;

type SortField = 'FOLIO' | 'CLIENT' | 'DATE' | 'AMOUNT';
type SortDirection = 'asc' | 'desc';

// ---> NUEVO: Propiedad defaultFilter para el "Teletransporte" <---
interface ReceivablesModuleProps {
    onSubSectionChange?: (isActive: boolean) => void;
    defaultFilter?: ReceivableFilter;
    onBackOverride?: () => void; // <--- NUEVO: El boleto de regreso
    /** Ruta para state.returnTo al abrir Pendiente de Facturar / Antigüedad desde este módulo. */
    financeReturnPath?: string;
    /** Incrementar para forzar cierre de sub-vista (vuelta al hub de 4 tarjetas). */
    resetHubSignal?: number;
}

export const ReceivablesModule: React.FC<ReceivablesModuleProps> = ({
    onSubSectionChange,
    defaultFilter = null,
    onBackOverride,
    financeReturnPath = '/treasury',
    resetHubSignal = 0,
}) => {
    const navigate = useNavigate();
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const hasAbsolutePower = ['ADMIN', 'ADMINISTRADOR', 'ADMINISTRACIÓN', 'ADMINISTRATION', 'FINANCE', 'FINANZAS', 'DIRECTOR', 'GERENCIA'].includes(userRole);

    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [invoicingRights, setInvoicingRights] = useState<InvoicingRightsRead | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Inicializamos el estado con la llave de teletransporte si nos la mandaron
    const [activeFilter, setActiveFilter] = useState<ReceivableFilter>(defaultFilter);
    const [expandedOrderIds, setExpandedOrderIds] = useState<number[]>([]);
    
    const [sortField, setSortField] = useState<SortField>('DATE'); 
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc'); 

    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [selectedOrderForCharge, setSelectedOrderForCharge] = useState<SalesOrder | null>(null);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedOrderForStatement, setSelectedOrderForStatement] = useState<SalesOrder | null>(null);

    useEffect(() => {
        if (onSubSectionChange) {
            onSubSectionChange(activeFilter !== null);
        }
    }, [activeFilter, onSubSectionChange]);

    const lastHubReset = useRef(0);
    useEffect(() => {
        if (resetHubSignal > lastHubReset.current) {
            lastHubReset.current = resetHubSignal;
            setActiveFilter(null);
        }
    }, [resetHubSignal]);

    const loadSalesData = async () => {
        try {
            setIsLoading(true);
            const [response, rights] = await Promise.all([
                salesService.getOrders(),
                salesService.getInvoicingRights().catch(() => null),
            ]);
            if (rights) {
                setInvoicingRights(rights);
            }
            
            // ---> EXTRACCIÓN INTELIGENTE A PRUEBA DE FALLOS <---
            let rawData: any[] = [];
            if (Array.isArray(response)) {
                rawData = response;
            } else if (response && Array.isArray(response.data)) {
                rawData = response.data;
            } else if (response && Array.isArray(response.items)) {
                rawData = response.items;
            }

            if (rawData.length > 0) {
                const uniqueOrders = Array.from(new Map(rawData.map((o: any) => [o.id, o])).values());
                setOrders(uniqueOrders as SalesOrder[]);
            } else {
                setOrders([]);
            }
        } catch (error) {
            console.error("Error cargando cuentas por cobrar:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // ---> EL MOTOR DE ARRANQUE <---
    useEffect(() => {
        loadSalesData();
        const intervalId = setInterval(loadSalesData, 15000); 
        return () => clearInterval(intervalId);
    }, []);

    // ---> EL PUENTE DE COMUNICACIÓN (Sincroniza Rayos X en tiempo real) <---
    useEffect(() => {
        if (selectedOrderForStatement) {
            const freshOrder = orders.find(o => o.id === selectedOrderForStatement.id);
            if (freshOrder) setSelectedOrderForStatement(freshOrder);
        }
    }, [orders]);

    const toggleOrder = (id: number) => setExpandedOrderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const getClientName = useCallback((order: SalesOrder) => {
        const o = order as any;
        return o.client_name || o.client?.full_name || o.client?.name || o.customer?.name || 'Cliente por Defecto';
    }, []);

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    // --- Anticipos por facturar (solo derecho a primer pago: alineado con /sales/invoicing-rights) ---
    const advances = orders.filter((o) => normalizeOrderStatus(o) === STATUS_WAITING_ADVANCE);
    const advancesVal = advances.reduce(
        (sum, o) => sum + (Number(o.total_price) || 0) * ((Number(o.advance_percent) || 60) / 100),
        0
    );
    const advancesForFirstInvoice = useMemo(() => {
        if (!invoicingRights?.advances?.length) return advances;
        const ids = new Set(invoicingRights.advances.map((a) => a.order_id));
        return advances.filter((o) => o.id != null && ids.has(o.id));
    }, [advances, invoicingRights]);

    const advanceCardCount = invoicingRights?.advances.length ?? advancesForFirstInvoice.length;
    const advanceCardVal = invoicingRights?.advance_pending_total ?? advancesVal;

    const cardBCount = invoicingRights?.progress_instances.length ?? 0;
    const installmentsVal = invoicingRights?.progress_work_total ?? 0;

    const pendingInvoices = orders.flatMap(
        (order) => order.payments?.filter((cxc) => String((cxc as { status?: string }).status).toUpperCase() === 'PENDING') || []
    );
    const agingVal = pendingInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

    // ---> 2. TOTALES PARA LA TARJETA "TODAS" (Deuda viva total) <---
    const allCount = orders.length;
    const allVal = orders.reduce((sum, o) => sum + (Number(o.outstanding_balance) || 0), 0);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'AMOUNT' ? 'desc' : 'asc');
        }
    };

    // ---> 3. LÓGICA DE FILTRADO Y ORDENAMIENTO DINÁMICO <---
    const filteredData = useMemo(() => {
        let baseData =
            activeFilter === 'ADVANCES' ? advancesForFirstInvoice : activeFilter === 'ALL' ? orders : [];
        let sortableItems = [...baseData];
        
        sortableItems.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'FOLIO':
                    comparison = (a.id || 0) - (b.id || 0);
                    break;
                case 'CLIENT':
                    comparison = getClientName(a).localeCompare(getClientName(b));
                    break;
                case 'DATE':
                    const dateA = new Date(a.created_at || a.valid_until || 0).getTime() || (a.id || 0);
                    const dateB = new Date(b.created_at || b.valid_until || 0).getTime() || (b.id || 0);
                    comparison = dateA - dateB;
                    break;
                case 'AMOUNT':
                    comparison = (Number(a.total_price) || 0) - (Number(b.total_price) || 0);
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        
        return sortableItems;
    }, [activeFilter, advancesForFirstInvoice, orders, sortField, sortDirection]);

    const SortableHeader = ({ field, label }: { field: SortField, label: string }) => {
        const isActive = sortField === field;
        return (
            <button 
                onClick={() => handleSort(field)}
                className={`flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded transition-colors ${isActive ? 'text-indigo-700 bg-indigo-50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
            >
                {label}
                {isActive ? (
                    sortDirection === 'asc' ? <ArrowUp size={14} className="text-indigo-600"/> : <ArrowDown size={14} className="text-indigo-600"/>
                ) : (
                    <ArrowUpDown size={14} className="text-slate-300 opacity-50"/>
                )}
            </button>
        );
    };

    // Traductor visual de Estatus
    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'WAITING_ADVANCE': return <span className="text-[10px] text-amber-700 font-bold border px-1.5 py-0.5 rounded bg-amber-50 border-amber-200 uppercase tracking-wider">Esperando Anticipo</span>;
            case 'IN_PRODUCTION': return <span className="text-[10px] text-blue-700 font-bold border px-1.5 py-0.5 rounded bg-blue-50 border-blue-200 uppercase tracking-wider">En Producción</span>;
            case 'SOLD': return <span className="text-[10px] text-emerald-700 font-bold border px-1.5 py-0.5 rounded bg-emerald-50 border-emerald-200 uppercase tracking-wider">Vendido / En Proceso</span>;
            case 'FINISHED': return <span className="text-[10px] text-purple-700 font-bold border px-1.5 py-0.5 rounded bg-purple-50 border-purple-200 uppercase tracking-wider">Finalizado</span>;
            case 'DRAFT': return <span className="text-[10px] text-slate-700 font-bold border px-1.5 py-0.5 rounded bg-slate-50 border-slate-200 uppercase tracking-wider">Borrador</span>;
            case 'SENT': return <span className="text-[10px] text-indigo-700 font-bold border px-1.5 py-0.5 rounded bg-indigo-50 border-indigo-200 uppercase tracking-wider">Enviado (Cotización)</span>;
            default: return <span className="text-[10px] text-slate-700 font-bold border px-1.5 py-0.5 rounded bg-slate-50 border-slate-200 uppercase tracking-wider">{status}</span>;
        }
    };

    // Solo dejamos el sastre para la cajita del contador
    const getCountSize = (count: number) => {
        const len = count.toString().length;
        if (len > 3) return 'text-xl';
        if (len === 3) return 'text-2xl';
        return 'text-3xl';
    };

    return (
        <div className="relative animate-fadeIn">
            {activeFilter === null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
                    
                    <div className="w-full relative">
                        <Card onClick={() => setActiveFilter('ADVANCES')} className="p-6 border-l-4 border-l-amber-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black group-hover:bg-amber-100 transition-colors ${getCountSize(advanceCardCount)}`}>
                                {advanceCardCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div><h4 className="font-bold text-amber-800 flex items-center gap-2"><Lock size={18} className="text-amber-500"/> A. Anticipos por facturar</h4><p className="text-sm text-slate-500 mt-2 mb-4">Primer pago pendiente (sin CXC ADVANCE).</p></div>
                                <div className="text-lg font-black text-amber-600 text-right tracking-tight">{formatCurrency(advanceCardVal)}</div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative">
                        <Card onClick={() => navigate('/finance/pending-invoices', { state: { returnTo: financeReturnPath, progressTab: 'AVANCES' } })} className="p-6 border-l-4 border-l-blue-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black group-hover:bg-blue-100 transition-colors ${getCountSize(cardBCount)}`}>
                                {cardBCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div><h4 className="font-bold text-blue-800 flex items-center gap-2"><Unlock size={18} className="text-blue-500"/> B. Avances por facturar</h4><p className="text-sm text-slate-500 mt-2 mb-4">Solo instancias CLOSED sin factura asociada.</p></div>
                                <div className="text-lg font-black text-blue-600 text-right tracking-tight">{formatCurrency(installmentsVal)}</div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative">
                        <Card onClick={() => navigate('/finance/aging', { state: { returnTo: financeReturnPath } })} className="p-6 border-l-4 border-l-emerald-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(pendingInvoices.length)}`}>
                                {pendingInvoices.length}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div><h4 className="font-bold text-emerald-800 flex items-center gap-2"><FileText size={18} className="text-emerald-500"/> C. Antigüedad</h4><p className="text-sm text-slate-500 mt-2 mb-4">Toda la cartera viva consolidada.</p></div>
                                <div className="text-lg font-black text-emerald-600 text-right tracking-tight">{formatCurrency(agingVal)}</div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative">
                        <Card onClick={() => setActiveFilter('ALL')} className="p-6 border-l-4 border-l-indigo-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black group-hover:bg-indigo-100 transition-colors ${getCountSize(allCount)}`}>
                                {allCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div><h4 className="font-bold text-indigo-800 flex items-center gap-2"><Layers size={18} className="text-indigo-500"/> D. Visor de OV</h4><p className="text-sm text-slate-500 mt-2 mb-4">Consulta todas las órdenes de venta (CXC).</p></div>
                                <div className="text-lg font-black text-indigo-600 text-right tracking-tight">{formatCurrency(allVal)}</div>
                            </div>
                        </Card>
                    </div>

                </div>
            ) : (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                        <div>
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
                                {activeFilter === 'ADVANCES' ? <Lock className="text-amber-500"/> : <Layers className="text-indigo-500"/>} 
                                {activeFilter === 'ADVANCES' ? 'Bandeja de Anticipos' : 'Archivo Maestro de Cuentas por Cobrar'}
                            </h3>
                            <p className="text-slate-500 mt-1 text-sm font-medium">Ejecución y detalle operativo.</p>
                        </div>
                        <button 
                            onClick={() => {
                                if (onBackOverride) onBackOverride();
                                else setActiveFilter(null);
                            }} 
                            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-sm text-sm"
                        >
                            <ArrowLeft size={16} /> {onBackOverride ? 'Regresar a Tareas' : 'Regresar a Tarjetas'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        {filteredData.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center"><CheckCircle2 size={48} className="text-slate-300 mb-4 opacity-50"/><p>Bandeja limpia o sin registros.</p></div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="bg-slate-50 border-b border-slate-200 p-2 flex justify-between items-center px-4">
                                    <div className="flex items-center gap-2 md:gap-8 overflow-x-auto">
                                        <SortableHeader field="FOLIO" label="Folio OV" />
                                        <SortableHeader field="CLIENT" label="Cliente / Proyecto" />
                                        <SortableHeader field="DATE" label="Antigüedad (Fecha)" />
                                    </div>
                                    <div className="hidden md:block">
                                        <SortableHeader field="AMOUNT" label="Monto Contrato" />
                                    </div>
                                </div>
                                
                                <div className="divide-y divide-slate-100">
                                    {filteredData.map(order => {
                                        const isExpanded = expandedOrderIds.includes(order.id!);
                                        const orderDate = new Date(order.created_at || order.valid_until || new Date());
                                        const dateString = orderDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
                                        
                                        return (
                                            <div key={order.id} className="group">
                                                <div onClick={() => toggleOrder(order.id!)} className="p-4 cursor-pointer hover:bg-indigo-50/30 flex items-center justify-between transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <ChevronDown size={20} className={`text-slate-400 transform transition-transform duration-300 ${isExpanded ? 'rotate-180 text-indigo-500' : 'group-hover:text-indigo-400'}`} />
                                                        <div>
                                                            <div className="flex items-baseline gap-2">
                                                                <h3 className="font-black text-slate-800 text-lg">OV-{order.id?.toString().padStart(4, '0')}</h3>
                                                                <span className="text-slate-500 font-medium">| {getClientName(order)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                {getStatusBadge(order.status)}
                                                                <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><Clock size={12}/> {dateString}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right hidden md:block">
                                                        <p className="font-black text-slate-700 text-lg">{formatCurrency(Number(order.total_price) || 0)}</p>
                                                    </div>
                                                </div>
                                                
                                                {isExpanded && (
                                                    <div className="p-6 border-t border-indigo-100 bg-indigo-50/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in slide-in-from-top-2 duration-200">
                                                        <div className="flex gap-8">
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Valor Contrato</p>
                                                                <p className="font-black text-slate-800 text-lg">{formatCurrency(Number(order.total_price) || 0)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                                    {activeFilter === 'ADVANCES' ? `Anticipo Solicitado (${order.advance_percent}%)` : 'Saldo Vivo (Por Cobrar)'}
                                                                </p>
                                                                <p className={`font-black text-lg ${activeFilter === 'ADVANCES' ? 'text-amber-600' : 'text-indigo-600'}`}>
                                                                    {activeFilter === 'ADVANCES' 
                                                                        ? formatCurrency((Number(order.total_price) || 0) * ((Number(order.advance_percent) || 60) / 100))
                                                                        : formatCurrency(Number(order.outstanding_balance) || 0)
                                                                    }
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {hasAbsolutePower && (
                                                            <button onClick={(e) => { e.stopPropagation(); setSelectedOrderForStatement(order); setIsStatementModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-black rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 transform hover:-translate-y-0.5">
                                                                <FileSearch size={18} /> Ver Rayos X y Cobrar
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {selectedOrderForStatement && (
                <OrderStatementModal isOpen={isStatementModalOpen} onClose={() => setIsStatementModalOpen(false)} order={selectedOrderForStatement} onSuccess={loadSalesData} onOpenInvoiceModal={(orderToInvoice) => { setSelectedOrderForCharge(orderToInvoice); setIsChargeModalOpen(true); }} />
            )}
            {selectedOrderForCharge && hasAbsolutePower && (
                <ReceivableChargeModal isOpen={isChargeModalOpen} onClose={() => setIsChargeModalOpen(false)} order={selectedOrderForCharge} onSuccess={() => { loadSalesData(); setIsChargeModalOpen(false); }} />
            )}
        </div>
    );
};