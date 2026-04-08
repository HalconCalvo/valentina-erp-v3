import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, Landmark, ArrowDownRight, ArrowUpRight, Users, 
  Clock, CheckCircle2, Wallet, ArrowLeft, Lock, Unlock, CheckCircle, 
  Receipt, Filter, Wrench, Bell, Search, TrendingUp, AlertTriangle,
  ShoppingCart, Tag, ArrowRight
} from 'lucide-react';

// --- SERVICIOS Y TIPOS ---
import { treasuryService } from '../../../api/treasury-service';
import { financeService } from '../../../api/finance-service';
import { salesService } from '../../../api/sales-service';
import client from '../../../api/axios-client'; 
import { BankAccount } from '../../../types/treasury';
import { SalesOrder } from '../../../types/sales';

// --- COMPONENTES BANCARIOS (Locales) ---
import { BankAccountCard } from '../components/BankAccountCard';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { TransactionModal } from '../components/TransactionModal';
import { AccountDetail } from '../components/AccountDetail';
import { OrderStatementModal } from '../../finance/components/OrderStatementModal';

// --- COMPONENTES COMPARTIDOS ---
import { ReceivablesModule } from '../../finance/components/ReceivablesModule';
import { PayablesModule } from '../../finance/components/PayablesModule';

// --- UI ---
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import Badge from '@/components/ui/Badge';

type AdminSection = 'TASKS' | 'BANKS' | 'RECEIVABLES' | 'PAYABLES' | 'PAYROLL' | null;
type PayrollView = 'GENERATED' | 'PAYABLE' | 'PAID';
type PayrollCategory = 'COMMISSIONS' | 'INSTALLATIONS';

