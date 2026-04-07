import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Search, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { salesService } from '../../../api/sales-service';
import { SalesOrder } from '../../../types/sales';
import { OrderStatementModal } from '../components/OrderStatementModal';
import { ReceivableChargeModal } from '../components/ReceivableChargeModal';

// ---> TIPOS PARA EL ORDENAMIENTO <---
type SortField = 'CLIENT' | 'DATE' | 'INVOICE' | 'AMOUNT' | 'DAYS';
type SortDirection = 'asc' | 'desc';

export const AgingReportPage = () => {
    const navigate = useNavigate();
    
    // ---> 🛡️ SEGURIDAD: DETECTOR DE ROLES <---
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const hasAbsolutePower = ['ADMIN', 'ADMINISTRADOR', 'ADMINISTRACIÓN', 'ADMINISTRATION', 'FINANCE', 'FINANZAS', 'DIRECTOR', 'GERENCIA'].includes(userRole);

    // --- ESTADOS ---
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // ---> ESTADOS DE ORDENAMIENTO <---
    const [sortField, setSortField] = useState<SortField>('DAYS'); // Por defecto ordenamos por días de atraso
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc'); // Los más atrasados primero

    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
    const [selectedOrderForStatement, setSelectedOrderForStatement] = useState<SalesOrder | null>(null);
    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [selectedOrderForCharge, setSelectedOrderForCharge] = useState<SalesOrder | null>(null);

    const loadSalesData = async () => {
        try {
            setIsLoading(true);
            const allQuotes = await salesService.getOrders();
            setOrders(allQuotes);
        } catch (error) {
            console.error("Error cargando cuentas por cobrar:", error);
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
        return o.client_name || o.client?.full_name || o.client?.name || o.customer?.name || 'Cliente por Defecto';
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    // --- CÁLCULOS DEL REPORTE ---
    const pendingInvoices = orders.flatMap(order => {
        if (!order.payments) return [];
        return order.payments
            .filter((cxc: any) => cxc.status === 'PENDING')
            .map((cxc: any) => {
                const invoiceDate = new Date(cxc.invoice_date);
                const today = new Date();
                const diffTime = Math.abs(today.getTime() - invoiceDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                return {
                    ...cxc,
                    order,
                    clientName: getClientName(order),
                    daysOverdue: diffDays
                };
            });
    }); // Quitamos el .sort() duro de aquí para dejarle el trabajo a useMemo

    const filteredInvoices = pendingInvoices.filter(inv => 
        inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.order.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.invoice_folio && inv.invoice_folio.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const totalFilteredAging = filteredInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

    // ---> LÓGICA DE ORDENAMIENTO DINÁMICO <---
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'DAYS' || field === 'AMOUNT' ? 'desc' : 'asc');
        }
    };

    const sortedInvoices = useMemo(() => {
        let sortableItems = [...filteredInvoices];
        sortableItems.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'CLIENT': 
                    comparison = a.clientName.localeCompare(b.clientName); 
                    break;
                case 'DATE': 
                    comparison = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime(); 
                    break;
                case 'INVOICE': 
                    comparison = (a.invoice_folio || '').localeCompare(b.invoice_folio || ''); 
                    break;
                case 'AMOUNT': 
                    comparison = Number(a.amount) - Number(b.amount); 
                    break;
                case 'DAYS': 
                    comparison = a.daysOverdue - b.daysOverdue; 
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        return sortableItems;
    }, [filteredInvoices, sortField, sortDirection]);

    // ---> COMPONENTE DE ENCABEZADO ORDENABLE <---
    const SortableHeader = ({ field, label, align = 'left' }: { field: SortField, label: string, align?: 'left' | 'right' | 'center' }) => {
        const isActive = sortField === field;
        return (
            <th className={`p-4 text-${align} cursor-pointer hover:bg-slate-200 transition-colors select-none`} onClick={() => handleSort(field)}>
                <div className={`flex items-center gap-1 inline-flex ${align === 'right' ? 'flex-row-reverse' : ''} ${align === 'center' ? 'justify-center' : ''}`}>
                    <span className={isActive ? 'text-emerald-800' : 'text-slate-600 font-bold'}>{label}</span>
                    {isActive ? (
                        sortDirection === 'asc' ? <ArrowUp size={16} className="text-emerald-600"/> : <ArrowDown size={16} className="text-emerald-600"/>
                    ) : (
                        <ArrowUpDown size={16} className="text-slate-400 hover:text-slate-600"/>
                    )}
                </div>
            </th>
        );
    };

    // ---> FUNCIÓN DE REGRESO CON MEMORIA <---
    const handleGoBack = () => {
        sessionStorage.setItem('treasury_activeSection', 'RECEIVABLES');
        navigate(-1); 
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-emerald-800 tracking-tight flex items-center gap-3">
                        <FileText className="text-emerald-500" size={32}/> 
                        {hasAbsolutePower ? 'Antigüedad de Saldos' : 'Cartera Viva (Facturas Pendientes)'}
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        {hasAbsolutePower ? 'Toda la cartera viva consolidada. Ejecución operativa.' : 'Monitorea el estatus de cobro de tus proyectos.'}
                    </p>
                </div>
                
                <div className="flex items-center gap-4">
                    {isLoading && <span className="text-xs text-emerald-500 font-bold animate-pulse">Actualizando...</span>}
                    <button 
                        onClick={handleGoBack} 
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-sm"
                    >
                        <ArrowLeft size={18} /> Regresar a Cobranza
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-emerald-200 shadow-md overflow-hidden">
                <div className="p-4 border-b border-emerald-100 bg-emerald-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="bg-white border border-emerald-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-3 w-full md:w-auto justify-between">
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total en Pantalla:</span>
                        <span className="font-black text-emerald-900 text-xl">{formatCurrency(totalFilteredAging)}</span>
                    </div>

                    <div className="relative w-full md:w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={18} className="text-slate-400" />
                        </div>
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium transition-all shadow-sm"
                            placeholder="Buscar cliente, proyecto o factura..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                <SortableHeader field="CLIENT" label="Cliente / Proyecto" />
                                <SortableHeader field="DATE" label="Fecha Emisión" />
                                <SortableHeader field="INVOICE" label="Factura" />
                                <SortableHeader field="AMOUNT" label="Importe" align="right" />
                                <SortableHeader field="DAYS" label="Días Trans." align="center" />
                                <th className="p-4 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-slate-500 italic text-lg">
                                        Cartera sana. No se encontraron facturas vivas o resultados para tu búsqueda.
                                    </td>
                                </tr>
                            ) : (
                                sortedInvoices.map((inv: any) => (
                                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <p className="font-bold text-slate-800 text-sm">{inv.clientName}</p>
                                            <p className="text-xs text-slate-500">{inv.order.project_name}</p>
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 font-medium">
                                            {new Date(inv.invoice_date).toLocaleDateString('es-MX')}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${inv.payment_type === 'ADVANCE' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                {inv.invoice_folio || 'S/F'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-black text-slate-800 text-lg">
                                            {formatCurrency(inv.amount)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`flex items-center justify-center gap-1 font-black text-sm ${inv.daysOverdue > 30 ? 'text-red-600' : inv.daysOverdue > 15 ? 'text-amber-500' : 'text-emerald-600'}`}>
                                                {inv.daysOverdue > 30 && <AlertTriangle size={14}/>}
                                                {inv.daysOverdue}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => {
                                                    setSelectedOrderForStatement(inv.order);
                                                    setIsStatementModalOpen(true);
                                                }}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${hasAbsolutePower ? 'text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200' : 'text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200'}`}
                                            >
                                                {hasAbsolutePower ? 'Abrir / Pagar' : 'Ver Estatus'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- MODALES CON CANDADO DINÁMICO --- */}
            {selectedOrderForStatement && (
                <OrderStatementModal
                    isOpen={isStatementModalOpen}
                    onClose={() => {
                        setIsStatementModalOpen(false);
                        setSelectedOrderForStatement(null);
                    }}
                    order={selectedOrderForStatement}
                    onSuccess={loadSalesData}
                    readOnly={!hasAbsolutePower} // <--- EL CANDADO MÁGICO 🔒
                    onOpenInvoiceModal={hasAbsolutePower ? ((orderToInvoice) => {
                        setSelectedOrderForCharge(orderToInvoice);
                        setIsChargeModalOpen(true);
                    }) : undefined}
                />
            )}

            {selectedOrderForCharge && hasAbsolutePower && (
                <ReceivableChargeModal
                    isOpen={isChargeModalOpen}
                    onClose={() => {
                        setIsChargeModalOpen(false);
                        setSelectedOrderForCharge(null);
                    }}
                    order={selectedOrderForCharge}
                    onSuccess={() => {
                        loadSalesData();
                        setIsChargeModalOpen(false);
                        if (selectedOrderForStatement && selectedOrderForStatement.id === selectedOrderForCharge.id) {
                            salesService.getOrders().then(orders => {
                                const updated = orders.find(o => o.id === selectedOrderForStatement.id);
                                if (updated) setSelectedOrderForStatement(updated);
                            });
                        }
                    }}
                />
            )}
        </div>
    );
};

export default AgingReportPage;