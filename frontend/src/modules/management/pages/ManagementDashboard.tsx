import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { 
    Wallet, Coins, Layers, Scale, Factory, 
    ArrowUpRight, ArrowDownRight, Clock, AlertTriangle, 
    CheckCircle2, AlertOctagon, TrendingUp, TrendingDown,
    Wrench, BarChart3, Target, ArrowLeft,
    CheckSquare, ShieldAlert, ThumbsUp, Users,
    Landmark, Plus 
} from 'lucide-react';

import { Card } from '../../../components/ui/card';

// --- SERVICIOS ---
import { financeService } from '../../../api/finance-service';
import { salesService } from '../../../api/sales-service';
import { treasuryService } from '../../../api/treasury-service';

// --- TIPOS ---
import { BankAccount } from '../../../types/treasury';

// --- COMPONENTES COMPARTIDOS INDEPENDIENTES ---
import { ReceivablesModule } from '../../finance/components/ReceivablesModule';
import { PayablesModule } from '../../finance/components/PayablesModule';

// --- COMPONENTES BANCARIOS ---
import { BankAccountCard } from '../../treasury/components/BankAccountCard';
import { CreateAccountModal } from '../../treasury/components/CreateAccountModal';
import { TransactionModal } from '../../treasury/components/TransactionModal';
import { AccountDetail } from '../../treasury/components/AccountDetail';

type DashboardSection = 'BANKS' | 'PAYABLES' | 'RECEIVABLES' | 'INSTANCES' | 'PROFITABILITY' | 'EFFICIENCY' | null;

