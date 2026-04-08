import React, { useState, useEffect } from 'react';
import { ClipboardList, ShoppingCart, Truck, Package, ArrowLeft, ArrowUpRight, Wrench, Search, Target } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import axiosClient from '../../../api/axios-client';
import { useLocation } from 'react-router-dom';

// ---> INYECCIÓN DE LOS MÓDULOS <---
import { RequisitionsModule } from '../components/RequisitionsModule';
import { PurchaseOrdersModule } from '../components/PurchaseOrdersModule';
import InventoryReceptionPage from './InventoryReceptionPage';

type InventorySection = 'REQUISITIONS' | 'PURCHASE_ORDERS' | 'RECEPTIONS' | 'PHYSICAL_INVENTORY' | null;

export const InventoryDashboardPage = () => {
    const [activeSection, setActiveSection] = useState<InventorySection>(null);
    const [isSubSectionActive, setIsSubSectionActive] = useState(false);
    
    // ---> NUEVO: MEMORIA PARA LA SUB-PESTAÑA (EL "FRENO") <---
    const [targetTab, setTargetTab] = useState<string | null>(null);

    const location = useLocation();

    // Escucha si alguien llegó con un pase directo a una sección
    useEffect(() => {
        if (location.state && location.state.openSection) {
            setActiveSection(location.state.openSection as InventorySection);
            
            // Si trae un pase directo a una pestaña interna, lo guardamos
            if (location.state.targetTab) {
                setTargetTab(location.state.targetTab);
            }
            
            // Limpiamos el historial para que si recarga la página no se quede pegado
            window.history.replaceState({}, document.title); 
        }
    }, [location.state]);
    
    // ---> ESTADOS PARA LAS ALERTAS REALES DEL SERVIDOR <---
    const [pendingTasksCount, setPendingTasksCount] = useState<number | string>('...');
    const [purchasingCount, setPurchasingCount] = useState<number | string>('...'); 
    const [receptionsCount, setReceptionsCount] = useState<number | string>('...');

    // ---> LLAMADA AL SERVIDOR PARA LEER LA VERDAD ABSOLUTA <---
    useEffect(() => {
        const fetchDashboardStats = async () => {
            try {
                const [resReqs, resOrdersTransit, resPlanning, resAllOrders] = await Promise.all([
                    axiosClient.get('/purchases/requisitions/'),                
                    axiosClient.get('/purchases/orders/?status=ENVIADA'),       
                    axiosClient.get('/purchases/planning/consolidated'),        
                    axiosClient.get('/purchases/orders/')                       
                ]);
                
                const pendingReqs = resReqs.data.filter((r: any) => r.status === 'PENDIENTE' || r.status === 'EN_COMPRA');
                setPendingTasksCount(pendingReqs.length);
                
                setReceptionsCount(resOrdersTransit.data.length || 0); 
                
                const planningCount = resPlanning.data.length || 0;
                const activeOrdersCount = resAllOrders.data.filter((o: any) => 
                    o.status !== 'RECIBIDA_TOTAL' && o.status !== 'ENVIADA'
                ).length;
                
                setPurchasingCount(planningCount + activeOrdersCount);

            } catch (error) {
                console.error("Error al cargar las métricas del dashboard", error);
                setPendingTasksCount('!');
                setReceptionsCount('!');
                setPurchasingCount('!');
            }
        };

        fetchDashboardStats();
        const intervalId = setInterval(fetchDashboardStats, 15000);
        return () => clearInterval(intervalId);
    }, []);

    const renderActiveSection = (title: string, component: React.ReactNode) => (
        <div className="space-y-6 animate-fadeIn">
            {!isSubSectionActive && (
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">{title}</h2>
                    <button 
                        onClick={() => {
                            setActiveSection(null);
                            setIsSubSectionActive(false);
                            setTargetTab(null); // Limpiamos la sub-pestaña al salir
                        }} 
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
                    >
                        <ArrowLeft size={18} /> Regresar al Tablero
                    </button>
                </div>
            )}
            <div className="mt-2">
                {component}
            </div>
        </div>
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
            
            {!activeSection && (
                <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <Package className="text-slate-600" size={32}/> 
                            Compras y Almacén
                        </h1>
                        <p className="text-slate-500 mt-1 font-medium">Control total de entrada: Requisiciones, Órdenes, Aduana e Inventario.</p>
                    </div>
                </div>
            )}

            {!activeSection ? (
                <div className="flex flex-wrap justify-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
                    {/* ... (Tarjetas Omitidas visualmente aquí por brevedad, el código incluye todas) ... */}
                    {/* TARJETA 1 */}
                    <div className="w-full md:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] relative h-40">
                        <Card onClick={() => setActiveSection('REQUISITIONS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black text-3xl transition-colors group-hover:bg-indigo-100">{pendingTasksCount}</div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">1. Requisiciones</p><ClipboardList size={16} className="text-indigo-500" /></div>
                                <div className="mt-4 flex justify-end"><div className="text-2xl font-black text-indigo-600 tracking-tight">Pendientes</div></div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase">Lo que pide la fábrica</p><ArrowUpRight size={14} className="text-indigo-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 2 */}
                    <div className="w-full md:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] relative h-40">
                        <Card onClick={() => setActiveSection('PURCHASE_ORDERS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black text-3xl transition-colors group-hover:bg-emerald-100">{purchasingCount}</div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Compras</p><ShoppingCart size={16} className="text-emerald-500" /></div>
                                <div className="mt-4 flex justify-end"><div className="text-2xl font-black text-emerald-600 tracking-tight">Cotizar</div></div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase">Motor de Abastecimiento</p><Wrench size={14} className="text-emerald-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 3 */}
                    <div className="w-full md:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] relative h-40">
                        <Card onClick={() => setActiveSection('RECEPTIONS')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-blue-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-blue-50 text-blue-700 border-r border-blue-100 font-black text-3xl transition-colors group-hover:bg-blue-100">{receptionsCount}</div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">3. Recepción</p><Truck size={16} className="text-blue-500" /></div>
                                <div className="mt-4 flex justify-end"><div className="text-2xl font-black text-blue-600 tracking-tight">En Tránsito</div></div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase">La Aduana de Entrada</p><Target size={14} className="text-blue-400"/></div>
                            </div>
                        </Card>
                    </div>

                    {/* TARJETA 4 */}
                    <div className="w-full md:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] relative h-40">
                        <Card onClick={() => setActiveSection('PHYSICAL_INVENTORY')} className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-orange-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group">
                            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-orange-50 text-orange-700 border-r border-orange-100 font-black text-3xl transition-colors group-hover:bg-orange-100">$</div>
                            <div className="ml-16 h-full flex flex-col justify-between">
                                <div className="flex justify-between items-start"><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">4. Inventario</p><Package size={16} className="text-orange-500" /></div>
                                <div className="mt-4 flex justify-end"><div className="text-2xl font-black text-orange-600 tracking-tight flex items-baseline gap-1">1.2M <span className="text-sm font-bold text-orange-400 uppercase">Valuación</span></div></div>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase">El dinero dormido</p><Target size={14} className="text-orange-400"/></div>
                            </div>
                        </Card>
                    </div>

                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500 mt-2">
                    {activeSection === 'REQUISITIONS' && renderActiveSection('Módulo de Requisiciones', 
                        <RequisitionsModule onSubSectionChange={(active) => setIsSubSectionActive(active)} />
                    )}
                    
                    {/* AQUÍ INYECTAMOS EL targetTab AL MÓDULO DE COMPRAS */}
                    {activeSection === 'PURCHASE_ORDERS' && renderActiveSection('Órdenes de Compra', 
                        <PurchaseOrdersModule 
                            onSubSectionChange={(active) => setIsSubSectionActive(active)} 
                            targetTab={targetTab} 
                        />
                    )}
                    
                    {activeSection === 'RECEPTIONS' && renderActiveSection('Recepción y Match a 3 Vías', 
                        <InventoryReceptionPage />
                    )}
                    
                    {activeSection === 'PHYSICAL_INVENTORY' && renderActiveSection('Inventario Físico', 
                        <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-xl border-dashed">🚧 Módulo en construcción</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default InventoryDashboardPage;