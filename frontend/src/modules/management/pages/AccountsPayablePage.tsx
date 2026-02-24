import React, { useEffect, useState } from 'react';
import { 
    TrendingDown, AlertTriangle, Calendar, 
    Filter, Search, DollarSign, ArrowRight, XCircle, CheckCircle
} from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { financeService } from '../../../api/finance-service';
import { AccountsPayableStats, PendingInvoice, PaymentRequestPayload } from '../../../types/finance';
import { PaymentRequestModal } from '../components/PaymentRequestModal';

const AccountsPayablePage: React.FC = () => {
    const [stats, setStats] = useState<AccountsPayableStats | null>(null);
    const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Homologado con los nombres del Dashboard
    const [activeFilter, setActiveFilter] = useState<'ALL' | 'IMMEDIATE' | 'SHORT_TERM' | 'LONG_TERM'>('ALL');
    const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const statsData = await financeService.getPayableDashboardStats();
            setStats(statsData);

            const pendingData = await financeService.getPendingInvoices();
            setInvoices(pendingData);
        } catch (error) {
            console.error("Error cargando mesa de control:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // LÓGICA DE FILTRADO (Viernes de Corte) BLINDADA CONTRA ZONAS HORARIAS
    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = 
            inv.provider_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!matchesSearch) return false;
        if (activeFilter === 'ALL') return true;

        if (!inv.due_date) return false;

        // 1. Blindaje de Zona Horaria (Para que no se pierdan días)
        const due = new Date(inv.due_date);
        due.setMinutes(due.getMinutes() + due.getTimezoneOffset());
        
        const today = new Date();
        today.setHours(0,0,0,0);
        due.setHours(0,0,0,0);
        
        // 2. Algoritmo: Encontrar el próximo viernes
        const weekday = today.getDay(); // 0 es Domingo, 5 es Viernes
        let daysUntilFriday = 5 - weekday;
        if (daysUntilFriday < 0) daysUntilFriday += 7; // Si ya es sábado, brinca al prox viernes

        const cutoffDate = new Date(today);
        cutoffDate.setDate(today.getDate() + daysUntilFriday);

        const nextPeriodLimit = new Date(cutoffDate);
        nextPeriodLimit.setDate(cutoffDate.getDate() + 15);

        // 3. Filtros exactos usando .getTime() para evitar fallos de Javascript
        const dueTime = due.getTime();
        const cutoffTime = cutoffDate.getTime();
        const nextPeriodTime = nextPeriodLimit.getTime();

        if (activeFilter === 'IMMEDIATE') return dueTime <= cutoffTime; // Vencidas + Hasta el viernes
        if (activeFilter === 'SHORT_TERM') return dueTime > cutoffTime && dueTime <= nextPeriodTime; // Próximos 15 días
        if (activeFilter === 'LONG_TERM') return dueTime > nextPeriodTime; // Futuro (Largo Plazo)

        return true;
    });

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    
    const formatDate = (dateStr: string) => {
        if (!dateStr) return "-";
        const date = new Date(dateStr);
        // Forzamos zona horaria local para evitar saltos de día
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
        return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getDaysRemaining = (dueDateStr: string) => {
        if (!dueDateStr) return 0;
        const due = new Date(dueDateStr);
        due.setMinutes(due.getMinutes() + due.getTimezoneOffset()); // Blindaje de zona horaria
        const today = new Date();
        due.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const diffTime = due.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const renderDueBadge = (days: number) => {
        if (days < 0) return <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">Vencida hace {Math.abs(days)} días</span>;
        if (days === 0) return <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded">Vence Hoy</span>;
        if (days <= 7) return <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Vence en {days} días</span>;
        return <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">{days} días crédito</span>;
    };

    const handleRequestPayment = async (data: PaymentRequestPayload) => {
        try {
            await financeService.requestPayment(data);
            alert("✅ Solicitud enviada a Dirección para autorización.");
            setSelectedInvoice(null);
            loadData();
        } catch (error) {
            console.error(error);
            alert("Error al solicitar el pago.");
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-24 animate-fadeIn">
            
            <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
                        <TrendingDown className="text-red-600" /> Mesa de Control: Cuentas por Pagar
                    </h1>
                    <p className="text-slate-500 mt-1">Gestión de flujo de efectivo y pagos a proveedores.</p>
                </div>
                <div className="text-right flex items-center gap-4">
                    <Button 
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold border-2 border-emerald-600 shadow-lg transform transition hover:scale-105" 
                        onClick={() => alert("Próximamente: Panel de Ejecución de Pagos Autorizados")}
                    >
                        <CheckCircle size={18} className="mr-2"/> Pagos Listos para Ejecutar
                    </Button>
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase">Solicitudes Pendientes</div>
                        <div className="text-2xl font-black text-indigo-600">
                            {stats?.total_pending_approval || 0}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* TARJETA ROJA: PAGO INMEDIATO */}
                <Card 
                    onClick={() => setActiveFilter(activeFilter === 'IMMEDIATE' ? 'ALL' : 'IMMEDIATE')}
                    className={`p-4 border-l-4 border-l-red-500 cursor-pointer transition-all hover:scale-[1.02] ${activeFilter === 'IMMEDIATE' ? 'bg-red-100 ring-2 ring-red-500 shadow-md' : 'bg-red-50/50 hover:bg-red-100'}`}
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-xs font-bold text-red-700 uppercase flex items-center gap-1">
                            <AlertTriangle size={12}/> Pago Inmediato
                        </div>
                        {activeFilter === 'IMMEDIATE' && <XCircle size={16} className="text-red-500"/>}
                    </div>
                    <div className="text-3xl font-black text-red-700">
                        {formatCurrency(stats?.overdue_amount || 0)}
                    </div>
                </Card>

                {/* TARJETA NARANJA: PROYECCIÓN CORTA */}
                <Card 
                    onClick={() => setActiveFilter(activeFilter === 'SHORT_TERM' ? 'ALL' : 'SHORT_TERM')}
                    className={`p-4 border-l-4 border-l-orange-500 cursor-pointer transition-all hover:scale-[1.02] ${activeFilter === 'SHORT_TERM' ? 'bg-orange-100 ring-2 ring-orange-500 shadow-md' : 'bg-orange-50/50 hover:bg-orange-100'}`}
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-xs font-bold text-orange-700 uppercase flex items-center gap-1">
                            <Calendar size={12}/> Proyección Corta
                        </div>
                        {activeFilter === 'SHORT_TERM' && <XCircle size={16} className="text-orange-500"/>}
                    </div>
                    <div className="text-3xl font-black text-orange-700">
                        {formatCurrency(stats?.next_period_amount || 0)}
                    </div>
                </Card>

                {/* TARJETA VERDE: LARGO PLAZO */}
                <Card 
                    onClick={() => setActiveFilter(activeFilter === 'LONG_TERM' ? 'ALL' : 'LONG_TERM')}
                    className={`p-4 border-l-4 border-l-yellow-400 cursor-pointer transition-all hover:scale-[1.02] ${activeFilter === 'LONG_TERM' ? 'bg-yellow-100 ring-2 ring-yellow-500 shadow-md' : 'bg-yellow-50/50 hover:bg-yellow-100'}`}
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-xs font-bold text-yellow-700 uppercase flex items-center gap-1">
                            <ArrowRight size={12}/> Largo Plazo
                        </div>
                        {activeFilter === 'LONG_TERM' && <XCircle size={16} className="text-yellow-600"/>}
                    </div>
                    <div className="text-3xl font-black text-yellow-700">
                        {formatCurrency(stats?.future_amount || 0)}
                    </div>
                </Card>
            </div>

            {activeFilter !== 'ALL' && (
                <div className="flex items-center gap-2 bg-indigo-50 text-indigo-800 px-4 py-2 rounded-lg text-sm font-bold border border-indigo-100 animate-fadeIn">
                    <Filter size={16}/>
                    Filtro Activo: {activeFilter === 'IMMEDIATE' ? 'Pago Inmediato (Corte Viernes)' : activeFilter === 'SHORT_TERM' ? 'Proyección Corta (+15 días)' : 'Largo Plazo (Futuro)'}
                    <button onClick={() => setActiveFilter('ALL')} className="ml-auto text-indigo-600 hover:text-indigo-900 underline">
                        Ver todo
                    </button>
                </div>
            )}

            <div className="flex gap-4 items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm mt-4">
                <Search className="text-slate-400 ml-2" size={20}/>
                <input 
                    type="text" 
                    placeholder="Buscar proveedor o folio..." 
                    className="flex-1 outline-none text-sm font-medium text-slate-600"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <Card className="overflow-hidden bg-white shadow-sm border border-slate-200 min-h-[400px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Proveedor</th>
                                <th className="px-6 py-4">Factura / Folio</th>
                                <th className="px-6 py-4">Vencimiento</th>
                                <th className="px-6 py-4 text-right">Saldo Pendiente</th>
                                <th className="px-6 py-4 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={5} className="p-12 text-center text-slate-400">Cargando cuentas...</td></tr>
                            ) : filteredInvoices.length === 0 ? (
                                <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">
                                    {activeFilter !== 'ALL' ? 'No hay facturas con este filtro.' : 'No hay facturas pendientes. ¡Al día! 🎉'}
                                </td></tr>
                            ) : filteredInvoices.map((inv) => (
                                <tr key={inv.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4 font-bold text-slate-800">{inv.provider_name}</td>
                                    <td className="px-6 py-4 font-mono text-slate-600">{inv.invoice_number}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className="font-medium text-slate-700">{formatDate(inv.due_date)}</span>
                                            {renderDueBadge(getDaysRemaining(inv.due_date))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="font-bold text-slate-800 text-base">{formatCurrency(inv.outstanding_balance)}</div>
                                        <div className="text-[10px] text-slate-400">Total: {formatCurrency(inv.total_amount)}</div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <Button 
                                            size="sm" 
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:scale-105 transition-transform"
                                            onClick={() => setSelectedInvoice(inv)}
                                        >
                                            <DollarSign size={14} className="mr-1"/> Solicitar
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {selectedInvoice && (
                <PaymentRequestModal 
                    invoice={selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                    onSubmit={handleRequestPayment}
                />
            )}
        </div>
    );
};

export default AccountsPayablePage;