const ManagementDashboard: React.FC = () => {
    const location = useLocation();

    // --- ESTADOS REALES ---
    const [totalPayables, setTotalPayables] = useState(0);
    const [payablesCount, setPayablesCount] = useState(0); 
    const [totalReceivables, setTotalReceivables] = useState(0);
    const [receivablesCount, setReceivablesCount] = useState(0);
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [totalBankBalance, setTotalBankBalance] = useState(0);
    
    const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<BankAccount | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [transactionType, setTransactionType] = useState<'IN' | 'OUT'>('IN');

    // --- ESTADOS MOCK ---
    const [mockInstances] = useState(24);
    const [mockProfitability] = useState(32.4); 
    const [mockCostPerBoard] = useState(415.50); 

    const [activeSection, setActiveSection] = useState<DashboardSection>(null);
    const [isSubSectionActive, setIsSubSectionActive] = useState(false);

    useEffect(() => {
        loadData();
        if (location.state && location.state.openSection) {
            setActiveSection(location.state.openSection as DashboardSection);
            window.history.replaceState({}, document.title); 
        }
        const intervalId = setInterval(loadData, 30000);
        return () => clearInterval(intervalId);
    }, [location.state]);

    const loadData = async () => {
        try {
            const [apStats, allQuotes, accs] = await Promise.all([
                financeService.getPayableDashboardStats(),
                salesService.getOrders(),
                treasuryService.getAccounts() 
            ]);

            if (apStats) {
                const debt = (apStats.overdue_amount || 0) + (apStats.next_period_amount || 0) + (apStats.future_amount || 0);
                setTotalPayables(debt);
                setPayablesCount(debt > 0 ? 12 : 0); 
            }
            
            let receivableAmount = 0;
            let recCount = 0;
            (allQuotes || []).forEach((o: any) => {
                const pct = Number(o.advance_percent) || 60;
                const status = String(o.status).toUpperCase();
                if (status === 'WAITING_ADVANCE') { receivableAmount += (o.total_price || 0) * (pct / 100); recCount++; } 
                else if (status === 'SOLD' || status === 'INSTALLED') { receivableAmount += (o.total_price || 0) * ((100 - pct) / 100); recCount++; }
            });
            setTotalReceivables(receivableAmount);
            setReceivablesCount(recCount);

            if (accs) {
                setAccounts(accs);
                setTotalBankBalance(accs.reduce((sum: number, acc: BankAccount) => sum + (acc.current_balance || 0), 0));
            }
        } catch (error) {
            console.error("Error cargando datos:", error);
        }
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const getSectionTitle = () => {
        switch(activeSection) {
            case 'BANKS': return 'Catálogo de Bancos y Bóveda';
            case 'PAYABLES': return 'Módulo de Pagos';
            case 'RECEIVABLES': return 'Módulo de Cobranza';
            case 'INSTANCES': return 'Control de Instancias';
            case 'PROFITABILITY': return 'Rentabilidad Real';
            case 'EFFICIENCY': return 'Eficiencia de Fábrica';
            default: return 'Gerencia Operativa';
        }
    };

    const handleCloseSection = () => {
        setActiveSection(null);
        setIsSubSectionActive(false); 
        setSelectedAccountForDetail(null);
    };

    // ---> SASTRE DE TIPOGRAFÍA (Ajusta el tamaño del número de documentos al vuelo) <---
    const getCountSize = (count: number) => {
        const len = count.toString().length;
        if (len > 3) return 'text-xl';
        if (len === 3) return 'text-2xl';
        return 'text-3xl';
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-6 animate-fadeIn">
            
            {!isSubSectionActive && (
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">{getSectionTitle()}</h1>
                        <p className="text-slate-500 mt-1 font-medium">
                            {activeSection === null ? 'Control Maestro: Flujo de Efectivo, Rentabilidad y Eficiencia Operativa.' : 'Gestión detallada y ejecución.'}
                        </p>
                    </div>
                    {activeSection !== null && (
                        <button onClick={handleCloseSection} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm">
                            <ArrowLeft size={18} /> Regresar al Tablero
                        </button>
                    )}
                </div>
            )}

            {/* VISTA 1: EL TABLERO PRINCIPAL SIMÉTRICO */}
            {activeSection === null && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
                    
                    {/* TARJETA 1: BÓVEDA */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => setActiveSection('BANKS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-slate-800 transform hover:-translate-y-1 h-full bg-white overflow-hidden group flex flex-col justify-between">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black transition-colors group-hover:bg-slate-100 ${getCountSize(accounts.length)}`}>{accounts.length}</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">1. Bóveda</p><Landmark size={16} className="text-slate-800" /></div>
                                <div className="flex justify-end"><div className="text-lg font-black text-slate-800 tracking-tight leading-none truncate">{formatCurrency(totalBankBalance)}</div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Saldo Actual</p><Wallet size={14} className="text-slate-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 2: TESORERÍA */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => setActiveSection('PAYABLES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-red-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group flex flex-col justify-between">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-red-50 text-red-700 border-r border-red-100 font-black transition-colors group-hover:bg-red-100 ${getCountSize(payablesCount)}`}>{payablesCount}</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Tesorería y Pagos</p><Wallet size={16} className="text-red-500" /></div>
                                <div className="flex justify-end"><div className="text-lg font-black text-red-600 tracking-tight leading-none truncate">{formatCurrency(totalPayables)}</div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Pendiente Total</p><ArrowUpRight size={14} className="text-red-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 3: COBRANZA */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => setActiveSection('RECEIVABLES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group flex flex-col justify-between">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black transition-colors group-hover:bg-emerald-100 ${getCountSize(receivablesCount)}`}>{receivablesCount}</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">3. Cobranza Viva</p><Coins size={16} className="text-emerald-500" /></div>
                                <div className="flex justify-end"><div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">{formatCurrency(totalReceivables)}</div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Anticipos y Finiquitos</p><ArrowDownRight size={14} className="text-emerald-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 4: INSTANCIAS */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => setActiveSection('INSTANCES')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-blue-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group flex flex-col justify-between">
                            <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black transition-colors group-hover:bg-blue-100 ${getCountSize(mockInstances)}`}>{mockInstances}</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Instancias</p><Layers size={16} className="text-blue-500" /></div>
                                <div className="flex justify-end"><div className="text-lg font-black text-blue-600 tracking-tight leading-none truncate mt-2">Auditoría Viva</div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Físico vs Financiero</p><Wrench size={14} className="text-blue-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 5: RENTABILIDAD */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => setActiveSection('PROFITABILITY')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-amber-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group flex flex-col justify-between">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black text-3xl transition-colors group-hover:bg-amber-100">%</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">5. Rentabilidad</p><Scale size={16} className="text-amber-500" /></div>
                                <div className="flex justify-end"><div className="text-lg font-black text-amber-600 tracking-tight leading-none truncate flex items-baseline gap-1">{mockProfitability}<span className="text-sm font-bold text-amber-400 uppercase">MARGEN</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Utilidad Real Promedio</p><BarChart3 size={14} className="text-amber-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 6: EFICIENCIA */}
                    <div className="w-full relative h-40">
                        <Card onClick={() => setActiveSection('EFFICIENCY')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-slate-700 transform hover:-translate-y-1 h-full bg-white overflow-hidden group flex flex-col justify-between">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-100 text-slate-700 border-r border-slate-200 font-black text-3xl transition-colors group-hover:bg-slate-200">$</div>
                            <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">6. Eficiencia Fábrica</p><Factory size={16} className="text-slate-700" /></div>
                                <div className="flex justify-end"><div className="text-lg font-black text-slate-800 tracking-tight leading-none truncate flex items-baseline gap-1">{mockCostPerBoard.toFixed(2)}<span className="text-sm font-bold text-slate-400 uppercase">/ TABLERO</span></div></div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase truncate">Costo Procesamiento</p><Target size={14} className="text-slate-400"/></div>
                            </div>
                        </Card>
                    </div>

                </div>
            )}

            {/* VISTA 2: LOS COMPONENTES INDEPENDIENTES */}
            {activeSection !== null && (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500 mt-2">

                    {activeSection === 'BANKS' && (
                        <div>
                            {selectedAccountForDetail ? (
                                <AccountDetail 
                                    account={selectedAccountForDetail} 
                                    onBack={() => setSelectedAccountForDetail(null)} 
                                    onOpenTransaction={(type) => { setTransactionType(type); setIsTransactionModalOpen(true); }} 
                                />
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                                            <Landmark className="text-slate-500"/> Cuentas Autorizadas
                                        </h3>
                                        <button 
                                            onClick={() => setIsCreateModalOpen(true)} 
                                            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={16} /> Nueva Cuenta
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {accounts.map((account) => (
                                            <BankAccountCard key={account.id} account={account} onClick={setSelectedAccountForDetail} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeSection === 'PAYABLES' && <PayablesModule onSubSectionChange={setIsSubSectionActive} />}
                    {activeSection === 'RECEIVABLES' && <ReceivablesModule onSubSectionChange={setIsSubSectionActive} />}

                    {activeSection === 'INSTANCES' && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 border-b border-slate-200 pb-2"><Layers className="text-blue-500"/> Auditoría Física de Proyectos</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="w-full relative h-40">
                                    <Card className="p-6 border-l-4 border-l-blue-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between">
                                        <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black ${getCountSize(12)}`}>12</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div><h4 className="font-bold text-blue-800 flex items-center gap-2"><Factory size={18}/> A. En Producción</h4></div>
                                            <div className="text-lg font-black text-blue-600 text-right tracking-tight">Activas</div>
                                        </div>
                                    </Card>
                                </div>
                                <div className="w-full relative h-40">
                                    <Card className="p-6 border-l-4 border-l-orange-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between">
                                        <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-orange-50 text-orange-700 border-r border-orange-100 font-black ${getCountSize(5)}`}>5</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div><h4 className="font-bold text-orange-800 flex items-center gap-2"><AlertOctagon size={18}/> B. Instalado</h4></div>
                                            <div className="text-lg font-black text-orange-600 text-right tracking-tight">Riesgo</div>
                                        </div>
                                    </Card>
                                </div>
                                <div className="w-full relative h-40">
                                    <Card className="p-6 border-l-4 border-l-emerald-500 bg-white relative overflow-hidden group h-full flex flex-col justify-between">
                                        <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black ${getCountSize(7)}`}>7</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div><h4 className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle2 size={18}/> C. Terminado</h4></div>
                                            <div className="text-lg font-black text-emerald-600 text-right tracking-tight">Garantías</div>
                                        </div>
                                    </Card>
                                </div>
                                <div className="w-full relative h-40">
                                    <Card className="p-6 border-l-4 border-l-slate-800 bg-white relative overflow-hidden group h-full flex flex-col justify-between">
                                        <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-100 text-slate-700 border-r border-slate-200 font-black ${getCountSize(148)}`}>148</div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div><h4 className="font-bold text-slate-800 flex items-center gap-2"><CheckSquare size={18}/> D. Finalizadas</h4></div>
                                            <div className="text-lg font-black text-slate-800 text-right tracking-tight">Histórico</div>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === 'PROFITABILITY' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="p-6 border-l-4 border-l-red-500 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-red-800 flex items-center gap-2"><ShieldAlert size={18} className="text-red-500"/> A. Costo No Calidad</h4></div>
                                <div className="text-lg font-black text-red-600 text-right tracking-tight">-$4,200.00</div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-orange-500 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-orange-800 flex items-center gap-2"><TrendingDown size={18} className="text-orange-500"/> B. Desviación Compras</h4></div>
                                <div className="text-lg font-black text-orange-600 text-right tracking-tight">-$1,150.00</div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-emerald-500 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-emerald-800 flex items-center gap-2"><ThumbsUp size={18} className="text-emerald-500"/> C. Héroes y Villanos</h4></div>
                                <div className="space-y-2 text-sm border-t border-slate-100 pt-2"><div className="flex justify-between items-center"><span className="text-emerald-600 font-bold truncate">OV-102 Cocina</span><span className="font-black text-slate-800">42%</span></div><div className="flex justify-between items-center"><span className="text-red-600 font-bold truncate">OV-089 Clósets</span><span className="font-black text-slate-800">12%</span></div></div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-indigo-500 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-indigo-800 flex items-center gap-2"><Scale size={18} className="text-indigo-500"/> D. Teórica vs Real</h4></div>
                                <div className="flex items-end justify-end gap-3 text-lg font-black text-indigo-600 tracking-tight">32.4% <span className="text-sm font-bold text-slate-400">vs 35%</span></div>
                            </Card>
                        </div>
                    )}

                    {activeSection === 'EFFICIENCY' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="p-6 border-l-4 border-l-slate-700 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-slate-800 flex items-center gap-2"><Layers size={18} className="text-slate-600"/> A. Transformación</h4></div>
                                <div className="text-lg font-black text-slate-700 text-right tracking-tight">240 <span className="text-sm font-normal text-slate-400">Hojas</span></div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-blue-500 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-blue-800 flex items-center gap-2"><Users size={18} className="text-blue-500"/> B. Nómina x Tablero</h4></div>
                                <div className="text-lg font-black text-blue-600 text-right tracking-tight">$210 <span className="text-sm font-normal text-slate-400">/ Tablero</span></div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-indigo-500 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-indigo-800 flex items-center gap-2"><BarChart3 size={18} className="text-indigo-500"/> C. OPEX x Tablero</h4></div>
                                <div className="text-lg font-black text-indigo-600 text-right tracking-tight">$205 <span className="text-sm font-normal text-slate-400">/ Tablero</span></div>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-red-500 bg-white flex flex-col justify-between h-40">
                                <div><h4 className="font-bold text-red-800 flex items-center gap-2"><AlertOctagon size={18} className="text-red-500"/> D. Merma Real</h4></div>
                                <div className="text-lg font-black text-red-600 text-right tracking-tight">14% <span className="text-sm font-normal text-red-400">vs 8%</span></div>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* MODALES BANCARIOS */}
            {activeSection === 'BANKS' && (
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
                                treasuryService.getAccounts().then(accs => { 
                                    const updated = accs.find(a => a.id === selectedAccountForDetail.id); 
                                    if (updated) setSelectedAccountForDetail(updated); 
                                }); 
                            } 
                        }}
                        accounts={accounts} 
                        selectedAccountId={selectedAccountForDetail?.id} 
                        initialType={transactionType} 
                    />
                </>
            )}
        </div>
    );
};

export default ManagementDashboard;