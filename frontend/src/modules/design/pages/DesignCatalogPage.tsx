import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; 
import { useDesign } from '../hooks/useDesign';
import { useClients } from '../../foundations/hooks/useClients'; 
import { 
    Edit, Trash2, Plus, Search, 
    ChevronDown, ChevronRight, Layers, 
    FileText, AlertCircle, CheckCircle2,
    Paperclip, X, FileMinus, Lock,
    Box, Tag, AlertTriangle, CheckSquare
} from 'lucide-react';

import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import ExportButton from '../../../components/ui/ExportButton';

import { designService } from '../../../api/design-service';
import { VersionStatus } from '../../../types/design';

const DesignCatalogPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation(); 
    
    // --- SEGURIDAD ---
    const [userRole, setUserRole] = useState('ADMIN');
    
    useEffect(() => {
        const role = (localStorage.getItem('user_role') || 'ADMIN').toUpperCase();
        setUserRole(role);
    }, []);

    const isSales = userRole === 'SALES';

    const { masters, loading, error, loadMasters, addMaster, updateMaster, deleteMaster } = useDesign();
    const { clients, fetchClients } = useClients();
    
    // UI State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
    const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());

    // File Upload State
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
        if (location.state && (location.state as any).openNewModal) {
            openCreateModal();
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // --- BLINDAJE DE SEGURIDAD PARA EL BORRADO EN CASCADA ---
    const handleDelete = async (e: React.MouseEvent, id: number, productName: string) => {
        e.stopPropagation(); 
        if(isSales) return;

        // Doble confirmación exigiendo la palabra "ELIMINAR"
        const confirmacion = window.prompt(
            `⚠ ALERTA CRÍTICA: BORRADO EN CASCADA ⚠\n\n` +
            `Estás a punto de eliminar la familia completa de "${productName}".\n` +
            `Esto destruirá:\n` +
            `- El Producto Base\n` +
            `- TODAS sus versiones (V1, V2, etc.)\n` +
            `- Las recetas, costos y planos adjuntos.\n\n` +
            `Para confirmar, escribe la palabra: ELIMINAR`
        );

        if (confirmacion === "ELIMINAR") { 
            try { 
                await deleteMaster(id); 
                alert("✅ Familia de producto eliminada correctamente.");
            } catch (err) { 
                console.error(err);
                alert("Ocurrió un error al intentar eliminar el producto."); 
            } 
        } else if (confirmacion !== null) {
            alert("❌ Borrado cancelado. La palabra no coincide.");
        }
    };

    const handleOpenProduct = async (masterId: number, versions: any[]) => {
        if (isSales) {
            alert("🔒 Acceso Restringido: Solo Ingeniería puede ver los detalles técnicos y costos.");
            return;
        }

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

    // --- CÁLCULOS KPI ---
    const totalProducts = masters.length;
    const totalReady = masters.filter(m => m.versions?.[0]?.status === VersionStatus.READY).length;
    const totalDrafts = masters.filter(m => m.versions?.[0]?.status === VersionStatus.DRAFT || !m.versions?.length).length;

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24 space-y-8 animate-fadeIn">
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileChange} />

            {/* HEADER AL ESTILO GERENCIA */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                        Catálogo de Ingeniería
                        {isSales && <Badge className="bg-slate-100 text-slate-600 border-slate-200 mt-1"><Lock size={12} className="mr-1"/> LECTURA</Badge>}
                    </h1>
                    <p className="text-slate-500">Gestión de productos base, explosión de materiales y planos.</p>
                </div>

                <div className="flex gap-3 w-full md:w-auto items-center">
                    <ExportButton data={masters} fileName="Catalogo_Productos" mapping={mapMastersForExcel} label="Exportar"/>
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input type="text" placeholder="Buscar producto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-full md:w-64 focus:ring-2 focus:ring-indigo-500 shadow-sm"/>
                    </div>
                    {!isSales && (
                        <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                            <Plus size={16} className="mr-1" /> Nuevo
                        </Button>
                    )}
                </div>
            </div>

            {error && <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 shadow-sm"><AlertCircle size={16} className="inline mr-2"/> {error}</div>}

            {/* --- NIVEL 1: TARJETAS SUPERIORES --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* 1. TOTAL PRODUCTOS */}
                <Card className="p-4 border-l-4 border-l-blue-500 bg-white shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1 h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Productos</p>
                        <Box size={14} className="text-blue-500" />
                    </div>
                    <div className="mt-1 flex justify-between items-end">
                        <div>
                            <h3 className="text-xl font-bold text-slate-700">En Catálogo</h3>
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">Registrados en BD</p>
                        </div>
                        <div className="text-2xl font-black text-blue-600/20">{totalProducts}</div>
                    </div>
                </Card>

                {/* 2. CATEGORÍAS */}
                <Card className="p-4 border-l-4 border-l-emerald-500 bg-white shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1 h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categorías</p>
                        <Tag size={14} className="text-emerald-500" />
                    </div>
                    <div className="mt-1 flex justify-between items-end">
                        <div>
                            <h3 className="text-xl font-bold text-slate-700">Tipos de Mueble</h3>
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">Clasificaciones Activas</p>
                        </div>
                        <div className="text-2xl font-black text-emerald-600/20">{uniqueCategories.length}</div>
                    </div>
                </Card>

                {/* 3. BORRADORES (ALERTA) */}
                <Card className="p-4 border-l-4 border-l-orange-500 bg-white shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1 h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Borradores</p>
                        <AlertTriangle size={14} className="text-orange-500" />
                    </div>
                    <div className="mt-1 flex justify-between items-end">
                        <div>
                            <h3 className="text-xl font-bold text-slate-700">En Desarrollo</h3>
                            <p className="text-[10px] text-orange-600 font-bold mt-1 flex items-center gap-1">Sin versión activa</p>
                        </div>
                        <div className="text-2xl font-black text-orange-600/20">{totalDrafts}</div>
                    </div>
                </Card>

                {/* 4. LISTOS (VERDE) */}
                <Card className="p-4 border-l-4 border-l-indigo-500 bg-white shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1 h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Producción</p>
                        <CheckSquare size={14} className="text-indigo-500" />
                    </div>
                    <div className="mt-1 flex justify-between items-end">
                        <div>
                            <h3 className="text-xl font-bold text-slate-700">Listos p/ Venta</h3>
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><CheckCircle2 size={10}/> Recetas cerradas</p>
                        </div>
                        <div className="text-2xl font-black text-indigo-600/20">{totalReady}</div>
                    </div>
                </Card>
            </div>

            {/* --- NIVEL 2: MÓDULO DE TABLAS (ESTILO GERENCIA) --- */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                {!loading && Object.keys(groupedProducts).length === 0 && (
                    <div className="text-center py-24 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm">
                        <Layers size={40} className="mx-auto text-slate-300 mb-3"/>
                        <h3 className="text-sm font-medium text-slate-900">No hay productos</h3>
                        <p className="text-sm text-slate-500 mt-1">Crea un nuevo producto para comenzar a armar su receta.</p>
                    </div>
                )}

                {Object.entries(groupedProducts).map(([clientIdStr, categories]) => {
                    const clientId = Number(clientIdStr);
                    const clientName = getClientName(clientId);
                    const isExpanded = expandedClients.has(clientId);
                    const productCount = Object.values(categories).reduce((acc, list) => acc + list.length, 0);

                    return (
                        <div key={clientId} className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden transition-all">
                            {/* CABECERA CLIENTE (ESTILO TABLA GERENCIA) */}
                            <div onClick={() => toggleClient(clientId)} className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                <h3 className="font-bold text-indigo-800 flex items-center gap-2 text-lg">
                                    {isExpanded ? <ChevronDown size={20} className="text-indigo-600"/> : <ChevronRight size={20} className="text-indigo-600"/>}
                                    {clientName}
                                </h3>
                                <Badge variant="default" className="bg-indigo-600">{productCount} Productos</Badge>
                            </div>

                            {/* CONTENIDO EXPANDIDO */}
                            {isExpanded && (
                                <div className="overflow-x-auto">
                                    {Object.entries(categories).map(([categoryName, categoryProducts]) => (
                                        <div key={categoryName} className="mb-0">
                                            
                                            <table className="w-full text-sm text-left">
                                                {/* CABECERA TABLA (ESTILO GERENCIA) */}
                                                <thead className="text-xs text-indigo-800 uppercase bg-indigo-50/50 border-b border-indigo-100">
                                                    <tr>
                                                        <th className="px-6 py-4 w-[40%] flex items-center gap-2">
                                                            <Tag size={14}/> {categoryName}
                                                        </th>
                                                        <th className="px-6 py-4 text-center w-[15%]">Estado</th>
                                                        <th className="px-6 py-4 w-[20%]">Versión</th>
                                                        <th className="px-6 py-4 text-center w-[25%]">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {categoryProducts.flatMap((product: any) => {
                                                        const versions = product.versions && product.versions.length > 0 ? product.versions : [null];
                                                        
                                                        return versions.map((v: any) => {
                                                            const isReady = v?.status === VersionStatus.READY;
                                                            const rowKey = `${product.id}-${v ? v.id : 'empty'}`;

                                                            return (
                                                                <tr key={rowKey} className="hover:bg-slate-50 transition-colors">
                                                                    <td className="px-6 py-4">
                                                                        <div 
                                                                            className={`font-bold text-slate-700 flex items-center gap-2 ${isSales ? 'cursor-default' : 'hover:text-indigo-600 cursor-pointer transition-colors'}`} 
                                                                            onClick={() => handleOpenProduct(product.id, v ? [v] : [])}
                                                                        >
                                                                            {product.name}
                                                                        </div>
                                                                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs mt-1 inline-block">
                                                                            SKU: PRD-{product.id.toString().padStart(4, '0')} {v ? `- V${v.id}` : ''}
                                                                        </span>
                                                                    </td>
                                                                    
                                                                    <td className="px-6 py-4 text-center">
                                                                        {v ? (
                                                                            isReady ? 
                                                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 inline-flex items-center justify-center gap-1"><CheckCircle2 size={10}/> Listo</span> : 
                                                                                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full border border-orange-100 inline-flex items-center justify-center gap-1"><AlertCircle size={10}/> Borrador</span>
                                                                        ) : (
                                                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200 inline-flex items-center justify-center">Vacío</span>
                                                                        )}
                                                                    </td>
                                                                    
                                                                    <td className="px-6 py-4 text-slate-500">
                                                                        {v ? 
                                                                            <span className={`font-mono px-2 py-1 rounded text-xs border ${isReady ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                                                {v.version_name}
                                                                            </span> : 
                                                                            <span className="text-xs text-slate-400 italic">Pendiente de Ingeniería</span>
                                                                        }
                                                                    </td>
                                                                    
                                                                    <td className="px-6 py-4 text-center">
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            {/* PLANOS */}
                                                                            {product.blueprint_path ? (
                                                                                <>
                                                                                    <button onClick={(e) => { e.stopPropagation(); handleViewBlueprint(product.blueprint_path!); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" title="Ver Plano"><FileText size={16}/></button>
                                                                                    {!isSales && <button onClick={(e) => handleDeleteBlueprint(e, product.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Quitar Plano"><FileMinus size={16}/></button>}
                                                                                </>
                                                                            ) : (
                                                                                !isSales && <button onClick={(e) => { e.stopPropagation(); handleUploadClick(product.id); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" title="Adjuntar Plano"><Paperclip size={16}/></button>
                                                                            )}
                                                                            
                                                                            {!isSales && (
                                                                                <>
                                                                                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                                                                                    <button onClick={(e) => openEditModal(e, product)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" title="Editar Nombre del Producto Base"><Edit size={16}/></button>
                                                                                    <button onClick={(e) => handleDelete(e, product.id, product.name)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Eliminar Familia Completa (Borrado en Cascada)"><Trash2 size={16}/></button>
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

            {/* MODAL (MANTENIDO) */}
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

            {/* VISOR PDF/IMAGEN */}
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