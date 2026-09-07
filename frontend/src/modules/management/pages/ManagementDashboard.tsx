import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft,
    Landmark,
    Plus,
    Wallet,
    Coins,
    Bell,
    ShoppingCart,
    Tag,
    ArrowRight,
    Users,
    TrendingDown,
    Search,
    CheckCircle,
    FileText,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { toast } from '@/components/ui/VToast';
import { salesService } from '../../../api/sales-service';
import {
    useGlobalConfig,
    useBankAccounts,
    useManagementData,
    usePayrollDashboard,
    usePurchasePendingTasks,
    managementQueryKeys,
} from '../../../hooks/useManagement';
import { BankAccount } from '../../../types/treasury';
import { ReceivablesModule } from '../../finance/components/ReceivablesModule';
import { PayablesModule } from '../../finance/components/PayablesModule';
import { BankAccountCard } from '../../treasury/components/BankAccountCard';
import { CreateAccountModal } from '../../treasury/components/CreateAccountModal';
import { TransactionModal } from '../../treasury/components/TransactionModal';
import { AccountDetail } from '../../treasury/components/AccountDetail';
import {
    PayrollAuditPanel,
    type PayrollLevel1,
} from '../../treasury/components/PayrollAuditPanel';
import { OrderStatementModal } from '../../finance/components/OrderStatementModal';
import { SalesOrder } from '../../../types/sales';

