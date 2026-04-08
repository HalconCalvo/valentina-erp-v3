import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; 
import { useDesign } from '../hooks/useDesign';
import { useClients } from '../../foundations/hooks/useClients'; 
import { 
    Edit, Trash2, Plus, Search, 
    ChevronDown, ChevronRight, Layers, 
    FileText, AlertCircle, CheckCircle2,
    Paperclip, X, FileMinus, Lock,
    Tag, ArrowLeft, Calculator, Printer, ShieldAlert
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import ExportButton from '@/components/ui/ExportButton';

import { designService } from '../../../api/design-service';
import { productionService } from '../../../api/production-service';
import { VersionStatus } from '../../../types/design';

type ModuleView = 'HOME' | 'CATALOG' | 'DEFICIT' | 'PRINTING';

const DesignCatalogPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation(); 
    
    // --- ESTADO DE VISTA MAESTRA ---
    const [currentView, setCurrentView] = useState<ModuleView>('HOME');

    // --- SEGURIDAD ---
    const [userRole, setUserRole] = useState('ADMIN');
    
    // --- KPIs PARA LAS TARJETAS ---
    const [pendingInstancesCount, setPendingInstancesCount] = useState(0);
    const [amberBatchesCount, setAmberBatchesCount] = useState(0);
    const [activeBatchesCount, setActiveBatchesCount] = useState(0);

    useEffect(() => {
        const role = (localStorage.getItem('user_role') || 'ADMIN').toUpperCase();
        setUserRole(role);
        loadDashboardMetrics();
    }, []);

    const isSales = userRole === 'SALES';

    const { masters, loading, error, loadMasters, addMaster, updateMaster, deleteMaster } = useDesign();
    const { clients, fetchClients } = useClients();
    
    // UI State Catálogo
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
    const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingId, setUploadingId] = useState<number | null>(null);
    const [viewingBlueprintUrl, setViewingBlueprintUrl] = useState<string | null>(null);

    const [formState, setFormState] = useState({ name: '', category: 'General', client_id: 0 });

    useEffect(() => { loadMasters(); fetchClients(); }, [loadMasters, fetchClients]);

    useEffect(() => {
        if (clients.length > 0 && masters.length > 0 && expandedClients.size === 0) {
            const allIds = new Set(clients.map(c => c.id));
            setExpandedClients(allIds);
        }
    }, [clients.length, masters.length]);

    const loadDashboardMetrics = async () => {
        try {
            const pending = await designService.getPendingInstances();
            setPendingInstancesCount(pending.length);

            const batches = await productionService.getBatches();
            setAmberBatchesCount(batches.filter(b => b.status === 'AMBAR').length);
            setActiveBatchesCount(batches.filter(b => b.status === 'EN_PRODUCCION' || b.status === 'TERMINADO').length);
        } catch (err) {
            console.error("Error cargando métricas", err);
        }
    };

    const getClientName = (id: number) => clients.find(c => c.id === id)?.full_name || 'Stock Interno';
    
    const mapMastersForExcel = (m: any) => ({
        "ID Sistema": m.id, "Producto": m.name, "Categoría": m.category, "Cliente": getClientName(m.client_id),
        "Tiene Plano": m.blueprint_path ? 'SÍ' : 'NO', "Versiones Activas": m.versions ? m.versions.length : 0
    });

    const handleUploadClick = (masterId: number) => {
        if(isSales) return;
        setUploadingId(masterId);
        setTimeout(() => { if (fileInputRef.current) fileInputRef.current.click(); }, 50);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file || !uploadingId) return;
        try { await designService.uploadBlueprint(uploadingId, file); alert("✅ Plano adjuntado."); await loadMasters(); } 
        catch (error) { console.error(error); alert("Error al subir."); } 
        finally { if (fileInputRef.current) fileInputRef.current.value = ''; setUploadingId(null); }
    };

    const handleViewBlueprint = (path: string) => setViewingBlueprintUrl(path); 
    const closeBlueprintModal = () => setViewingBlueprintUrl(null);

    const handleDeleteBlueprint = async (e: React.MouseEvent, masterId: number) => {
        e.stopPropagation();
        if(isSales) return;
        if (window.confirm("¿Eliminar plano?")) {
            try { await designService.deleteBlueprint(masterId); await loadMasters(); } catch (error) { alert("Error."); }
        }
    };

    const uniqueCategories = useMemo(() => {
        const cats = new Set<string>(["Cocinas", "Closets", "Baños", "General"]);
        masters.forEach(m => { if (m.category) cats.add(m.category.trim()); });
        return Array.from(cats).sort();
    }, [masters]);

    const filteredCategories = useMemo(() => {
        if (!formState.category) return uniqueCategories;
        return uniqueCategories.filter(c => c.toLowerCase().includes(formState.category.toLowerCase()));
    }, [uniqueCategories, formState.category]);

    const groupedProducts = useMemo(() => {
        const filtered = masters.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()));
        const groups: Record<number, Record<string, typeof masters>> = {};
        filtered.forEach(p => {
            const cid = p.client_id; const cat = p.category || "General";
            if (!groups[cid]) groups[cid] = {}; if (!groups[cid][cat]) groups[cid][cat] = [];
            groups[cid][cat].push(p);
        });
        return groups;
    }, [masters, searchTerm]);

    const toggleClient = (clientId: number) => {
        const newExpanded = new Set(expandedClients);
        if (newExpanded.has(clientId)) newExpanded.delete(clientId); else newExpanded.add(clientId);
        setExpandedClients(newExpanded);
    };

    const openCreateModal = () => {
        if(isSales) return;
        fetchClients(); setIsEditing(false); setFormState({ name: '', category: '', client_id: 0 });
        setCurrentId(null); setIsModalOpen(true); setShowCategorySuggestions(false);
    };

    const openEditModal = (e: React.MouseEvent, item: any) => {
        e.stopPropagation(); if(isSales) return;
        fetchClients(); setIsEditing(true); setCurrentId(item.id);
        setFormState({ name: item.name, category: item.category, client_id: item.client_id || 0 });
        setIsModalOpen(true); setShowCategorySuggestions(false);
    };

    useEffect(() => {
        if (location.state) {
            const state = location.state as any;
            if (state.openNewModal) {
                setCurrentView('CATALOG');
                openCreateModal();
                window.history.replaceState({}, document.title);
            } else if (state.returnTo === 'CATALOG') {
                // Si recibe la señal de regresar, abre directo el catálogo
                setCurrentView('CATALOG');
                window.history.replaceState({}, document.title);
            }
        }
    }, [location.state]);

    const handleDelete = async (e: React.MouseEvent, id: number, productName: string) => {
        e.stopPropagation(); 
        if(isSales) return;
        const confirmacion = window.prompt(`⚠ ALERTA CRÍTICA: BORRADO EN CASCADA ⚠\n\nEstás a punto de eliminar "${productName}".\nPara confirmar, escribe: ELIMINAR`);
        if (confirmacion === "ELIMINAR") { 
            try { await deleteMaster(id); alert("✅ Producto eliminado."); } 
            catch (err) { alert("Error al eliminar."); } 
        }
    };

    const handleOpenProduct = async (masterId: number, versions: any[]) => {
        if (isSales) { alert("🔒 Acceso Restringido."); return; }
        if (versions && versions.length > 0) navigate(`/design/versions/${versions[0].id}`);
        else {
            try {
                const newVersion = await designService.createVersion({ master_id: masterId, version_name: "V1.0", status: VersionStatus.DRAFT, is_active: true, components: [] });
                await loadMasters(); navigate(`/design/versions/${newVersion.id}`);
            } catch { alert("Error."); }
        }
    };

    const handleSave = async () => {
        if (!formState.name || !formState.client_id) return;
        try {
            if (isEditing && currentId) await updateMaster(currentId, { ...formState, category: formState.category || "General", client_id: Number(formState.client_id) });
            else await addMaster({ ...formState, category: formState.category || "General", client_id: Number(formState.client_id), is_active: true });
            setIsModalOpen(false);
        } catch (e) { console.error(e); }
    };

    const totalDrafts = masters.filter(m => m.versions?.[0]?.status === VersionStatus.DRAFT || !m.versions?.length).length;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-300">
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileChange} />

            {/* =========================================
                VISTA 1: HOME (SOLO LAS 4 TARJETAS)
            ========================================= */}
            {currentView === 'HOME' && (
                <>
                    <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                                Diseño e Ingeniería
                                {isSales && <Badge className="bg-slate-100 text-slate-600 border-slate-200 mt-1"><Lock size={12} className="mr-1"/> LECTURA</Badge>}
                            </h1>
                            <p className="text-slate-500 mt-1">El Cerebro Técnico de la Empresa. Orquestación, desarrollo y control de manufactura.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-4">
                        {/* Tarjeta 1: Catálogo */}
                        <Card onClick={() => setCurrentView('CATALOG')} className="p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-indigo-500 transform hover:-translate-y-1 bg-white shadow-sm h-full">
                            <div className="flex justify-between items-start">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Módulo 1</p>
                                <Layers size={14} className="text-indigo-500" />
                            </div>
                            <div className="mt-1 flex flex-col h-[80px] justify-between">
                                <h3 className="text-xl font-bold text-slate-700 leading-tight">Catálogo de<br/>Ingeniería</h3>
                                <div className="flex justify-between items-end w-full">
                                    <p className="text-[10px] text-slate-400">El Génesis de Recetas</p>
                                    <div className="text-xl font-black text-indigo-600/30">{totalDrafts}</div>
                                </div>
                            </div>
                        </Card>

                        {/* Tarjeta 2: Simulador */}
                        <Card onClick={() => navigate('/design/simulator')} className="p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-blue-500 transform hover:-translate-y-1 bg-white shadow-sm h-full">
                            <div className="flex justify-between items-start">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Módulo 2</p>
                                <Calculator size={14} className="text-blue-500" />
                            </div>
                            <div className="mt-1 flex flex-col h-[80px] justify-between">
                                <h3 className="text-xl font-bold text-slate-700 leading-tight">Simulador y<br/>Lotificación</h3>
                                <div className="flex justify-between items-end w-full">
                                    <p className="text-[10px] text-slate-400">Puente a Fábrica</p>
                                    <div className="text-xl font-black text-blue-600/30">{pendingInstancesCount}</div>
                                </div>
                            </div>
                        </Card>

                        {/* Tarjeta 3: Déficit y Mermas */}
                        <Card onClick={() => setCurrentView('DEFICIT')} className="p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-orange-500 transform hover:-translate-y-1 bg-white shadow-sm h-full">
                            <div className="flex justify-between items-start">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Módulo 3</p>
                                <ShieldAlert size={14} className="text-orange-500" />
                            </div>
                            <div className="mt-1 flex flex-col h-[80px] justify-between">
                                <h3 className="text-xl font-bold text-slate-700 leading-tight">Control de<br/>Déficit y Mermas</h3>
                                <div className="flex justify-between items-end w-full">
                                    <p className="text-[10px] text-slate-400">Puente a Compras</p>
                                    <div className="text-xl font-black text-orange-600/30">{amberBatchesCount}</div>
                                </div>
                            </div>
                        </Card>

                        {/* Tarjeta 4: Centro de Impresión */}
                        <Card onClick={() => setCurrentView('PRINTING')} className="p-4 cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 bg-white shadow-sm h-full">
                            <div className="flex justify-between items-start">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Módulo 4</p>
                                <Printer size={14} className="text-emerald-500" />
                            </div>
                            <div className="mt-1 flex flex-col h-[80px] justify-between">
                                <h3 className="text-xl font-bold text-slate-700 leading-tight">Centro de<br/>Impresión</h3>
                                <div className="flex justify-between items-end w-full">
                                    <p className="text-[10px] text-slate-400">Control de Piso</p>
                                    <div className="text-xl font-black text-emerald-600/30">{activeBatchesCount}</div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </>
            )}

            {/* =========================================
                VISTA 2: SUBMÓDULOS ACTIVOS
            ========================================= */}
            {currentView !== 'HOME' && (
                <div className="animate-in slide-in-from-right-8 duration-300">
                    
                    {/* BOTÓN REGRESAR GENERAL */}
                    <button 
                        onClick={() => setCurrentView('HOME')}
                        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold transition-colors mb-6 bg-indigo-50 px-4 py-2 rounded-lg w-fit"
                    >
                        <ArrowLeft size={18} /> Regresar al Panel Principal
                    </button>

                    {/* --- MÓDULO 1: CATÁLOGO --- */}
                    {currentView === 'CATALOG' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                        <Layers className="text-indigo-500"/> Catálogo de Ingeniería
                                    </h2>
                                    <p className="text-slate-500 text-sm mt-1">Gestión de productos base, explosión de materiales y repositorio de planos.</p>
                                </div>
                                <div className="flex gap-3 items-center">
                                    <ExportButton data={masters} fileName="Catalogo_Productos" mapping={mapMastersForExcel} label="Exportar"/>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input type="text" placeholder="Buscar producto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-indigo-500 shadow-sm"/>
                                    </div>
                                    {!isSales && (
                                        <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                                            <Plus size={16} className="mr-1" /> Nuevo Producto
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {error && <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 shadow-sm"><AlertCircle size={16} className="inline mr-2"/> {error}</div>}

                            {!loading && Object.keys(groupedProducts).length === 0 && (
                                <div className="text-center py-24 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm">
                                    <Layers size={40} className="mx-auto text-slate-300 mb-3"/>
                                    <h3 className="text-sm font-medium text-slate-900">No hay productos en el catálogo</h3>
                                </div>
                            )}

                            {Object.entries(groupedProducts).map(([clientIdStr, categories]) => {
                                const clientId = Number(clientIdStr);
                                const clientName = getClientName(clientId);
                                const isExpanded = expandedClients.has(clientId);
                                const productCount = Object.values(categories).reduce((acc, list) => acc + list.length, 0);

                                return (
                                    <div key={clientId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                                        <div onClick={() => toggleClient(clientId)} className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors">
                                            <h3 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                                                {isExpanded ? <ChevronDown size={20} className="text-slate-500"/> : <ChevronRight size={20} className="text-slate-500"/>}
                                                {clientName}
                                            </h3>
                                            <Badge variant="default" className="bg-slate-200 text-slate-700 hover:bg-slate-300">{productCount} Productos</Badge>
                                        </div>

                                        {isExpanded && (
                                            <div className="overflow-x-auto">
                                                {Object.entries(categories).map(([categoryName, categoryProducts]) => (
                                                    <div key={categoryName} className="mb-0">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-200">
                                                                <tr>
                                                                    <th className="px-6 py-3 w-[40%] flex items-center gap-2"><Tag size={14}/> {categoryName}</th>
                                                                    <th className="px-6 py-3 text-center w-[15%]">Estado</th>
                                                                    <th className="px-6 py-3 w-[20%]">Versión Activa</th>
                                                                    <th className="px-6 py-3 text-center w-[25%]">Acciones</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {categoryProducts.flatMap((product: any) => {
                                                                    const versions = product.versions && product.versions.length > 0 ? product.versions : [null];
                                                                    return versions.map((v: any) => {
                                                                        const isReady = v?.status === VersionStatus.READY;
                                                                        const rowKey = `${product.id}-${v ? v.id : 'empty'}`;

                                                                        return (
                                                                            <tr key={rowKey} className="bg-white hover:bg-slate-50 transition-colors">
                                                                                <td className="px-6 py-4">
                                                                                    <div className={`font-bold text-slate-800 flex items-center gap-2 ${isSales ? 'cursor-default' : 'hover:text-indigo-600 cursor-pointer'}`} onClick={() => handleOpenProduct(product.id, v ? [v] : [])}>
                                                                                        {product.name}
                                                                                    </div>
                                                                                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs mt-1 inline-block">
                                                                                        SKU: PRD-{product.id.toString().padStart(4, '0')} {v ? `- V${v.id}` : ''}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-6 py-4 text-center">
                                                                                    {v ? (
                                                                                        isReady ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100"><CheckCircle2 size={10} className="inline mr-1"/>Listo</span> : 
                                                                                                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full border border-orange-100"><AlertCircle size={10} className="inline mr-1"/>Borrador</span>
                                                                                    ) : (<span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">Vacío</span>)}
                                                                                </td>
                                                                                <td className="px-6 py-4 text-slate-500">
                                                                                    {v ? <span className={`font-mono px-2 py-1 rounded text-xs border ${isReady ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{v.version_name}</span> : <span className="text-xs text-slate-400 italic">Pendiente</span>}
                                                                                </td>
                                                                                <td className="px-6 py-4 text-center">
                                                                                    <div className="flex items-center justify-center gap-2">
                                                                                        {product.blueprint_path ? (
                                                                                            <>
                                                                                                <button onClick={(e) => { e.stopPropagation(); handleViewBlueprint(product.blueprint_path!); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="Ver Plano"><FileText size={16}/></button>
                                                                                                {!isSales && <button onClick={(e) => handleDeleteBlueprint(e, product.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Quitar Plano"><FileMinus size={16}/></button>}
                                                                                            </>
                                                                                        ) : (
                                                                                            !isSales ? <button onClick={(e) => { e.stopPropagation(); handleUploadClick(product.id); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Adjuntar Plano"><Paperclip size={16}/></button> : null
                                                                                        )}
                                                                                        {!isSales && (
                                                                                            <>
                                                                                                <div className="w-px h-4 bg-slate-200 mx-1"></div>
                                                                                                <button onClick={(e) => openEditModal(e, product)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Editar Nombre"><Edit size={16}/></button>
                                                                                                <button onClick={(e) => handleDelete(e, product.id, product.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar"><Trash2 size={16}/></button>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    });
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* --- MÓDULO 3: DÉFICIT --- */}
                    {currentView === 'DEFICIT' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                        <ShieldAlert className="text-orange-500"/> Control de Déficit y Mermas
                                    </h2>
                                    <p className="text-slate-500 text-sm mt-1">Requisiciones a Compras y buzón de reposición de mermas físicas.</p>
                                </div>
                            </div>
                            <Card className="p-12 text-center bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                                <ShieldAlert size={48} className="text-orange-300 mb-4"/>
                                <h3 className="text-xl font-bold text-slate-700">Módulo en Construcción</h3>
                            </Card>
                        </div>
                    )}

                    {/* --- MÓDULO 4: IMPRESIÓN --- */}
                    {currentView === 'PRINTING' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                        <Printer className="text-emerald-500"/> Centro de Impresión y Control de Piso
                                    </h2>
                                    <p className="text-slate-500 text-sm mt-1">Emisión de etiquetas ZPL, manifiestos PDF y control de lotes activos.</p>
                                </div>
                            </div>
                            <Card className="p-12 text-center bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center">
                                <Printer size={48} className="text-slate-300 mb-4"/>
                                <h3 className="text-xl font-bold text-slate-700">Módulo en Construcción</h3>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* MODALES COMPARTIDOS */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Editar Producto" : "Nuevo Producto"}>
                 <div className="space-y-5 py-2">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cliente Asignado</label>
                        <select className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm" value={formState.client_id} onChange={(e) => setFormState({...formState, client_id: Number(e.target.value)})}>
                            <option value={0}>-- Catálogo Interno (Stock) --</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre del Producto</label>
                        <Input placeholder="Ej. Cocina Tipo A - Torre Norte" value={formState.name} onChange={(e) => setFormState({...formState, name: e.target.value})} className="shadow-sm"/>
                    </div>
                    <div className="relative">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoría Técnica</label>
                        <Input placeholder="Ej. Cocinas" value={formState.category} onChange={(e) => { setFormState({...formState, category: e.target.value}); setShowCategorySuggestions(true); }} onFocus={() => setShowCategorySuggestions(true)} onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 200)} className="shadow-sm" />
                        {showCategorySuggestions && (
                            <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 max-h-48 overflow-auto">
                                {filteredCategories.map((cat, i) => (
                                    <div key={i} className="px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 cursor-pointer border-b border-slate-100 last:border-b-0" onMouseDown={() => { setFormState({...formState, category: cat}); setShowCategorySuggestions(false); }}>{cat}</div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)} className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-none">Cancelar</Button>
                        <Button onClick={handleSave} disabled={!formState.name} className="bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm">{isEditing ? 'Guardar Cambios' : 'Crear Producto'}</Button>
                    </div>
                </div>
            </Modal>

            {viewingBlueprintUrl && (
                <div className="fixed inset-0 bg-slate-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-6xl h-[90vh] flex flex-col relative shadow-2xl overflow-hidden">
                        <div className="bg-white border-b border-slate-200 px-5 py-3 flex justify-between items-center">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-indigo-600"/> Visor de Planos</h3>
                            <button onClick={closeBlueprintModal} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-md transition-colors"><X size={20}/></button>
                        </div>
                        <div className="flex-1 bg-slate-100/50 p-4">
                            <iframe src={viewingBlueprintUrl} className="w-full h-full rounded-lg shadow-sm border border-slate-200 bg-white" title="Plano Técnico"/>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DesignCatalogPage;