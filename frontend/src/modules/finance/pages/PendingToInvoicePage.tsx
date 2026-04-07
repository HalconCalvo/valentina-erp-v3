import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Unlock, Search, Factory, FileSearch, Users, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { salesService } from '../../../api/sales-service';
import { SalesOrder } from '../../../types/sales';
import { OrderStatementModal } from '../components/OrderStatementModal';
import { ReceivableChargeModal } from '../components/ReceivableChargeModal';

// ---> TIPOS PARA EL ORDENAMIENTO <---
type SortField = 'FOLIO' | 'CLIENT' | 'PROJECT' | 'CONTRACT' | 'INVOICED' | 'PENDING';
type SortDirection = 'asc' | 'desc';

const PendingToInvoicePage = () => {
    const navigate = useNavigate();
    
    // --- 🛡️ EL CEREBRO DE PERMISOS ---
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const hasAbsolutePower = ['ADMIN', 'ADMINISTRADOR', 'ADMINISTRACIÓN', 'ADMINISTRATION', 'FINANCE', 'FINANZAS', 'DIRECTOR', 'GERENCIA'].includes(userRole);

    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // ---> ESTADOS DE ORDENAMIENTO <---
    const [sortField, setSortField] = useState<SortField>('PENDING'); // Por defecto ordenamos por lo que más nos deben
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedOrderForStatement, setSelectedOrderForStatement] = useState<SalesOrder | null>(null);
    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [selectedOrderForCharge, setSelectedOrderForCharge] = useState<SalesOrder | null>(null);

    const loadSalesData = async () => {
        try {
            setIsLoading(true);
            const allQuotes = await salesService.getOrders();
            setOrders(Array.isArray(allQuotes) ? allQuotes : []);
        } catch (error) {
            console.error("Error cargando órdenes:", error);
            setOrders([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSalesData();
        const intervalId = setInterval(loadSalesData, 15000); 
        return () => clearInterval(intervalId);
    }, []);

    const getClientName = (order: SalesOrder) => {
        const o = order as any; 
        return o.client_name || o.client?.full_name || o.client?.name || o.customer?.name || 'Cliente Sin Nombre';
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

   // --- MOTOR DE CÁLCULO BLINDADO ---
    const installments = orders
        .filter(o => ['SOLD', 'IN_PRODUCTION', 'INSTALLED'].includes(o.status)) 
        .map(order => {
            const totalOrder = Number(order.total_price) || 0;
            const totalInvoiced = order.payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
            
            let pendingToInvoice = totalOrder - totalInvoiced;
            if (pendingToInvoice < 0.1) pendingToInvoice = 0; 
            
            return {
                ...order,
                clientName: getClientName(order),
                totalOrder,
                totalInvoiced,
                pendingToInvoice
            };
        })
        .filter(o => o.pendingToInvoice > 0);

    // --- FILTRO BLINDADO ---
    const filteredInstallments = installments.filter(inv => {
        const q = searchTerm.toLowerCase().trim();
        const client = inv.clientName.toLowerCase();
        const project = (inv.project_name || 'Sin Proyecto').toLowerCase();
        const idStr = inv.id ? inv.id.toString() : '';
        return client.includes(q) || project.includes(q) || idStr.includes(q);
    });

    const totalFilteredPending = filteredInstallments.reduce((sum, inv) => sum + inv.pendingToInvoice, 0);

    // ---> LÓGICA DE ORDENAMIENTO DINÁMICO <---
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'PENDING' || field === 'CONTRACT' ? 'desc' : 'asc');
        }
    };

    const sortedInstallments = useMemo(() => {
        let sortableItems = [...filteredInstallments];
        sortableItems.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'FOLIO': comparison = (a.id || 0) - (b.id || 0); break;
                case 'CLIENT': comparison = a.clientName.localeCompare(b.clientName); break;
                case 'PROJECT': comparison = (a.project_name || '').localeCompare(b.project_name || ''); break;
                case 'CONTRACT': comparison = a.totalOrder - b.totalOrder; break;
                case 'INVOICED': comparison = a.totalInvoiced - b.totalInvoiced; break;
                case 'PENDING': comparison = a.pendingToInvoice - b.pendingToInvoice; break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        return sortableItems;
    }, [filteredInstallments, sortField, sortDirection]);

    // ---> COMPONENTE DE ENCABEZADO ORDENABLE (CORREGIDO) <---
    const SortableHeader = ({ field, label, align = 'left' }: { field: SortField, label: string, align?: 'left' | 'right' | 'center' }) => {
        const isActive = sortField === field;
        return (
            <th className={`p-4 text-${align} cursor-pointer hover:bg-slate-200 transition-colors select-none`} onClick={() => handleSort(field)}>
                <div className={`flex items-center gap-1 inline-flex ${align === 'right' ? 'flex-row-reverse' : ''}`}>
                    <span className={isActive ? (hasAbsolutePower ? 'text-blue-800' : 'text-indigo-800') : 'text-slate-600 font-bold'}>{label}</span>
                    {isActive ? (
                        sortDirection === 'asc' ? <ArrowUp size={16} className={hasAbsolutePower ? 'text-blue-600' : 'text-indigo-600'}/> : <ArrowDown size={16} className={hasAbsolutePower ? 'text-blue-600' : 'text-indigo-600'}/>
                    ) : (
                        <ArrowUpDown size={16} className="text-slate-400 hover:text-slate-600"/>
                    )}
                </div>
            </th>
        );
    };

    // ---> FUNCIÓN DE REGRESO CON MEMORIA CORREGIDA <---
    const handleGoBack = () => {
        // En lugar de hacer un navigate(-1) a ciegas, le decimos explícitamente:
        // "Vete a Tesorería, y cuando llegues, ábreme la tarjeta de RECEIVABLES (Cobrar)"
        navigate('/treasury', { state: { openSection: 'RECEIVABLES' } });
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className={`text-3xl font-black tracking-tight flex items-center gap-3 ${hasAbsolutePower ? 'text-blue-800' : 'text-indigo-800'}`}>
                        {hasAbsolutePower ? <Unlock className="text-blue-500" size={32}/> : <Users className="text-indigo-500" size={32}/>} 
                        {hasAbsolutePower ? 'Pendiente de Facturar (Fábrica)' : 'Monitor de Órdenes de Venta'}
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        {hasAbsolutePower ? 'Capital bloqueado en proyectos vivos que aún no se factura.' : 'Rastrea el estatus de tus proyectos y su facturación.'}
                    </p>
                </div>
                
                <div className="flex items-center gap-4">
                    {isLoading && <span className="text-xs text-slate-400 font-bold animate-pulse">Sincronizando...</span>}
                    <button 
                        onClick={handleGoBack} 
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm"
                    >
                        <ArrowLeft size={18} /> Regresar a Cobranza
                    </button>
                </div>
            </div>

            <div className={`bg-white rounded-xl border shadow-md overflow-hidden ${hasAbsolutePower ? 'border-blue-200' : 'border-indigo-200'}`}>
                <div className={`p-4 border-b flex flex-col md:flex-row justify-between items-center gap-4 ${hasAbsolutePower ? 'border-blue-100 bg-blue-50/50' : 'border-indigo-100 bg-indigo-50/50'}`}>
                    
                    <div className={`bg-white border px-4 py-2 rounded-lg shadow-sm flex items-center gap-3 w-full md:w-auto justify-between ${hasAbsolutePower ? 'border-blue-200' : 'border-indigo-200'}`}>
                        <span className={`text-xs font-bold uppercase tracking-wider ${hasAbsolutePower ? 'text-blue-600' : 'text-indigo-600'}`}>Total Pendiente:</span>
                        <span className={`font-black text-xl ${hasAbsolutePower ? 'text-blue-900' : 'text-indigo-900'}`}>{formatCurrency(totalFilteredPending)}</span>
                    </div>

                    <div className="relative w-full md:w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={18} className="text-slate-400" />
                        </div>
                        <input 
                            type="text" 
                            className={`w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 font-medium transition-all shadow-sm ${hasAbsolutePower ? 'focus:ring-blue-500 focus:border-blue-500' : 'focus:ring-indigo-500 focus:border-indigo-500'}`}
                            placeholder="Buscar cliente, proyecto o folio..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                <SortableHeader field="FOLIO" label="Folio OV" />
                                <SortableHeader field="CLIENT" label="Cliente" />
                                <SortableHeader field="PROJECT" label="Proyecto" />
                                <SortableHeader field="CONTRACT" label="Valor Contrato" align="right" />
                                <SortableHeader field="INVOICED" label="Ya Facturado" align="right" />
                                <SortableHeader field="PENDING" label="Por Facturar" align="right" />
                                <th className="p-4 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedInstallments.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-slate-500 italic text-lg">
                                        Excelente. No hay proyectos con capital pendiente o no hay resultados.
                                    </td>
                                </tr>
                            ) : (
                                sortedInstallments.map((inv) => (
                                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 font-bold text-slate-800 text-sm">
                                            OV-{inv.id?.toString().padStart(4, '0')}
                                        </td>
                                        <td className="p-4 text-xs text-slate-600 font-medium">
                                            {inv.clientName}
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 font-medium flex items-center gap-2">
                                            <Factory size={14} className="text-slate-400" />
                                            {inv.project_name || 'Sin Proyecto'}
                                        </td>
                                        <td className="p-4 text-right font-bold text-slate-500">
                                            {formatCurrency(inv.totalOrder)}
                                        </td>
                                        <td className="p-4 text-right font-medium text-emerald-600">
                                            {formatCurrency(inv.totalInvoiced)}
                                        </td>
                                        <td className="p-4 text-right font-black text-blue-600 text-lg bg-blue-50/30">
                                            {formatCurrency(inv.pendingToInvoice)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => {
                                                    setSelectedOrderForStatement(inv);
                                                    setIsStatementModalOpen(true);
                                                }}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 mx-auto ${hasAbsolutePower ? 'text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-200' : 'text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200'}`}
                                            >
                                                <FileSearch size={14} />
                                                {hasAbsolutePower ? 'Rayos X' : 'Ver Estatus'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ... MODALES INTACTOS ... */}
            {selectedOrderForStatement && (
                <OrderStatementModal
                    isOpen={isStatementModalOpen}
                    onClose={() => { setIsStatementModalOpen(false); setSelectedOrderForStatement(null); }}
                    order={selectedOrderForStatement} onSuccess={loadSalesData} readOnly={!hasAbsolutePower} 
                    onOpenInvoiceModal={hasAbsolutePower ? ((orderToInvoice) => { setSelectedOrderForCharge(orderToInvoice); setIsChargeModalOpen(true); }) : undefined}
                />
            )}
            {selectedOrderForCharge && hasAbsolutePower && (
                <ReceivableChargeModal
                    isOpen={isChargeModalOpen}
                    onClose={() => { setIsChargeModalOpen(false); setSelectedOrderForCharge(null); }}
                    order={selectedOrderForCharge}
                    onSuccess={() => {
                        loadSalesData(); setIsChargeModalOpen(false);
                        if (selectedOrderForStatement && selectedOrderForStatement.id === selectedOrderForCharge.id) {
                            salesService.getOrders().then(orders => {
                                const updated = Array.isArray(orders) ? orders.find(o => o.id === selectedOrderForStatement.id) : null;
                                if (updated) setSelectedOrderForStatement(updated);
                            });
                        }
                    }}
                />
            )}
        </div>
    );
};

export default PendingToInvoicePage;