/** Raíz del tablero Administración / Gerencia V4.0 */
type AdminV4Root = null | 'PENDING' | 'BANKS' | 'CXC' | 'CXP' | 'PAYROLL' | 'OV_FACTURACION';
const ManagementDashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canSeeBanks = ['DIRECTOR'].includes(userRole);
    const canCaptureWeeklyFixed = [
        'DIRECTOR',
        'MANAGER',
        'ADMIN',
        'ADMINISTRADOR',
        'FINANCE',
        'FINANZAS',
    ].includes(userRole);
    const canFinanceRayosX = [
        'DIRECTOR',
        'MANAGER',
        'ADMIN',
        'ADMINISTRADOR',
        'FINANCE',
        'FINANZAS',
    ].includes(userRole);

    const [root, setRoot] = useState<AdminV4Root>(null);
    const [payrollSub, setPayrollSub] = useState<PayrollLevel1>(null);

    const [recvSubOpen, setRecvSubOpen] = useState(false);
    const [paySubOpen, setPaySubOpen] = useState(false);
    const [recvResetTok, setRecvResetTok] = useState(0);
    const [payResetTok, setPayResetTok] = useState(0);

    const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<BankAccount | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [transactionType, setTransactionType] = useState<'IN' | 'OUT'>('IN');

    const [selectedOrderForRayosX, setSelectedOrderForRayosX] = useState<SalesOrder | null>(null);

    const { data: config = null } = useGlobalConfig();
    const { data: accounts = [], refetch: refetchBankAccounts } = useBankAccounts(canSeeBanks);
    const { data: managementData, isError: managementError } = useManagementData();
    const { data: payrollDash = {
        commPayableCount: 0,
        instPayableCount: 0,
        commPayableTotal: 0,
        instPayableTotal: 0,
    } } = usePayrollDashboard();
    const { data: purchasePendingTasks, isError: purchasePendingError } = usePurchasePendingTasks();

    const refreshManagement = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: managementQueryKeys.managementData() }),
            queryClient.invalidateQueries({ queryKey: managementQueryKeys.globalConfig() }),
            queryClient.invalidateQueries({ queryKey: managementQueryKeys.payrollDashboard() }),
            queryClient.invalidateQueries({ queryKey: managementQueryKeys.purchasePendingTasks() }),
            ...(canSeeBanks
                ? [queryClient.invalidateQueries({ queryKey: managementQueryKeys.bankAccounts() })]
                : []),
        ]);
    }, [canSeeBanks, queryClient]);

    useEffect(() => {
        if (managementError) toast.error('Error al cargar el panel de administración.');
    }, [managementError]);

    useEffect(() => {
        if (purchasePendingError) toast.error('Error al cargar notificaciones de compras.');
    }, [purchasePendingError]);

    const totalBankBalance = useMemo(
        () => accounts.reduce((sum, account) => sum + (account.current_balance || 0), 0),
        [accounts],
    );

    const {
        totalPayables,
        payablesCount,
        invoicingAdvanceCount,
        invoicingProgressCount,
        invoicingAdvanceTotal,
        invoicingProgressTotal,
        cxcAgingCount,
        cxcAgingTotal,
    } = useMemo(() => {
        const apStats = managementData?.apStats;
        const rights = managementData?.rights;
        const orderList = Array.isArray(managementData?.orders) ? managementData.orders : [];

        const debt =
            (apStats?.overdue_amount || 0) +
            (apStats?.next_period_amount || 0) +
            (apStats?.future_amount || 0);
        const cxpDocTotal =
            (apStats?.overdue_count ?? 0) +
            (apStats?.next_period_count ?? 0) +
            (apStats?.future_count ?? 0);

        let agingN = 0;
        let agingAmt = 0;
        for (const order of orderList) {
            const pays = order.payments;
            if (!pays?.length) continue;
            for (const cxc of pays) {
                if (String(cxc.status).toUpperCase() === 'PENDING') {
                    agingN += 1;
                    agingAmt += Number(cxc.amount) || 0;
                }
            }
        }

        return {
            totalPayables: debt,
            payablesCount: cxpDocTotal,
            invoicingAdvanceCount: rights?.advances.length ?? 0,
            invoicingProgressCount: rights?.progress_instances.length ?? 0,
            invoicingAdvanceTotal: rights?.advance_pending_total ?? 0,
            invoicingProgressTotal: rights?.progress_work_total ?? 0,
            cxcAgingCount: agingN,
            cxcAgingTotal: agingAmt,
        };
    }, [managementData]);

    const alerts = useMemo(
        () => ({
            pending_requisitions: purchasePendingTasks?.orders_to_authorize ?? 0,
            pending_sales_advances: managementData?.rights?.advances.length ?? 0,
        }),
        [managementData?.rights?.advances.length, purchasePendingTasks?.orders_to_authorize],
    );

    useEffect(() => {
        if ((location.state as any)?.reset) {
            setRoot(null);
            setPayrollSub(null);
            setRecvSubOpen(false);
            setPaySubOpen(false);
            window.history.replaceState({}, document.title);
        } else if (location.state && (location.state as { openSection?: string }).openSection) {
            const s = (location.state as { openSection?: string }).openSection;
            if (s === 'RECEIVABLES') setRoot('CXC');
            if (s === 'PAYABLES') setRoot('CXP');
            if (s === 'BANKS' && canSeeBanks) setRoot('BANKS');
            window.history.replaceState({}, document.title);
        }
    }, [location.state, canSeeBanks]);

    useEffect(() => {
        if (root !== 'PAYROLL') setPayrollSub(null);
    }, [root]);

    const formatCurrency = (n: number) =>
        n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const getCountSize = (count: number) => {
        const len = String(count).length;
        if (len > 3) return 'text-xl';
        if (len === 3) return 'text-2xl';
        return 'text-3xl';
    };

    const cxcHubDocCount =
        invoicingAdvanceCount + invoicingProgressCount + cxcAgingCount;
    const cxcHubTotal =
        invoicingAdvanceTotal + invoicingProgressTotal + cxcAgingTotal;

    const handleRegresar = () => {
        if (selectedAccountForDetail) {
            setSelectedAccountForDetail(null);
            return;
        }
        if (payrollSub !== null) {
            setPayrollSub(null);
            return;
        }
        if (root === 'CXP' && paySubOpen) {
            setPayResetTok((t) => t + 1);
            return;
        }
        if (root === 'CXC' && recvSubOpen) {
            setRecvResetTok((t) => t + 1);
            return;
        }
        if (root !== null) {
            setRoot(null);
            return;
        }
    };

    const getTitle = () => {
        if (root === null) return 'Administración V4.0';
        if (root === 'PENDING') return '1. Pendientes (alertas)';
        if (root === 'BANKS') return '2. Bancos (confidencial)';
        if (root === 'CXC') return '3. Cuentas por cobrar';
        if (root === 'OV_FACTURACION') return 'OV y Facturación';
        if (root === 'CXP') return '4. Cuentas por pagar';
        if (root === 'PAYROLL') return '5. Nómina';
        return 'Gerencia';
    };

    const totalTasks = alerts.pending_requisitions + alerts.pending_sales_advances;

    const hideOwnHeader =
        (root === 'CXC' && recvSubOpen) ||
        (root === 'CXP' && paySubOpen) ||
        root === 'OV_FACTURACION';

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            {!hideOwnHeader && (
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">{getTitle()}</h1>
                        <p className="text-slate-500 mt-1 font-medium">
                            {root === null
                                ? 'Jerarquía operativa: pendientes, bóveda, CXC, CXP y nómina.'
                                : 'Use «Regresar» para volver al nivel inmediato anterior.'}
                        </p>
                    </div>
                    {root !== null && (
                        <button
                            type="button"
                            onClick={handleRegresar}
                            className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
                        >
                            <ArrowLeft size={18} /> Regresar
                        </button>
                    )}
                </div>
            )}

            {root === null && (
                <div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4"
                >
                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => setRoot('PENDING')}
                            className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group ${
                                totalTasks > 0 ? 'border-l-amber-500 ring-2 ring-amber-100' : 'border-l-slate-300'
                            }`}
                        >
                            <div
                                className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black transition-colors ${
                                    totalTasks > 0
                                        ? 'bg-amber-50 text-amber-700 border-amber-100 group-hover:bg-amber-100'
                                        : 'bg-slate-50 text-slate-400 border-slate-100 group-hover:bg-slate-100'
                                } ${getCountSize(totalTasks)}`}
                            >
                                {totalTasks > 0 ? totalTasks : <CheckCircle size={28} className="text-slate-300" />}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        1. Pendientes
                                    </p>
                                    <Bell size={16} className={totalTasks > 0 ? 'text-amber-500' : 'text-slate-300'} />
                                </div>
                                <div
                                    className={`text-lg font-bold tracking-tight leading-none truncate text-right ${
                                        totalTasks > 0 ? 'text-amber-600' : 'text-slate-500'
                                    }`}
                                >
                                    {totalTasks === 0 ? 'Sin alertas' : `${totalTasks} acciones`}
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Compras y ventas
                                    </p>
                                    <Search size={14} className={totalTasks > 0 ? 'text-amber-400' : 'text-slate-300'} />
                                </div>
                            </div>
                        </Card>
                    </div>

                    {canSeeBanks && (
                        <div className="w-full relative h-40">
                            <Card
                                onClick={() => setRoot('BANKS')}
                                className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-slate-800 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
                            >
                                <div
                                    className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black transition-colors group-hover:bg-slate-100 ${getCountSize(accounts.length)}`}
                                >
                                    {accounts.length}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                            2. Bancos
                                        </p>
                                        <Landmark size={16} className="text-slate-800" />
                                    </div>
                                    <div className="text-lg font-black text-slate-800 tracking-tight leading-none truncate text-right">
                                        {formatCurrency(totalBankBalance)}
                                    </div>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                        <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                            Solo Dirección / Gerencia
                                        </p>
                                        <Wallet size={14} className="text-slate-400" />
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => setRoot('CXC')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
                        >
                            <div
                                className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black transition-colors group-hover:bg-emerald-100 ${getCountSize(cxcHubDocCount)}`}
                            >
                                {cxcHubDocCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        3. CXC
                                    </p>
                                    <Coins size={16} className="text-emerald-500" />
                                </div>
                                <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate text-right">
                                    {formatCurrency(cxcHubTotal)}
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        A + B + C (sub-tarjetas CXC)
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => setRoot('OV_FACTURACION')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-600 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
                        >
                            <div
                                className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 ${getCountSize(invoicingAdvanceCount + invoicingProgressCount)}`}
                            >
                                {invoicingAdvanceCount + invoicingProgressCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        OV y Facturación
                                    </p>
                                    <FileText size={16} className="text-indigo-600" />
                                </div>
                                <div className="text-lg font-black text-indigo-600 tracking-tight leading-none truncate text-right">
                                    {formatCurrency(invoicingAdvanceTotal + invoicingProgressTotal)}
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Rayos X, anticipos y avances
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => setRoot('CXP')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-red-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
                        >
                            <div
                                className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black transition-colors group-hover:bg-red-100 ${getCountSize(payablesCount)}`}
                            >
                                {payablesCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        4. CXP
                                    </p>
                                    <TrendingDown size={16} className="text-red-500" />
                                </div>
                                <div className="text-lg font-black text-red-600 tracking-tight leading-none truncate text-right">
                                    {formatCurrency(totalPayables)}
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Por vencimiento
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => setRoot('PAYROLL')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
                        >
                            <div
                                className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 ${getCountSize(payrollDash.commPayableCount + payrollDash.instPayableCount)}`}
                            >
                                {payrollDash.commPayableCount + payrollDash.instPayableCount}
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        5. Nómina
                                    </p>
                                    <Users size={16} className="text-indigo-500" />
                                </div>
                                <div className="text-lg font-black text-indigo-600 tracking-tight leading-none truncate text-right">
                                    {formatCurrency(payrollDash.commPayableTotal + payrollDash.instPayableTotal)}
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                                        Comisiones, instalaciones, cierre semanal
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="w-full relative h-40">
                        <Card
                            onClick={() => navigate('/ov-tracking')}
                            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-600 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 text-2xl">
                                🏘️
                            </div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">6. Seguimiento</p>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-700 leading-tight">Seguimiento<br/>de OV</h3>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Casas por OV activa</p>
                                </div>
                            </div>
                        </Card>
                    </div>

                </div>
            )}

            {root === 'PENDING' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card
                        onClick={() =>
                            navigate('/inventory', {
                                state: { openSection: 'PURCHASE_ORDERS', targetTab: 'BRAKE', returnTo: '/management' },
                            })
                        }
                        className="p-6 border-l-4 border-l-orange-500 bg-white cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between"
                    >
                        <div
                            className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-orange-50 text-orange-700 border-r border-orange-100 font-black group-hover:bg-orange-100 transition-colors ${getCountSize(alerts.pending_requisitions)}`}
                        >
                            {alerts.pending_requisitions}
                        </div>
                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate">
                                        <ShoppingCart size={18} className="text-orange-500" />
                                        1.1 Compras
                                    </h4>
                                </div>
                                <ArrowRight
                                    size={20}
                                    className="text-orange-300 group-hover:text-orange-600 transition-all group-hover:translate-x-1"
                                />
                            </div>
                            <div className="flex justify-end">
                                <div className="text-lg font-bold text-orange-600 tracking-tight leading-none truncate">
                                    OCs en espera de firma
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card
                        onClick={() =>
                            navigate('/finance/pending-invoices', {
                                state: { returnTo: '/management', progressTab: 'ANTICIPOS' },
                            })
                        }
                        className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between"
                    >
                        <div
                            className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(alerts.pending_sales_advances)}`}
                        >
                            {alerts.pending_sales_advances}
                        </div>
                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2 truncate">
                                        <Tag size={18} className="text-emerald-500" />
                                        1.2 Ventas
                                    </h4>
                                </div>
                                <ArrowRight
                                    size={20}
                                    className="text-emerald-300 group-hover:text-emerald-600 transition-all group-hover:translate-x-1"
                                />
                            </div>
                            <div className="flex justify-end">
                                <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                                    Anticipos por facturar
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {root === 'BANKS' && canSeeBanks && (
                <div>
                    {selectedAccountForDetail ? (
                        <AccountDetail
                            account={selectedAccountForDetail}
                            onBack={() => setSelectedAccountForDetail(null)}
                            onOpenTransaction={(type) => {
                                setTransactionType(type);
                                setIsTransactionModalOpen(true);
                            }}
                            config={config}
                        />
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                                    <Landmark className="text-slate-500" /> Cuentas y conciliación
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-1"
                                >
                                    <Plus size={16} /> Nueva cuenta
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {accounts.map((account) => (
                                    <BankAccountCard
                                        key={account.id}
                                        account={account}
                                        onClick={setSelectedAccountForDetail}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {root === 'CXC' && (
                <ReceivablesModule
                    onSubSectionChange={setRecvSubOpen}
                    financeReturnPath="/management"
                    resetHubSignal={recvResetTok}
                />
            )}

            {root === 'CXP' && (
                <PayablesModule
                    onSubSectionChange={setPaySubOpen}
                    dueBucketMode="calendar"
                    parentBackSignal={payResetTok}
                />
            )}

            {root === 'PAYROLL' && (
                <PayrollAuditPanel
                    canCaptureWeeklyFixed={canCaptureWeeklyFixed}
                    payrollLevel1={payrollSub}
                    onPayrollLevel1Change={setPayrollSub}
                    accounts={accounts}
                    adminV4Labels
                    onOrderInspect={async (orderId) => {
                        try {
                            const o = await salesService.getOrderDetail(orderId);
                            setSelectedOrderForRayosX(o);
                        } catch {
                            toast.error('No se pudo cargar el detalle de la orden.');
                        }
                    }}
                    onRefresh={refreshManagement}
                />
            )}

            {root === 'OV_FACTURACION' && (
                <ReceivablesModule
                    financeReturnPath="/management"
                    defaultFilter="ALL"
                    onBackOverride={() => setRoot(null)}
                />
            )}

            {canSeeBanks && root === 'BANKS' && (
                <>
                    <CreateAccountModal
                        isOpen={isCreateModalOpen}
                        onClose={() => setIsCreateModalOpen(false)}
                        onSuccess={refreshManagement}
                    />
                    <TransactionModal
                        isOpen={isTransactionModalOpen}
                        onClose={() => setIsTransactionModalOpen(false)}
                        onSuccess={async () => {
                            await refreshManagement();
                            if (selectedAccountForDetail) {
                                const result = await refetchBankAccounts();
                                const accs = result.data ?? [];
                                const updated = accs.find((a) => a.id === selectedAccountForDetail.id);
                                if (updated) setSelectedAccountForDetail(updated);
                            }
                        }}
                        accounts={accounts}
                        selectedAccountId={selectedAccountForDetail?.id}
                        initialType={transactionType}
                    />
                </>
            )}

            {selectedOrderForRayosX && (
                <OrderStatementModal
                    isOpen={!!selectedOrderForRayosX}
                    onClose={() => setSelectedOrderForRayosX(null)}
                    order={selectedOrderForRayosX}
                    onSuccess={refreshManagement}
                    readOnly={!canFinanceRayosX}
                />
            )}
        </div>
    );
};

export default ManagementDashboard;
