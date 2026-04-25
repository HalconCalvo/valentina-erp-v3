import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, Landmark, ArrowDownRight, ArrowUpRight, Users, 
  CheckCircle2, Wallet, ArrowLeft, CheckCircle, 
  Bell, Search, TrendingUp, AlertTriangle,
  ShoppingCart, Tag, ArrowRight, Banknote
} from 'lucide-react';

// --- SERVICIOS Y TIPOS ---
import { treasuryService } from '../../../api/treasury-service';
import { financeService } from '../../../api/finance-service';
import { salesService } from '../../../api/sales-service';
import client from '../../../api/axios-client'; 
import { BankAccount } from '../../../types/treasury';
import { SalesOrder } from '../../../types/sales';
import { pettyCashService } from '../../../api/petty-cash-service';
import { PettyCashFund } from '../../../types/petty_cash';
import PettyCashPanel from '../../management/components/PettyCashPanel';

// --- COMPONENTES BANCARIOS (Locales) ---
import { BankAccountCard } from '../components/BankAccountCard';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { TransactionModal } from '../components/TransactionModal';
import { AccountDetail } from '../components/AccountDetail';
import { OrderStatementModal } from '../../finance/components/OrderStatementModal';

// --- COMPONENTES COMPARTIDOS ---
import { AccountsReceivableAgingPanel } from '../../finance/components/AccountsReceivableAgingPanel';
import { ReceivablesModule } from '../../finance/components/ReceivablesModule';
import { PayablesModule } from '../../finance/components/PayablesModule';
import { PayrollAuditPanel, type PayrollLevel1 } from '../components/PayrollAuditPanel';

// --- UI ---
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type AdminSection = 'TASKS' | 'BANKS' | 'RECEIVABLES' | 'PAYABLES' | 'PAYROLL' | 'PETTY_CASH' | null;

