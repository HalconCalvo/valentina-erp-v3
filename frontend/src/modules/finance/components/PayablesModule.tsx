import React, { useState, useEffect } from 'react';
import { TrendingDown, Clock, CheckCircle2, AlertCircle, Calendar, ArrowLeft, Check, Layers, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { financeService } from '../../../api/finance-service';
import { treasuryService } from '../../../api/treasury-service';
import { AccountsPayableStats, PendingInvoice, SupplierPayment, PaymentRequestPayload } from '../../../types/finance';
import { BankAccount } from '../../../types/treasury';

import { PaymentRequestModal } from './PaymentRequestModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';

type PayableFilter = 'ALL' | 'THIS_FRIDAY' | 'NEXT_15_DAYS' | 'FUTURE' | null;
type SortKey = 'provider_name' | 'invoice_number' | 'due_date' | 'outstanding_balance';

interface PayablesModuleProps {
    onSubSectionChange?: (isActive: boolean) => void;
}

export const PayablesModule: React.FC<PayablesModuleProps> = ({ onSubSectionChange }) => {
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const isChecker = ['DIRECTOR', 'GERENCIA'].includes(userRole);

    const [stats, setStats] = useState<AccountsPayableStats | null>(null);
    const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
    const [sentRequests, setSentRequests] = useState<SupplierPayment[]>([]); 
    const [approvedRequests, setApprovedRequests] = useState<SupplierPayment[]>([]);
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    
    const [activeFilter, setActiveFilter] = useState<PayableFilter>(null);
    const [isFinanceLoading, setIsFinanceLoading] = useState(false);

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

    const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
    const [editingRequest, setEditingRequest] = useState<SupplierPayment | null>(null);

    const [viewingInvoice, setViewingInvoice] = useState<PendingInvoice | null>(null);

    const handleFilterChange = (filter: PayableFilter) => {
        setActiveFilter(filter);
        setSortConfig(null); 
        if (onSubSectionChange) {
            onSubSectionChange(filter !== null);
        }
    };

    const handleSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const loadData = async (showSpinner = true) => {
        if (showSpinner) setIsFinanceLoading(true);
        try {
            const [statsData, invoicesData, pendingReqData, approvedReqData, accountsData] = await Promise.all([
                financeService.getPayableDashboardStats(),
                financeService.getPendingInvoices(),
                financeService.getPendingApprovals(), 
                financeService.getApprovedPayments(),
                treasuryService.getAccounts()
            ]);
            setStats(statsData);
            setInvoices(invoicesData);
            setSentRequests(pendingReqData);
            setApprovedRequests(approvedReqData);
            setAccounts(accountsData);
        } catch (error) {
            console.error("Error al refrescar pagos", error);
        } finally {
            if (showSpinner) setIsFinanceLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const intervalId = setInterval(() => loadData(false), 15000);
        return () => clearInterval(intervalId);
    }, []);

    const getFilteredInvoices = () => {
        if (!activeFilter) return [];
        if (activeFilter === 'ALL') return invoices;

        return invoices.filter(inv => {
            if (!inv.due_date) return false;
            const due = new Date(inv.due_date);
            due.setMinutes(due.getMinutes() + due.getTimezoneOffset());
            const today = new Date();
            today.setHours(0,0,0,0);
            due.setHours(0,0,0,0);
            
            let daysUntilFriday = 5 - today.getDay();
            if (daysUntilFriday < 0) daysUntilFriday += 7; 

            const cutoffDate = new Date(today);
            cutoffDate.setDate(today.getDate() + daysUntilFriday);
            const nextPeriodLimit = new Date(cutoffDate);
            nextPeriodLimit.setDate(cutoffDate.getDate() + 15);

            const dueTime = due.getTime();
            const cutoffTime = cutoffDate.getTime();
            const nextPeriodTime = nextPeriodLimit.getTime();

            if (activeFilter === 'THIS_FRIDAY') return dueTime <= cutoffTime; 
            if (activeFilter === 'NEXT_15_DAYS') return dueTime > cutoffTime && dueTime <= nextPeriodTime; 
            if (activeFilter === 'FUTURE') return dueTime > nextPeriodTime; 
            return false;
        });
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        if (dateStr.includes('T')) return new Date(dateStr).toLocaleDateString('es-MX', {day: '2-digit', month: '2-digit'});
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    };

    const handleEditRequest = (req: SupplierPayment) => {
        const relatedInvoice = invoices.find(inv => inv.invoice_number === req.invoice_folio && inv.provider_name === req.provider_name);
        setSelectedInvoice(relatedInvoice || null);
        setEditingRequest(req);
    };

    const handleModalSubmit = async (payload: PaymentRequestPayload) => {
        try {
            if (editingRequest) {
                if (isChecker) {
                    if (!payload.suggested_account_id) {
                        alert("⚠️ Selecciona una cuenta bancaria de origen para efectuar el pago.");
                        return;
                    }
                    
                    try {
                        await financeService.updatePaymentStatus(editingRequest.id, 'APPROVED', payload.suggested_account_id);
                    } catch (innerError) {
                        await financeService.cancelPaymentRequest(editingRequest.id);
                        await financeService.requestPayment(payload);
                    }
                    
                    alert("✅ Pago autorizado y ejecutado exitosamente.");
                } else {
                    await financeService.updatePaymentRequest(editingRequest.id, payload);
                    alert("✅ Solicitud actualizada.");
                }
            } else {
                await financeService.requestPayment(payload);
                if (isChecker) alert("✅ Pago efectuado directamente.");
                else alert("✅ Solicitud enviada a Gerencia.");
            }
            setSelectedInvoice(null); 
            setEditingRequest(null);
            loadData(true);
        } catch (e) {
            alert("❌ Error al procesar el pago. Intenta de nuevo.");
        }
    };

    const filteredData = getFilteredInvoices();
    
    const sortedFilteredData = [...filteredData].sort((a, b) => {
        if (sortConfig) {
            let aVal: any = a[sortConfig.key];
            let bVal: any = b[sortConfig.key];

            if (sortConfig.key === 'due_date') {
                aVal = new Date(a.due_date || 0).getTime();
                bVal = new Date(b.due_date || 0).getTime();
            }

            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        } else {
            const aIsAdvance = (a as any).is_advance || String(a.invoice_number).startsWith('OC') || String(a.invoice_number).startsWith('COT');
            const bIsAdvance = (b as any).is_advance || String(b.invoice_number).startsWith('OC') || String(b.invoice_number).startsWith('COT');
            if (aIsAdvance && !bIsAdvance) return -1;
            if (!aIsAdvance && bIsAdvance) return 1;  
            return 0; 
        }
    });

    const totalAllCount = invoices.length;
    const totalAllAmount = invoices.reduce((sum, inv) => sum + inv.outstanding_balance, 0);

    const theme = (() => {
        switch (activeFilter) {
            case 'ALL': return { border: 'border-indigo-300', bgLight: 'bg-indigo-50', textTitle: 'text-indigo-950', textIcon: 'text-indigo-600', btnHover: 'hover:bg-indigo-100 hover:text-indigo-800 hover:border-indigo-300', btnAction: 'bg-indigo-200 hover:bg-indigo-300 text-indigo-950 border border-indigo-300' };
            case 'THIS_FRIDAY': return { border: 'border-red-300', bgLight: 'bg-red-50', textTitle: 'text-red-950', textIcon: 'text-red-600', btnHover: 'hover:bg-red-100 hover:text-red-800 hover:border-red-300', btnAction: 'bg-red-200 hover:bg-red-300 text-red-950 border border-red-300' };
            case 'NEXT_15_DAYS': return { border: 'border-orange-200', bgLight: 'bg-orange-50', textTitle: 'text-orange-900', textIcon: 'text-orange-500', btnHover: 'hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200', btnAction: 'bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-200' };
            case 'FUTURE': return { border: 'border-yellow-300', bgLight: 'bg-yellow-50', textTitle: 'text-yellow-900', textIcon: 'text-yellow-500', btnHover: 'hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-300', btnAction: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300' };
            default: return { border: 'border-slate-200', bgLight: 'bg-slate-50', textTitle: 'text-slate-800', textIcon: 'text-slate-500', btnHover: 'hover:bg-slate-50 hover:text-slate-700', btnAction: 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200' };
        }
    })();

    const getActiveFilterTitle = () => {
        switch(activeFilter) {
            case 'ALL': return <><Layers className={theme.textIcon} size={20} /> Archivo Maestro (Todas las Cuentas)</>;
            case 'THIS_FRIDAY': return <><AlertCircle className={theme.textIcon} size={20} /> Pago Inmediato (Vence este Viernes)</>;
            case 'NEXT_15_DAYS': return <><Calendar className={theme.textIcon} size={20} /> Proyección Corta (Próximos 15 Días)</>;
            case 'FUTURE': return <><TrendingDown className={theme.textIcon} size={20} /> Largo Plazo (Más de 15 Días)</>;
            default: return '';
        }
    };

    const renderSortableHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
        const isActive = sortConfig?.key === key;
        return (
            <th 
                className={`p-4 cursor-pointer hover:bg-slate-200/50 transition-colors select-none group ${align === 'right' ? 'text-right' : 'text-left'}`} 
                onClick={() => handleSort(key)}
            >
                <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'} ${isActive ? 'text-indigo-800 font-black' : ''}`}>
                    {label}
                    {isActive ? (
                        sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-indigo-600"/> : <ArrowDown size={14} className="text-indigo-600"/>
                    ) : (
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                    )}
                </div>
            </th>
        );
    };

    return (
        <div className="space-y-6">

            {activeFilter === null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
                    
                    <div className="w-full relative">
                        <Card onClick={() => handleFilterChange('THIS_FRIDAY')} className="p-6 border-l-4 border-l-red-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-xl">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black text-3xl group-hover:bg-red-100">
                                {stats?.overdue_count || 0}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div>
                                    <h4 className="font-bold text-red-800 flex items-center gap-2"><AlertCircle size={18} /> Pago Inmediato</h4>
                                    <p className="text-sm text-slate-500 mt-2 mb-4">Para este viernes</p>
                                </div>
                                <div className="text-lg font-black text-red-600 text-right tracking-tight">{formatCurrency(stats?.overdue_amount || 0)}</div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative">
                        <Card onClick={() => handleFilterChange('NEXT_15_DAYS')} className="p-6 border-l-4 border-l-orange-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-xl">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-orange-50 text-orange-700 border-r border-orange-100 font-black text-3xl group-hover:bg-orange-100">
                                {stats?.next_period_count || 0}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div>
                                    <h4 className="font-bold text-orange-800 flex items-center gap-2"><Calendar size={18} /> Proyección Corta</h4>
                                    <p className="text-sm text-slate-500 mt-2 mb-4">Próximos 15 días</p>
                                </div>
                                <div className="text-lg font-black text-orange-600 text-right tracking-tight">{formatCurrency(stats?.next_period_amount || 0)}</div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative">
                        <Card onClick={() => handleFilterChange('FUTURE')} className="p-6 border-l-4 border-l-yellow-400 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-xl">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-yellow-50 text-yellow-700 border-r border-yellow-100 font-black text-3xl group-hover:bg-yellow-100">
                                {stats?.future_count || 0}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div>
                                    <h4 className="font-bold text-yellow-800 flex items-center gap-2"><TrendingDown size={18} /> Largo Plazo</h4>
                                    <p className="text-sm text-slate-500 mt-2 mb-4">Más de 15 días</p>
                                </div>
                                <div className="text-lg font-black text-yellow-600 text-right tracking-tight">{formatCurrency(stats?.future_amount || 0)}</div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative">
                        <Card onClick={() => handleFilterChange('ALL')} className="p-6 border-l-4 border-l-indigo-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-xl">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black text-3xl group-hover:bg-indigo-100">
                                {totalAllCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div>
                                    <h4 className="font-bold text-indigo-800 flex items-center gap-2"><Layers size={18} /> Todas</h4>
                                    <p className="text-sm text-slate-500 mt-2 mb-4">Archivo Maestro</p>
                                </div>
                                <div className="text-lg font-black text-indigo-600 text-right tracking-tight">{formatCurrency(totalAllAmount)}</div>
                            </div>
                        </Card>
                    </div>

                </div>
            ) : (
                <div className="space-y-6">
                    <div className={`bg-white rounded-xl shadow-md border ${theme.border} overflow-hidden mt-4`}>
                        <div className={`p-4 ${theme.bgLight} border-b ${theme.border} flex justify-between items-center`}>
                            <h3 className={`font-bold flex items-center gap-2 text-lg ${theme.textTitle}`}>
                                {getActiveFilterTitle()}
                            </h3>
                            <button 
                                onClick={() => handleFilterChange(null)} 
                                className={`flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-sm font-bold transition-colors shadow-sm ${theme.btnHover}`}
                            >
                                <ArrowLeft size={16} /> Regresar
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className={`text-xs text-slate-600 uppercase tracking-wider ${theme.bgLight} border-b ${theme.border} font-black`}>
                                    <tr>
                                        {renderSortableHeader('Proveedor', 'provider_name')}
                                        {renderSortableHeader('Factura', 'invoice_number')}
                                        {renderSortableHeader('Vencimiento', 'due_date')}
                                        {renderSortableHeader('Saldo Deuda', 'outstanding_balance', 'right')}
                                        <th className="p-4 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isFinanceLoading ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-slate-400 font-bold">Cargando desglose...</td></tr>
                                    ) : filteredData.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-slate-400 italic font-medium">No hay facturas pendientes en esta categoría.</td></tr>
                                    ) : sortedFilteredData.map(inv => {
                                        // Ahora solo nos interesa saber si hay alguna solicitud activa para cambiar a Ámbar. Nada de verdes.
                                        const allActiveReqs = [...sentRequests, ...approvedRequests];
                                        const activeReqForInv = allActiveReqs.filter(req => req.invoice_folio === inv.invoice_number && req.provider_name === inv.provider_name);
                                        const hasActive = activeReqForInv.length > 0;
                                        
                                        return (
                                            <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 font-bold text-slate-800">{inv.provider_name}</td>
                                                <td className="p-4">
                                                    <button 
                                                        onClick={() => setViewingInvoice(inv)}
                                                        className="font-mono bg-slate-100 border border-slate-200 px-2 py-1 rounded text-indigo-700 text-xs font-bold hover:bg-indigo-50 hover:border-indigo-200 transition-colors shadow-sm text-left"
                                                        title="Ver detalle del documento"
                                                    >
                                                        {inv.invoice_number}
                                                    </button>
                                                </td>
                                                <td className="p-4 text-slate-600 font-medium">{formatDate(inv.due_date)}</td>
                                                <td className={`p-4 text-right font-black text-lg ${theme.textTitle}`}>
                                                    {formatCurrency(inv.outstanding_balance)}
                                                </td>
                                                
                                                <td className="p-4 text-center">
                                                    {hasActive ? (
                                                        isChecker ? (
                                                            <Button 
                                                                size="sm" 
                                                                className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 w-full max-w-[160px] font-bold shadow-sm transition-colors"
                                                                onClick={() => handleEditRequest(activeReqForInv[0])}
                                                            >
                                                                Se Solicita Pago
                                                            </Button>
                                                        ) : (
                                                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200 font-bold py-1.5 border w-full max-w-[160px] inline-block text-center">
                                                                Se Solicita Pago
                                                            </Badge>
                                                        )
                                                    ) : (
                                                        <Button 
                                                            size="sm" 
                                                            className={`${theme.btnAction} w-full max-w-[160px] font-bold shadow-sm transition-colors`} 
                                                            onClick={() => setSelectedInvoice(inv)}
                                                        >
                                                            <CheckCircle2 size={16} className="mr-1"/> {isChecker ? 'Ejecutar Directo' : 'Se Solicita Pago'}
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL MAESTRO UNIVERSAL */}
            {(selectedInvoice || editingRequest) && (
                <PaymentRequestModal 
                    invoice={selectedInvoice || undefined} 
                    existingRequest={editingRequest || undefined} 
                    onClose={() => { setSelectedInvoice(null); setEditingRequest(null); }} 
                    onSubmit={handleModalSubmit} 
                    isChecker={isChecker} 
                />
            )}
            
            {/* VISOR DE FACTURAS/OC (Los Rayos X) */}
            {viewingInvoice && <InvoiceDetailModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />}
        </div>
    );
};