export const TreasuryPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
  const isChecker = ['DIRECTOR', 'GERENCIA'].includes(userRole);

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

  const [allOrders, setAllOrders] = useState<SalesOrder[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string>('ALL');
  const [availableSellers, setAvailableSellers] = useState<{id: string, name: string}[]>([]);

  const [commissions, setCommissions] = useState({ 
      generated: 0, payable: 0, paid: 0, 
      generatedList: [] as any[], payableList: [] as any[], paidList: [] as any[],
      payableCount: 0 
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
  const [activePayrollView, setActivePayrollView] = useState<PayrollView>('PAYABLE');
  const [payrollCategory, setPayrollCategory] = useState<PayrollCategory>('COMMISSIONS');

  const calculateCommissions = (orders: SalesOrder[], sellerFilter: string) => {
      let commGen = 0, commPayable = 0, commPaid = 0;
      let generatedList: any[] = [], payableList: any[] = [], paidList: any[] = [];

      const filteredOrders = sellerFilter === 'ALL' ? orders : orders.filter(o => o.user_id?.toString() === sellerFilter);

      filteredOrders.forEach((o: SalesOrder) => {
          const status = String(o.status).toUpperCase();
          const orderTotal = Number(o.total_price) || 1; 
          const orderComm = Number(o.commission_amount) || 0;
          const sellerName = (o as any).user?.full_name || (o as any).user?.username || (o.user_id ? `Asesor #${o.user_id}` : 'Sin Asignar');

          if (['SOLD', 'INSTALLED', 'FINISHED'].includes(status)) {
              let invoicedComm = 0;
              if (o.payments && Array.isArray(o.payments)) {
                  o.payments.forEach((p: any) => {
                      const cxcAmount = Number(p.amount) || 0;
                      const cxcComm = (cxcAmount / orderTotal) * orderComm;
                      invoicedComm += cxcComm;

                      if (p.status === 'PAID') {
                          if (p.commission_paid) {
                              commPaid += cxcComm; 
                              paidList.push({ orderId: o.id, project: o.project_name, folio: p.invoice_folio || 'S/F', cxcAmount, commAmount: cxcComm, rawOrder: o, sellerName });
                          } else {
                              commPayable += cxcComm; 
                              payableList.push({ orderId: o.id, project: o.project_name, folio: p.invoice_folio || 'S/F', cxcAmount, commAmount: cxcComm, rawOrder: o, sellerName });
                          }
                      } else {
                          commGen += cxcComm; 
                          generatedList.push({ orderId: o.id, project: o.project_name, folio: p.invoice_folio || 'S/F (Pendiente)', cxcAmount, commAmount: cxcComm, rawOrder: o, sellerName });
                      }
                  });
              }

              const uninvoicedComm = orderComm - invoicedComm;
              if (uninvoicedComm > 0) {
                  commGen += uninvoicedComm;
                  generatedList.push({ orderId: o.id, project: o.project_name, folio: 'Capital Pendiente de Facturar', cxcAmount: 0, commAmount: uninvoicedComm, rawOrder: o, sellerName });
              }
          }
      });
      
      setCommissions({ generated: commGen, payable: commPayable, paid: commPaid, generatedList, payableList, paidList, payableCount: payableList.length });
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

      const [apStats, orders] = await Promise.all([
        financeService.getPayableDashboardStats(),
        salesService.getOrders()
      ]);

      const debt = (apStats?.overdue_amount || 0) + (apStats?.next_period_amount || 0) + (apStats?.future_amount || 0);
      setTotalPayables(debt);
      setPayablesCount(apStats?.overdue_count || 0); 

      let receivableAmount = 0;
      let recCount = 0;
      let pendingSalesAdvancesCount = 0;

      (orders || []).forEach((o: SalesOrder) => {
          const pct = Number(o.advance_percent) || 60;
          const status = String(o.status).toUpperCase();
          const orderTotal = Number(o.total_price) || 1; 
          
          if (status === 'WAITING_ADVANCE') {
              receivableAmount += orderTotal * (pct / 100);
              recCount++;
              pendingSalesAdvancesCount++;
          } else if (status === 'SOLD' || status === 'INSTALLED') {
              receivableAmount += orderTotal * ((100 - pct) / 100);
              recCount++;
          }
      });
      setTotalReceivables(receivableAmount);
      setReceivablesCount(recCount);
      
      const safeOrders = Array.isArray(orders) ? orders : [];
      setAllOrders(safeOrders);

      const sellersMap = new Map();
      safeOrders.forEach(o => {
          if (o.user_id) {
              const name = (o as any).user?.full_name || (o as any).user?.username || `Asesor #${o.user_id}`;
              sellersMap.set(o.user_id.toString(), name);
          }
      });
      setAvailableSellers(Array.from(sellersMap.entries()).map(([id, name]) => ({ id, name })));

      calculateCommissions(safeOrders, selectedSeller);

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

  useEffect(() => {
      calculateCommissions(allOrders, selectedSeller);
  }, [selectedSeller]);

  const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  const getSectionTitle = () => {
    switch(activeSection) {
        case 'TASKS': return 'Centro de Tareas Pendientes';
        case 'BANKS': return 'Catálogo de Bancos y Bóveda';
        case 'RECEIVABLES': return 'Cuentas por Cobrar';
        case 'PAYABLES': return 'Cuentas por Pagar';
        case 'PAYROLL': return 'Centro de Nómina y Destajos';
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

  const getActiveTableData = () => {
      if (activePayrollView === 'GENERATED') {
          return { title: 'A. Comisiones Generadas (Retenidas)', subtitle: 'Esperando cobranza.', list: commissions.generatedList, color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' };
      }
      if (activePayrollView === 'PAID') {
          return { title: 'C. Comisiones Pagadas (Histórico)', subtitle: 'Transferidas al vendedor.', list: commissions.paidList, color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200' };
      }
      return { title: 'B. Comisiones Exigibles (Por Pagar)', subtitle: 'Listas para liquidar en nómina.', list: commissions.payableList, color: 'text-indigo-800', bg: 'bg-indigo-50', border: 'border-indigo-200' };
  };

  const activeTable = getActiveTableData();
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
                  onClick={() => {
                    // ---> CORRECCIÓN: Limpiar TODOS los estados al regresar <---
                    if (cameFromTasks && activeSection === 'RECEIVABLES') {
                        setActiveSection('TASKS');
                        setCameFromTasks(false);
                        setIsSubSectionActive(false);
                    } else {
                        setActiveSection(null); 
                        setSelectedAccountForDetail(null); 
                        setIsSubSectionActive(false); 
                        setActivePayrollView('PAYABLE'); 
                        setSelectedSeller('ALL'); 
                        setPayrollCategory('COMMISSIONS');
                        setCameFromTasks(false);
                    }
                  }}
                  className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
              >
                  <ArrowLeft size={18} /> {cameFromTasks && activeSection === 'RECEIVABLES' ? 'Regresar a Tareas' : 'Regresar al Tablero'}
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
                  <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black transition-colors group-hover:bg-indigo-100 ${getCountSize(commissions.payableCount)}`}>
                      {commissions.payableCount}
                  </div>
                  <div className="ml-16 h-full flex flex-col justify-between pl-2">
                      <div className="flex justify-between items-start">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Nómina</p>
                          <Users size={16} className="text-indigo-500" />
                      </div>
                      <div className="flex justify-end">
                          <div className="text-lg font-black text-indigo-600 tracking-tight leading-none truncate">
                              {formatCurrency(commissions.payable)}
                          </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                          <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Comisiones y Destajos</p>
                          <CheckCircle2 size={14} className="text-indigo-400"/>
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
                  defaultFilter={cameFromTasks ? "ADVANCES" : undefined}
                  onBackOverride={cameFromTasks ? () => { 
                      setIsSubSectionActive(false); // <-- CORRECCIÓN
                      setCameFromTasks(false); 
                      setActiveSection('TASKS'); 
                  } : undefined}
              />
          )}
          
          {activeSection === 'PAYABLES' && <PayablesModule onSubSectionChange={setIsSubSectionActive} />}

          {activeSection === 'PAYROLL' && (
            <div className="space-y-6">
                <div className="flex border-b border-slate-200">
                    <button
                        className={`px-6 py-4 font-black text-sm border-b-2 transition-colors flex items-center gap-2 ${payrollCategory === 'COMMISSIONS' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        onClick={() => setPayrollCategory('COMMISSIONS')}
                    >
                        <Receipt size={16} /> Comisiones (Ventas)
                    </button>
                    <button
                        className={`px-6 py-4 font-black text-sm border-b-2 transition-colors flex items-center gap-2 ${payrollCategory === 'INSTALLATIONS' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        onClick={() => setPayrollCategory('INSTALLATIONS')}
                    >
                        <Wrench size={16} /> Destajos (Instalaciones)
                    </button>
                </div>

                {payrollCategory === 'COMMISSIONS' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Filter className="text-indigo-500" size={18} /> Filtrar Comisiones por Asesor
                            </h3>
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <select 
                                    className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 cursor-pointer shadow-sm"
                                    value={selectedSeller}
                                    onChange={(e) => setSelectedSeller(e.target.value)}
                                >
                                    <option value="ALL">💰 Todos los Asesores</option>
                                    <option disabled>──────────</option>
                                    {availableSellers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card onClick={() => setActivePayrollView('GENERATED')} className={`p-6 border-l-4 border-l-amber-500 cursor-pointer transition-all duration-200 h-32 flex flex-col justify-between ${activePayrollView === 'GENERATED' ? 'bg-amber-50/50 ring-2 ring-amber-400 shadow-md transform scale-[1.02]' : 'bg-white hover:bg-slate-50'}`}>
                                <h4 className="font-bold text-slate-800 flex items-center gap-2"><Lock size={18} className="text-amber-500"/> A. Retenidas</h4>
                                <div className="flex justify-end">
                                    <div className="text-lg font-black text-amber-600 tracking-tight leading-none truncate">{formatCurrency(commissions.generated)}</div>
                                </div>
                            </Card>

                            <Card onClick={() => setActivePayrollView('PAYABLE')} className={`p-6 border-l-4 border-l-indigo-500 cursor-pointer transition-all duration-200 h-32 flex flex-col justify-between ${activePayrollView === 'PAYABLE' ? 'bg-indigo-50/50 ring-2 ring-indigo-400 shadow-md transform scale-[1.02]' : 'bg-white hover:bg-slate-50'}`}>
                                <h4 className="font-bold text-indigo-800 flex items-center gap-2"><Unlock size={18} className="text-indigo-500"/> B. Por Pagar</h4>
                                <div className="flex justify-end">
                                    <div className="text-lg font-black text-indigo-600 tracking-tight leading-none truncate">{formatCurrency(commissions.payable)}</div>
                                </div>
                            </Card>

                            <Card onClick={() => setActivePayrollView('PAID')} className={`p-6 border-l-4 border-l-emerald-500 cursor-pointer transition-all duration-200 h-32 flex flex-col justify-between ${activePayrollView === 'PAID' ? 'bg-emerald-50/50 ring-2 ring-emerald-400 shadow-md transform scale-[1.02]' : 'bg-white hover:bg-slate-50'}`}>
                                <h4 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500"/> C. Pagadas</h4>
                                <div className="flex justify-end">
                                    <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">{formatCurrency(commissions.paid)}</div>
                                </div>
                            </Card>
                        </div>

                        <div className={`rounded-xl shadow-sm border overflow-hidden mt-6 transition-colors duration-300 ${activeTable.border}`}>
                            <div className={`p-4 border-b flex justify-between items-center ${activeTable.bg} ${activeTable.border}`}>
                                <div>
                                    <h3 className={`font-bold flex items-center gap-2 text-sm ${activeTable.color}`}>
                                        <Receipt size={18}/> {activeTable.title}
                                    </h3>
                                    <p className={`text-xs mt-1 font-medium ${activeTable.color} opacity-80`}>{activeTable.subtitle}</p>
                                </div>
                                <Badge variant="outline" className={`bg-white font-bold ${activeTable.color}`}>
                                    {activeTable.list.length} Registros
                                </Badge>
                            </div>
                            
                            {activeTable.list.length === 0 ? (
                                <div className="p-12 text-center text-slate-500 bg-white italic">
                                    No hay registros para este asesor en esta categoría.
                                </div>
                            ) : (
                                <div className="overflow-x-auto bg-white">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                                                <th className="p-4">OV / Proyecto</th>
                                                <th className="p-4">Asesor</th>
                                                <th className="p-4 text-right">Efectivo Ref.</th>
                                                <th className="p-4 text-right font-black text-slate-700">Comisión</th>
                                                <th className="p-4 text-center">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {activeTable.list.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4">
                                                        <p className="font-bold text-slate-800 text-sm">OV-{item.orderId?.toString().padStart(4, '0')} - {item.project}</p>
                                                        <p className="text-xs text-slate-500">{item.folio}</p>
                                                    </td>
                                                    <td className="p-4">
                                                        <Badge variant="outline" className="bg-slate-50 text-slate-600">{item.sellerName}</Badge>
                                                    </td>
                                                    <td className="p-4 text-right font-medium text-slate-500">
                                                        {item.cxcAmount > 0 ? formatCurrency(item.cxcAmount) : '-'}
                                                    </td>
                                                    <td className={`p-4 text-right font-black text-lg ${activePayrollView === 'PAYABLE' ? 'text-indigo-600 bg-indigo-50/30' : activePayrollView === 'GENERATED' ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                        {formatCurrency(item.commAmount)}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <Button 
                                                            variant="outline" size="sm" 
                                                            onClick={() => setSelectedOrderForRayosX(item.rawOrder)}
                                                            className="text-xs text-slate-600 hover:text-slate-900 border-slate-200"
                                                        >
                                                            {activePayrollView === 'PAYABLE' ? 'Pagar --> Rayos X' : 'Ver Rayos X'}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {payrollCategory === 'INSTALLATIONS' && (
                    <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
                        <Wrench size={48} className="mx-auto text-slate-300 mb-4" />
                        <h3 className="text-2xl font-black text-slate-700">Módulo de Destajos en Construcción</h3>
                        <p className="text-slate-500 mt-2 max-w-lg mx-auto font-medium">
                            Aquí nacerá el control de pagos para el equipo de instalación. El sistema cruzará los muebles marcados como "Instalados" en la App de Logística y calculará el destajo a pagarle a cada cuadrilla.
                        </p>
                    </div>
                )}

            </div>
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
              readOnly={!isChecker}
          />
      )}

    </div>
  );
};