export const TreasuryPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
  const isChecker = ['DIRECTOR', 'GERENCIA'].includes(userRole);
  /** Rayos X / comisiones: mismo criterio amplio que cobranza admin */
  const canFinanceRayosX = [
    'DIRECTOR', 'GERENCIA', 'ADMIN', 'ADMINISTRADOR', 'FINANCE', 'FINANZAS',
  ].includes(userRole);
  /** Cierre semanal de costos fijos: alineado con treasury weekly-fixed-costs. */
  const canCaptureWeeklyFixed = [
    'DIRECTOR',
    'GERENCIA',
    'ADMIN',
    'ADMINISTRADOR',
    'FINANCE',
    'FINANZAS',
  ].includes(userRole);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<BankAccount | null>(null);
  const [transactionType, setTransactionType] = useState<'IN' | 'OUT'>('IN');

  const [totalBankBalance, setTotalBankBalance] = useState(0);
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [totalPayables, setTotalPayables] = useState(0);
  const [payablesCount, setPayablesCount] = useState(0);
  const [receivablesCount, setReceivablesCount] = useState(0);
  
  const [alerts, setAlerts] = useState({ pending_requisitions: 0, pending_sales_advances: 0 });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_allOrders, setAllOrders] = useState<SalesOrder[]>([]);

  /** Resumen tarjeta dashboard nómina (totales independientes desde API). */
  const [payrollDash, setPayrollDash] = useState({
    commPayableCount: 0,
    instPayableCount: 0,
    commPayableTotal: 0,
    instPayableTotal: 0,
  });

  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
      const saved = sessionStorage.getItem('treasury_activeSection');
      return (saved && saved !== 'null' && saved !== 'undefined') ? (saved as AdminSection) : null;
  });

  const [cameFromTasks, setCameFromTasks] = useState(false);

  useEffect(() => {
      if (location.state && location.state.openSection) {
          setActiveSection(location.state.openSection as AdminSection);
          window.history.replaceState({}, document.title); 
      }
  }, [location.state]);

  useEffect(() => {
      if (activeSection) sessionStorage.setItem('treasury_activeSection', activeSection);
      else sessionStorage.removeItem('treasury_activeSection');
  }, [activeSection]);

  const [isSubSectionActive, setIsSubSectionActive] = useState(false);
  const [selectedOrderForRayosX, setSelectedOrderForRayosX] = useState<SalesOrder | null>(null);
  const [pettyCashFund, setPettyCashFund] = useState<PettyCashFund | null>(null);
  const [payrollLevel1, setPayrollLevel1] = useState<PayrollLevel1>(null);

  useEffect(() => {
      if (activeSection !== 'PAYROLL') setPayrollLevel1(null);
  }, [activeSection]);

  const handleRegresar = () => {
    if (payrollLevel1 !== null) {
      setPayrollLevel1(null);
      return;
    }
    if (activeSection !== null) {
      if (cameFromTasks && activeSection === 'RECEIVABLES') {
        setActiveSection('TASKS');
        setCameFromTasks(false);
        setIsSubSectionActive(false);
        return;
      }
      setActiveSection(null);
      setSelectedAccountForDetail(null);
      setIsSubSectionActive(false);
      setCameFromTasks(false);
      return;
    }
  };

  const fetchData = async () => {
    try {
      if (isChecker) {
        setIsAccountsLoading(true);
        const accs = await treasuryService.getAccounts();
        setAccounts(accs || []);
        const totalBancos = (accs || []).reduce((sum: number, acc: BankAccount) => sum + (acc.current_balance || 0), 0);
        setTotalBankBalance(totalBancos);
        setIsAccountsLoading(false);
      }

      const [apStats, orders, rights] = await Promise.all([
        financeService.getPayableDashboardStats(),
        salesService.getOrders(),
        salesService.getInvoicingRights().catch(() => null),
      ]);

      const debt = (apStats?.overdue_amount || 0) + (apStats?.next_period_amount || 0) + (apStats?.future_amount || 0);
      setTotalPayables(debt);
      const cxpDocs =
        (apStats?.overdue_count || 0) +
        (apStats?.next_period_count || 0) +
        (apStats?.future_count || 0);
      setPayablesCount(cxpDocs);

      const safeOrders = Array.isArray(orders) ? orders : [];
      setAllOrders(safeOrders);

      /** Tarjeta padre «Por Cobrar» = A (anticipos) + B (avances obra) + C (antigüedad CXC PENDING), misma base que ReceivablesModule. */
      let agingDocCount = 0;
      let agingAmount = 0;
      for (const o of safeOrders) {
        const pays = o.payments;
        if (!pays?.length) continue;
        for (const cxc of pays) {
          if (String((cxc as { status?: string }).status).toUpperCase() === 'PENDING') {
            agingDocCount += 1;
            agingAmount += Number((cxc as { amount?: number }).amount) || 0;
          }
        }
      }

      const aDocs = rights?.advances.length ?? 0;
      const aAmt = rights?.advance_pending_total ?? 0;
      const bDocs = rights?.progress_instances.length ?? 0;
      const bAmt = rights?.progress_work_total ?? 0;

      setReceivablesCount(aDocs + bDocs + agingDocCount);
      setTotalReceivables(aAmt + bAmt + agingAmount);

      const pendingSalesAdvancesCount =
        rights?.advances.length ??
        safeOrders.filter((o) => String(o.status).toUpperCase() === 'WAITING_ADVANCE').length;

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
        /* ignore dashboard hint errors */
      }

      try {
          const reqsRes = await client.get('/purchases/requisitions/');
          const comprasAutorizadas = reqsRes.data.filter((r: any) => r.status === 'PENDIENTE' || r.status === 'EN_COMPRA');
          
          setAlerts({
              pending_requisitions: comprasAutorizadas.length, 
              pending_sales_advances: pendingSalesAdvancesCount
          });
      } catch(e) {
          console.error("Error cargando notificaciones de compras", e);
      }

      try {
        const fund = await pettyCashService.getFund();
        setPettyCashFund(fund);
      } catch {
        /* ignore petty cash load errors */
      }

    } catch (error) {
      console.error('Error al cargar datos del Dashboard', error);
      setIsAccountsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 30000);
    return () => clearInterval(intervalId);
  }, [isChecker]);

  const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  const getSectionTitle = () => {
    switch(activeSection) {
        case 'TASKS': return 'Centro de Tareas Pendientes';
        case 'BANKS': return 'Catálogo de Bancos y Bóveda';
        case 'RECEIVABLES': return 'Cuentas por Cobrar';
        case 'PAYABLES': return 'Cuentas por Pagar';
        case 'PAYROLL': return 'Centro de Nómina y Destajos';
        case 'PETTY_CASH': return 'Caja Chica';
        default: return isChecker ? 'Tesorería y Flujo Maestro' : 'Administración Central';
    }
  };

  // ---> SASTRE DE TIPOGRAFÍA <---
  const getCountSize = (count: number) => {
      const len = count.toString().length;
      if (len > 3) return 'text-xl';
      if (len === 3) return 'text-2xl';
      return 'text-3xl';
  };

  const totalTasksCount = alerts.pending_requisitions + alerts.pending_sales_advances;

  return (
    <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
      
      {!isSubSectionActive && (
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">{getSectionTitle()}</h1>
              <p className="text-slate-500 mt-1 font-medium">
                {activeSection === null 
                  ? (isChecker ? 'Visión global de cuentas, autorización de pagos y bóveda.' : 'Gestión operativa: cobranza, facturas y armado de solicitudes de pago.')
                  : activeSection === 'TASKS'
                  ? 'Bandeja unificada de acciones requeridas por Administración.'
                  : activeSection === 'PAYROLL' 
                  ? 'Auditoría de comisiones comerciales y cálculo de nómina.' : 'Gestión detallada y ejecución operativa.'}
              </p>
            </div>

            {activeSection !== null && (
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

      {/* --- NIVEL 1: EL GRID PRINCIPAL UNIFICADO --- */}
      {activeSection === null && (
        <div className={`grid grid-cols-1 md:grid-cols-2 ${isChecker ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4`}>
          
          {/* ---> TARJETA 1: CENTRO DE TAREAS <--- */}
          <div className="w-full relative h-40">
              <Card onClick={() => setActiveSection('TASKS')} className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group ${totalTasksCount > 0 ? 'border-l-amber-500 ring-2 ring-amber-100' : 'border-l-slate-300'}`}>
                  <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black transition-colors ${totalTasksCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-100 group-hover:bg-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100 group-hover:bg-slate-100'} ${getCountSize(totalTasksCount)}`}>
                      {totalTasksCount > 0 ? totalTasksCount : <CheckCircle size={28} className="text-slate-300" />}
                  </div>
                  <div className="ml-16 h-full flex flex-col justify-between pl-2">
                      <div className="flex justify-between items-start">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">1. Tareas Pendientes</p>
                          <Bell size={16} className={totalTasksCount > 0 ? 'text-amber-500' : 'text-slate-300'} />
                      </div>
                      <div className="flex justify-end">
                        
                          <div className={`text-lg font-bold tracking-tight leading-none truncate ${totalTasksCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                              {totalTasksCount === 0 ? 'Todo al día' : `${totalTasksCount} Acciones`}
                          </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Click para Abrir Bandeja</p>
                          <Search size={14} className={totalTasksCount > 0 ? 'text-amber-400' : 'text-slate-300'}/>
                      </div>
                  </div>
              </Card>
          </div>

          {/* ---> TARJETA EXTRA: BANCOS (Solo Gerencia) <--- */}
          {isChecker && (
              <div className="w-full relative h-40">
                  <Card onClick={() => setActiveSection('BANKS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-slate-800 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                      <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black transition-colors group-hover:bg-slate-100 ${getCountSize(accounts.length)}`}>
                          {accounts.length}
                      </div>
                      <div className="ml-16 h-full flex flex-col justify-between pl-2">
                          <div className="flex justify-between items-start">
                              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Bóveda</p>
                              <Landmark size={16} className="text-slate-800" />
                          </div>
                          <div className="flex justify-end">
                              <div className="text-lg font-black text-slate-800 tracking-tight leading-none truncate">
                                  {formatCurrency(totalBankBalance)}
                              </div>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                              <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Saldo Actual</p>
                              <Wallet size={14} className="text-slate-400"/>
                          </div>
                      </div>
                  </Card>
              </div>
          )}

          {/* ---> TARJETA 2: COBRAR <--- */}
          <div className="w-full relative h-40">
              <Card onClick={() => setActiveSection('RECEIVABLES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                  <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black transition-colors group-hover:bg-emerald-100 ${getCountSize(receivablesCount)}`}>
                      {receivablesCount}
                  </div>
                  <div className="ml-16 h-full flex flex-col justify-between pl-2">
                      <div className="flex justify-between items-start">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Por Cobrar</p>
                          <ArrowDownRight size={16} className="text-emerald-500" />
                      </div>
                      <div className="flex justify-end">
                          <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                              {formatCurrency(totalReceivables)}
                          </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Total por Cobrar (Vivo)</p>
                          <TrendingUp size={14} className="text-emerald-400"/>
                      </div>
                  </div>
              </Card>
          </div>

          {/* ---> TARJETA 3: PAGAR <--- */}
          <div className="w-full relative h-40">
              <Card onClick={() => setActiveSection('PAYABLES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-red-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                  <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black transition-colors group-hover:bg-red-100 ${getCountSize(payablesCount)}`}>
                      {payablesCount}
                  </div>
                  <div className="ml-16 h-full flex flex-col justify-between pl-2">
                      <div className="flex justify-between items-start">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">3. Por Pagar</p>
                          <ArrowUpRight size={16} className="text-red-500" />
                      </div>
                      <div className="flex justify-end">
                          <div className="text-lg font-black text-red-600 tracking-tight leading-none truncate">
                              {formatCurrency(totalPayables)}
                          </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Monto Total Pendiente</p>
                          <AlertTriangle size={14} className="text-red-400"/>
                      </div>
                  </div>
              </Card>
          </div>

          {/* ---> TARJETA 4: NÓMINA <--- */}
          <div className="w-full relative h-40">
              <Card onClick={() => setActiveSection('PAYROLL')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group">
                  <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 ${getCountSize(payrollDash.commPayableCount + payrollDash.instPayableCount)}`}>
                      {payrollDash.commPayableCount + payrollDash.instPayableCount}
                  </div>
                  <div className="ml-16 h-full flex flex-col justify-between pl-2">
                      <div className="flex justify-between items-start">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Nómina</p>
                          <Users size={16} className="text-indigo-500" />
                      </div>
                      <div className="flex justify-end">
                          <div className="text-lg font-black text-indigo-600 tracking-tight leading-none truncate">
                              {formatCurrency(payrollDash.commPayableTotal + payrollDash.instPayableTotal)}
                          </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Comisiones y Destajos</p>
                          <CheckCircle2 size={14} className="text-indigo-400"/>
                      </div>
                  </div>
              </Card>
          </div>

          {/* ---> TARJETA 5: CAJA CHICA <--- */}
          <div className="w-full relative h-40">
            <Card
              onClick={() => setActiveSection('PETTY_CASH')}
              className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-amber-600 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
            >
              <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r border-amber-100 font-black text-sm transition-colors group-hover:bg-amber-100 ${
                pettyCashFund && pettyCashFund.current_balance <= pettyCashFund.minimum_balance
                  ? 'bg-red-50 text-red-600'
                  : 'bg-amber-50 text-emerald-600'
              }`}>
                {pettyCashFund ? formatCurrency(pettyCashFund.current_balance) : '—'}
              </div>
              <div className="ml-16 h-full flex flex-col justify-between pl-2">
                <div className="flex justify-between items-start">
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">5. Caja Chica</p>
                  <Banknote size={16} className="text-amber-600" />
                </div>
                <div className={`text-lg font-black tracking-tight leading-none truncate text-right ${
                  pettyCashFund && pettyCashFund.current_balance <= pettyCashFund.minimum_balance
                    ? 'text-red-600'
                    : 'text-emerald-600'
                }`}>
                  {pettyCashFund ? formatCurrency(pettyCashFund.current_balance) : 'Cargando...'}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <p className={`text-[10px] font-bold uppercase truncate ${
                    pettyCashFund && pettyCashFund.current_balance <= pettyCashFund.minimum_balance
                      ? 'text-amber-600'
                      : 'text-slate-400'
                  }`}>
                    {pettyCashFund && pettyCashFund.current_balance <= pettyCashFund.minimum_balance
                      ? '⚠️ Saldo bajo — Reponer'
                      : 'Saldo disponible'}
                  </p>
                  <Banknote size={14} className="text-amber-400" />
                </div>
              </div>
            </Card>
          </div>

        </div>
      )}

      {/* --- NIVEL 2 Y 3: VISTAS DETALLADAS --- */}
      {activeSection !== null && (
        <div className="animate-in fade-in slide-in-from-right-8 duration-500 mt-2">

          {/* ========================================================= */}
          {/* MÓDULO DE TAREAS (NIVEL 2: LOS PORTALES DE ACCESO)        */}
          {/* ========================================================= */}
          {activeSection === 'TASKS' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* PORTAL COMPRAS */}
                  <Card onClick={() => navigate('/inventory', { state: { openSection: 'REQUISITIONS' } })} className="p-6 border-l-4 border-l-orange-500 bg-white cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between">
                      <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-orange-50 text-orange-700 border-r border-orange-100 font-black group-hover:bg-orange-100 transition-colors ${getCountSize(alerts.pending_requisitions)}`}>
                          {alerts.pending_requisitions}
                      </div>
                      <div className="ml-16 h-full flex flex-col justify-between pl-2">
                          <div className="flex justify-between items-start">
                              <div><h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><ShoppingCart size={18} className="text-orange-500"/> Compras / Egresos</h4></div>
                              <ArrowRight size={20} className="text-orange-300 group-hover:text-orange-600 transition-all group-hover:translate-x-1"/>
                          </div>
                          <div className="flex justify-end">
                              <div className="text-lg font-bold text-orange-600 tracking-tight leading-none truncate">{alerts.pending_requisitions} Acciones</div>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                              <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Requisiciones Pendientes</p>
                          </div>
                      </div>
                  </Card>

                  {/* PORTAL VENTAS */}
                  <Card onClick={() => { setCameFromTasks(true); setActiveSection('RECEIVABLES'); }} className="p-6 border-l-4 border-l-emerald-500 bg-white cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden h-40 flex flex-col justify-between">
                      <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors ${getCountSize(alerts.pending_sales_advances)}`}>
                          {alerts.pending_sales_advances}
                      </div>
                      <div className="ml-16 h-full flex flex-col justify-between pl-2">
                          <div className="flex justify-between items-start">
                              <div><h4 className="font-bold text-slate-800 flex items-center gap-2 truncate"><Tag size={18} className="text-emerald-500"/> Ventas / Ingresos</h4></div>
                              <ArrowRight size={20} className="text-emerald-300 group-hover:text-emerald-600 transition-all group-hover:translate-x-1"/>
                          </div>
                          <div className="flex justify-end">
                              <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">{alerts.pending_sales_advances} Acciones</div>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                              <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Anticipos por Facturar</p>
                          </div>
                      </div>
                  </Card>
              </div>
          )}

          {/* DEMÁS VISTAS INTACTAS */}
          {activeSection === 'BANKS' && isChecker && (
             <div>
               {selectedAccountForDetail ? (
                 <AccountDetail account={selectedAccountForDetail} onBack={() => setSelectedAccountForDetail(null)} onOpenTransaction={(type) => { setTransactionType(type); setIsTransactionModalOpen(true); }} />
               ) : (
                 <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6">
                   <div className="flex justify-between items-center mb-6">
                     <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg"><Landmark className="text-slate-500"/> Cuentas Autorizadas</h3>
                     <Button onClick={() => setIsCreateModalOpen(true)} className="bg-slate-800 hover:bg-slate-900 text-white"><Plus size={18} className="mr-1" /> Nueva Cuenta</Button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {accounts.map((account) => <BankAccountCard key={account.id} account={account} onClick={setSelectedAccountForDetail} />)}
                   </div>
                 </div>
               )}
             </div>
          )}

          {/* AQUÍ ES A DONDE VIAJA LA SUB-TARJETA DE VENTAS */}
          {activeSection === 'RECEIVABLES' && (
              <ReceivablesModule
                  onSubSectionChange={setIsSubSectionActive}
                  financeReturnPath="/treasury"
                  onBackOverride={() => {
                      setIsSubSectionActive(false);
                      if (cameFromTasks) {
                          setCameFromTasks(false);
                          setActiveSection('TASKS');
                      } else {
                          setActiveSection(null);
                      }
                      void fetchData();
                  }}
              />
          )}
          
          {activeSection === 'PAYABLES' && (
            <PayablesModule
              onSubSectionChange={setIsSubSectionActive}
              dueBucketMode="friday_week"
            />
          )}

          {activeSection === 'PAYROLL' && (
            <PayrollAuditPanel
              canCaptureWeeklyFixed={canCaptureWeeklyFixed}
              payrollLevel1={payrollLevel1}
              onPayrollLevel1Change={setPayrollLevel1}
              accounts={accounts}
              onOrderInspect={async (orderId) => {
                try {
                  const o = await salesService.getOrderDetail(orderId);
                  setSelectedOrderForRayosX(o);
                } catch (e) {
                  console.error(e);
                }
              }}
              onRefresh={fetchData}
            />
          )}

          {activeSection === 'PETTY_CASH' && (
            <PettyCashPanel
              onBack={() => setActiveSection(null)}
              onRefresh={fetchData}
              userRole={userRole}
            />
          )}

        </div>
      )}

      {isChecker && (
        <>
          <CreateAccountModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onSuccess={fetchData} />
          <TransactionModal 
            isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)}
            onSuccess={() => { fetchData(); if (selectedAccountForDetail) { treasuryService.getAccounts().then(accs => { const updated = accs.find(a => a.id === selectedAccountForDetail.id); if (updated) setSelectedAccountForDetail(updated); }); } }}
            accounts={accounts} selectedAccountId={selectedAccountForDetail?.id} initialType={transactionType} 
          />
        </>
      )}

      {selectedOrderForRayosX && (
          <OrderStatementModal
              isOpen={!!selectedOrderForRayosX}
              onClose={() => setSelectedOrderForRayosX(null)}
              order={selectedOrderForRayosX}
              onSuccess={() => { fetchData(); }}
              onOrderPatch={(patch) => {
                setSelectedOrderForRayosX((prev) => (prev ? { ...prev, ...patch } : null));
              }}
              readOnly={!canFinanceRayosX}
          />
      )}

    </div>
  );
};