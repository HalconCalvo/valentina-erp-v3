import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    Landmark,
    LayoutDashboard,
    Plus,
    Coins,
    Bell,
    ShoppingCart,
    Tag,
    Users,
    TrendingDown,
    CheckCircle,
    FileText,
    FileSpreadsheet,
    Shield,
    Scale,
    Lock,
    Unlock,
    CheckCircle2,
    Home,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { VHubCard } from '@/components/ui/VHubCard';
import { VEmptyState } from '@/components/ui/VEmptyState';
import type { LucideIcon } from 'lucide-react';
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
    type PayrollTray,
} from '../../treasury/components/PayrollAuditPanel';
import { OrderStatementModal } from '../../finance/components/OrderStatementModal';
import { SalesOrder } from '../../../types/sales';
import { formatMoney } from '@/utils/format';
import { invoiceOpenBalance } from '@/utils/invoiceBalance';

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
    // Gabriel 20/10: the chosen tray (retenidas, por pagar, pagadas) is its own screen under Comisiones / Destajos
    const [payrollTray, setPayrollTray] = useState<PayrollTray>(null);

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
                // H47: open balance (amortized advance and payments out), as in CxC
                const balance = invoiceOpenBalance(cxc);
                if (String(cxc.status).toUpperCase() === 'PENDING' && balance > 0) {
                    agingN += 1;
                    agingAmt += balance;
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

    useEffect(() => {
        setPayrollTray(null);
    }, [payrollSub]);

    // H70: the help's "Ir" opens 5. Nómina at Comisiones or Destajos (/management?nomina=comisiones|destajos)
    useEffect(() => {
        const level = new URLSearchParams(location.search).get('nomina');
        const sub: PayrollLevel1 = level === 'comisiones' ? 'COMMISSIONS' : level === 'destajos' ? 'INSTALLATIONS' : null;
        if (!sub) return;
        setRoot('PAYROLL');
        setPayrollSub(sub);
        navigate(location.pathname, { replace: true });
    }, [location.search, location.pathname, navigate]);

    const formatCurrency = (n: number) =>
        formatMoney(n);

    const cxcHubDocCount =
        invoicingAdvanceCount + invoicingProgressCount + cxcAgingCount;
    const cxcHubTotal =
        invoicingAdvanceTotal + invoicingProgressTotal + cxcAgingTotal;

    const handleRegresar = () => {
        if (selectedAccountForDetail) {
            setSelectedAccountForDetail(null);
            return;
        }
        if (payrollTray !== null) {
            setPayrollTray(null);
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

    // Guide v2 §2/§12: each level has its own title (no number), a one-line subtitle and "Regresar a <origen>"
    const getHeader = (): { icon: LucideIcon; title: string; subtitle: string } => {
        if (root === 'PENDING') return { icon: Bell, title: 'Pendientes', subtitle: 'OCs en espera de firma y anticipos por facturar.' };
        if (root === 'BANKS' && selectedAccountForDetail) {
            const acc = selectedAccountForDetail;
            return { icon: Landmark, title: acc.name, subtitle: `Cuenta ${acc.account_number || 'S/N'} · ${acc.currency} · saldo y movimientos.` };
        }
        if (root === 'BANKS') return { icon: Landmark, title: 'Bancos', subtitle: 'Cuentas, saldos y conciliación (confidencial).' };
        if (root === 'CXC') return { icon: Coins, title: 'Cuentas por cobrar', subtitle: 'Anticipos, avances por facturar y antigüedad de saldos.' };
        if (root === 'OV_FACTURACION') return { icon: FileText, title: 'OV y facturación', subtitle: 'Órdenes de venta, anticipos y avances.' };
        if (root === 'CXP') return { icon: TrendingDown, title: 'Cuentas por pagar', subtitle: 'Facturas de proveedores por vencimiento.' };
        if (root === 'PAYROLL') {
            if (payrollSub === 'COMMISSIONS') {
                if (payrollTray === 'RETAINED') return { icon: Lock, title: 'Comisiones retenidas', subtitle: 'Comisiones que esperan el cobro o la firma que las libera.' };
                if (payrollTray === 'PAYABLE') return { icon: Unlock, title: 'Comisiones por pagar', subtitle: 'Comisiones liberadas, listas para pagar.' };
                if (payrollTray === 'PAID') return { icon: CheckCircle2, title: 'Histórico de comisiones', subtitle: 'Comisiones pagadas.' };
                return { icon: Users, title: 'Comisiones', subtitle: 'Comisiones retenidas, por pagar y pagadas.' };
            }
            if (payrollSub === 'INSTALLATIONS') {
                if (payrollTray === 'RETAINED') return { icon: Lock, title: 'Destajos sin firma', subtitle: 'Instalaciones que esperan la firma del cliente.' };
                if (payrollTray === 'PAYABLE') return { icon: Unlock, title: 'Destajos por pagar', subtitle: 'Instalaciones con la firma de conformidad del cliente, listas para pagar.' };
                if (payrollTray === 'PAID') return { icon: CheckCircle2, title: 'Destajos pagados', subtitle: 'Pagos de instalación ya hechos.' };
                return { icon: Users, title: 'Destajos', subtitle: 'Pagos de instalación por cuadrilla: sin firma, por pagar y pagados.' };
            }
            if (payrollSub === 'WEEKLY') return { icon: Users, title: 'Nómina semanal', subtitle: 'Cierre de jueves de costos fijos e histórico.' };
            return { icon: Users, title: 'Nómina', subtitle: 'Comisiones, destajos de instalación y nómina semanal.' };
        }
        return { icon: LayoutDashboard, title: 'Gerencia', subtitle: 'Pendientes, bancos, cobranza, pagos y nómina.' };
    };

    const getBackLabel = () => {
        if (selectedAccountForDetail) return 'Regresar a Bancos';
        if (payrollTray !== null) return payrollSub === 'INSTALLATIONS' ? 'Regresar a Destajos' : 'Regresar a Comisiones';
        if (payrollSub !== null) return 'Regresar a Nómina';
        return 'Regresar a Gerencia';
    };
    const header = getHeader();

    const totalTasks = alerts.pending_requisitions + alerts.pending_sales_advances;

    const hideOwnHeader =
        (root === 'CXC' && recvSubOpen) ||
        (root === 'CXP' && paySubOpen) ||
        root === 'OV_FACTURACION';

    return (
        <div className={`p-8 pb-24 space-y-6 animate-fadeIn ${root === null || root === 'PENDING' ? 'max-w-7xl mx-auto' : 'w-full'}`}>
            {!hideOwnHeader && (
                <VPageHeader
                    icon={header.icon}
                    title={header.title}
                    subtitle={header.subtitle}
                    onRefresh={() => void refreshManagement()}
                    actions={root === 'BANKS' && canSeeBanks && !selectedAccountForDetail ? (
                        <Button type="button" onClick={() => setIsCreateModalOpen(true)}>
                            <Plus size={16} /> Nueva cuenta
                        </Button>
                    ) : undefined}
                    onBack={root !== null ? handleRegresar : undefined}
                    backLabel={getBackLabel()}
                />
            )}

            {root === null && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                    <VHubCard
                        label="1. Pendientes"
                        title={totalTasks === 0 ? 'Sin alertas' : 'Por atender'}
                        footer={totalTasks === 0 ? 'Compras y ventas al día' : `${totalTasks} ${totalTasks === 1 ? 'acción' : 'acciones'} · compras y ventas`}
                        icon={Bell}
                        side={totalTasks > 0 ? totalTasks : <CheckCircle size={28} className="text-slate-300" />}
                        tone={totalTasks > 0 ? 'amber' : 'slate'}
                        highlight={totalTasks > 0}
                        onClick={() => setRoot('PENDING')}
                    />
                    {canSeeBanks && (
                        <VHubCard
                            label="2. Bancos"
                            title="Saldos"
                            footer={`${formatCurrency(totalBankBalance)} · solo Dirección`}
                            icon={Landmark}
                            side={accounts.length}
                            tone="slate"
                            onClick={() => setRoot('BANKS')}
                        />
                    )}
                    <VHubCard
                        label="3. Cuentas por cobrar"
                        title="Por cobrar"
                        footer={`${formatCurrency(cxcHubTotal)} · anticipos, avances y saldos`}
                        icon={Coins}
                        side={cxcHubDocCount}
                        tone="emerald"
                        onClick={() => setRoot('CXC')}
                    />
                    <VHubCard
                        label="OV y facturación"
                        title="Por facturar"
                        footer={`${formatCurrency(invoicingAdvanceTotal + invoicingProgressTotal)} · anticipos y avances`}
                        icon={FileText}
                        side={invoicingAdvanceCount + invoicingProgressCount}
                        tone="indigo"
                        onClick={() => setRoot('OV_FACTURACION')}
                    />
                    <VHubCard
                        label="4. Cuentas por pagar"
                        title="Por pagar"
                        footer={`${formatCurrency(totalPayables)} · por vencimiento`}
                        icon={TrendingDown}
                        side={payablesCount}
                        tone="red"
                        onClick={() => setRoot('CXP')}
                    />
                    <VHubCard
                        label="5. Nómina"
                        title="Por pagar"
                        footer={`${formatCurrency(payrollDash.commPayableTotal + payrollDash.instPayableTotal)} · comisiones e instalaciones`}
                        icon={Users}
                        side={payrollDash.commPayableCount + payrollDash.instPayableCount}
                        tone="indigo"
                        onClick={() => setRoot('PAYROLL')}
                    />
                    <VHubCard
                        label="6. Seguimiento"
                        title="Casas por OV"
                        footer="OVs activas"
                        icon={Home}
                        side={<Home size={28} />}
                        tone="indigo"
                        onClick={() => navigate('/ov-tracking')}
                    />
                    <VHubCard
                        label="Migración legacy"
                        title="Importar OVs"
                        footer="Excel a CxC sin producción"
                        icon={FileSpreadsheet}
                        side={<FileSpreadsheet size={28} />}
                        tone="violet"
                        onClick={() => navigate('/director/legacy-import')}
                    />
                    <VHubCard
                        label="Saneamiento"
                        title="Saldos"
                        footer="Recalcular OVs y facturas con lo cobrado"
                        icon={Scale}
                        side={<Scale size={28} />}
                        tone="amber"
                        onClick={() => navigate('/director/sanitation')}
                    />
                    <VHubCard
                        label="Auditoría"
                        title="Cambios"
                        footer="Quién cambió qué campo y cuándo"
                        icon={Shield}
                        side={<Shield size={28} />}
                        tone="slate"
                        onClick={() => navigate('/director/audit')}
                    />
                </div>
            )}

            {root === 'PENDING' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <VHubCard
                        label="1.1 Compras"
                        title="OCs por firmar"
                        footer="Órdenes de compra en espera de autorización"
                        icon={ShoppingCart}
                        side={alerts.pending_requisitions}
                        tone="amber"
                        onClick={() =>
                            navigate('/inventory', {
                                state: { openSection: 'PURCHASE_ORDERS', targetTab: 'BRAKE', returnTo: '/management' },
                            })
                        }
                    />
                    <VHubCard
                        label="1.2 Ventas"
                        title="Anticipos"
                        footer="Anticipos por facturar"
                        icon={Tag}
                        side={alerts.pending_sales_advances}
                        tone="emerald"
                        onClick={() =>
                            navigate('/finance/pending-invoices', {
                                state: { returnTo: '/management', progressTab: 'ANTICIPOS' },
                            })
                        }
                    />
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
                            hideTitle
                        />
                    ) : accounts.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                            <VEmptyState icon={<Landmark />} title="No hay cuentas bancarias." />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {accounts.map((account) => (
                                <BankAccountCard
                                    key={account.id}
                                    account={account}
                                    onClick={setSelectedAccountForDetail}
                                />
                            ))}
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
                    tray={payrollTray}
                    onTrayChange={setPayrollTray}
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
