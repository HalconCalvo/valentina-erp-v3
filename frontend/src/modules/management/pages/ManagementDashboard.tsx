import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import client from '../../../api/axios-client';
import { financeService } from '../../../api/finance-service';
import { salesService } from '../../../api/sales-service';
import { treasuryService } from '../../../api/treasury-service';
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
type AdminV4Root = null | 'PENDING' | 'BANKS' | 'CXC' | 'CXP' | 'PAYROLL';
const ManagementDashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canSeeBanks = ['DIRECTOR', 'GERENCIA'].includes(userRole);
    const canCaptureWeeklyFixed = [
        'DIRECTOR',
        'GERENCIA',
        'ADMIN',
        'ADMINISTRADOR',
        'FINANCE',
        'FINANZAS',
    ].includes(userRole);
    const canFinanceRayosX = [
        'DIRECTOR',
        'GERENCIA',
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

    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [totalBankBalance, setTotalBankBalance] = useState(0);
    const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<BankAccount | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [transactionType, setTransactionType] = useState<'IN' | 'OUT'>('IN');

    const [alerts, setAlerts] = useState({ pending_requisitions: 0, pending_sales_advances: 0 });
    const [totalPayables, setTotalPayables] = useState(0);
    const [payablesCount, setPayablesCount] = useState(0);
    const [invoicingAdvanceCount, setInvoicingAdvanceCount] = useState(0);
    const [invoicingProgressCount, setInvoicingProgressCount] = useState(0);
    const [invoicingAdvanceTotal, setInvoicingAdvanceTotal] = useState(0);
    const [invoicingProgressTotal, setInvoicingProgressTotal] = useState(0);
    /** Tarjeta C (Antigüedad): CXC pendientes de cobro (misma base que ReceivablesModule). */
    const [cxcAgingCount, setCxcAgingCount] = useState(0);
    const [cxcAgingTotal, setCxcAgingTotal] = useState(0);

    const [payrollDash, setPayrollDash] = useState({
        commPayableCount: 0,
        instPayableCount: 0,
        commPayableTotal: 0,
        instPayableTotal: 0,
    });
    const [selectedOrderForRayosX, setSelectedOrderForRayosX] = useState<SalesOrder | null>(null);

    const loadData = useCallback(async () => {
        try {
            if (canSeeBanks) {
                const accs = await treasuryService.getAccounts();
                setAccounts(accs || []);
                setTotalBankBalance((accs || []).reduce((s, a) => s + (a.current_balance || 0), 0));
            }

            const [apStats, rights, orders] = await Promise.all([
                financeService.getPayableDashboardStats(),
                salesService.getInvoicingRights().catch(() => null),
                salesService.getOrders().catch(() => [] as SalesOrder[]),
            ]);

            const debt =
                (apStats?.overdue_amount || 0) +
                (apStats?.next_period_amount || 0) +
                (apStats?.future_amount || 0);
            setTotalPayables(debt);
            const cxpDocTotal =
                (apStats?.overdue_count ?? 0) +
                (apStats?.next_period_count ?? 0) +
                (apStats?.future_count ?? 0);
            setPayablesCount(cxpDocTotal);

            if (rights) {
                setInvoicingAdvanceCount(rights.advances.length);
                setInvoicingProgressCount(rights.progress_instances.length);
                setInvoicingAdvanceTotal(rights.advance_pending_total);
                setInvoicingProgressTotal(rights.progress_work_total);
            } else {
                setInvoicingAdvanceCount(0);
                setInvoicingProgressCount(0);
                setInvoicingAdvanceTotal(0);
                setInvoicingProgressTotal(0);
            }

            const orderList = Array.isArray(orders) ? orders : [];
            let agingN = 0;
            let agingAmt = 0.0;
            for (const o of orderList) {
                const pays = (o as SalesOrder).payments;
                if (!pays?.length) continue;
                for (const cxc of pays) {
                    if (String((cxc as { status?: string }).status).toUpperCase() === 'PENDING') {
                        agingN += 1;
                        agingAmt += Number((cxc as { amount?: number }).amount) || 0;
                    }
                }
            }
            setCxcAgingCount(agingN);
            setCxcAgingTotal(agingAmt);

            try {
                const [coOv, instOv] = await Promise.all([
                    salesService.getCommissionsPayrollOverview(),
                    treasuryService.getInstallerPayrollOverview(),
                ]);
                setPayrollDash({
                    commPayableCount: coOv.payable.length,
                    instPayableCount: instOv.payable.length,
                    commPayableTotal: coOv.payable_total,
                    instPayableTotal: instOv.payable_total,
                });
            } catch {
                /* ignore */
            }

            try {
                const reqsRes = await client.get('/purchases/requisitions/');
                const pend = reqsRes.data.filter(
                    (r: { status?: string }) => r.status === 'PENDIENTE' || r.status === 'EN_COMPRA'
                );
                setAlerts({
                    pending_requisitions: pend.length,
                    pending_sales_advances: rights?.advances.length ?? 0,
                });
            } catch (e) {
                console.error('Error cargando requisiciones (Gerencia)', e);
            }
        } catch (e) {
            console.error('ManagementDashboard loadData', e);
        }
    }, [canSeeBanks]);

    useEffect(() => {
        loadData();
        const id = setInterval(loadData, 30000);
        return () => clearInterval(id);
    }, [loadData]);

    useEffect(() => {
        if (location.state && (location.state as { openSection?: string }).openSection) {
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
        if (root === 'CXP') return '4. Cuentas por pagar';
        if (root === 'PAYROLL') return '5. Nómina';
        return 'Gerencia';
    };

    const totalTasks = alerts.pending_requisitions + alerts.pending_sales_advances;

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
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

            {root === null && (
                <div
                    className={`grid grid-cols-1 md:grid-cols-2 ${canSeeBanks ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6 mt-4`}
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
                </div>
            )}

            {root === 'PENDING' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card
                        onClick={() =>
                            navigate('/inventory', {
                                state: { openSection: 'REQUISITIONS', returnTo: '/management' },
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
                                    Requisiciones por procesar
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
                        } catch (e) {
                            console.error(e);
                        }
                    }}
                    onRefresh={loadData}
                />
            )}

            {canSeeBanks && root === 'BANKS' && (
                <>
                    <CreateAccountModal
                        isOpen={isCreateModalOpen}
                        onClose={() => setIsCreateModalOpen(false)}
                        onSuccess={loadData}
                    />
                    <TransactionModal
                        isOpen={isTransactionModalOpen}
                        onClose={() => setIsTransactionModalOpen(false)}
                        onSuccess={() => {
                            loadData();
                            if (selectedAccountForDetail) {
                                treasuryService.getAccounts().then((accs) => {
                                    const u = accs.find((a) => a.id === selectedAccountForDetail.id);
                                    if (u) setSelectedAccountForDetail(u);
                                });
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
                    onSuccess={loadData}
                    readOnly={!canFinanceRayosX}
                />
            )}
        </div>
    );
};

export default ManagementDashboard;
