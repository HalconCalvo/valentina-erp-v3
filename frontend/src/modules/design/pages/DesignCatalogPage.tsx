import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDesign } from '../hooks/useDesign';
import { useClients } from '../../foundations/hooks/useClients'; 
import client, { API_URL } from '../../../api/axios-client'; 
import { 
    Edit, Trash2, Plus, Search, 
    ChevronDown, ChevronRight, Layers, 
    FileText, AlertCircle, CheckCircle2,
    Pencil, Paperclip, X, FileMinus, Lock
} from 'lucide-react';

import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';

import { designService } from '../../../api/design-service';
import { VersionStatus } from '../../../types/design';
import ExportButton from '../../../components/ui/ExportButton';

const DesignCatalogPage: React.FC = () => {
    const navigate = useNavigate();
    
    // --- SEGURIDAD (CORREGIDO) ---
    const [userRole, setUserRole] = useState('ADMIN');
    
    useEffect(() => {
        // IMPORTANTE: Forzamos mayúsculas para que coincida con 'SALES'
        const role = (localStorage.getItem('user_role') || 'ADMIN').toUpperCase();
        setUserRole(role);
    }, []);

    const isSales = userRole === 'SALES';
    // -----------------------------

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

    const getClientName = (id: number) => clients.find(c => c.id === id)?.full_name || 'Stock';
    
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

    const handleViewBlueprint = (path: string) => {
        const baseUrl = API_URL.replace('/api/v1', ''); setViewingBlueprintUrl(`${baseUrl}/static/${path}`);
    };

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

    const handleDelete = async (e: React.MouseEvent, id: number, productName: string) => {
        e.stopPropagation(); if(isSales) return;
        if (window.confirm(`⚠ ¿Eliminar "${productName}"?`)) { try { await deleteMaster(id); } catch { alert("Error."); } }
    };

    const handleOpenProduct = async (masterId: number, versions: any[]) => {
        // SEGURIDAD: Ventas NO puede entrar a ver recetas (costos)
        // Ahora sí funcionará porque isSales será true para vendedores
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

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileChange} />

            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm sticky top-0 z-10">
                <div>
                    <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        Catálogo de Ingeniería 
                        {isSales && <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Lock size={10} className="mr-1"/> MODO LECTURA</Badge>}
                    </h1>
                    <p className="text-xs text-slate-400 font-medium">Gestión de Productos y Recetas</p>
                </div>
                
                <div className="flex gap-3 w-full sm:w-auto items-center">
                    <ExportButton data={masters} fileName="Catalogo_Productos" mapping={mapMastersForExcel} label="Excel"/>
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm w-full sm:w-48"/>
                    </div>
                    {!isSales && (
                        <Button onClick={openCreateModal} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                            <Plus size={18} className="mr-1" /> Nuevo
                        </Button>
                    )}
                </div>
            </div>

            {error && <div className="m-6 bg-red-50 text-red-700 p-4 rounded border border-red-200"><AlertCircle size={18}/> {error}</div>}

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-6xl mx-auto space-y-6">
                    {!loading && Object.keys(groupedProducts).length === 0 && (
                        <div className="text-center py-20 bg-white rounded border-dashed border-slate-300">
                            <Layers size={48} className="mx-auto text-slate-300 mb-4"/><p className="text-slate-500">Sin productos</p>
                        </div>
                    )}

                    {Object.entries(groupedProducts).map(([clientIdStr, categories]) => {
                        const clientId = Number(clientIdStr);
                        const clientName = clients.find(c => c.id === clientId)?.full_name || "Stock Interno";
                        const isExpanded = expandedClients.has(clientId);
                        const productCount = Object.values(categories).reduce((acc, list) => acc + list.length, 0);

                        return (
                            <div key={clientId} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                <div onClick={() => toggleClient(clientId)} className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100">
                                    <div className="flex items-center gap-2">
                                        {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                        <h2 className="font-bold text-slate-700 text-sm uppercase">{clientName}</h2>
                                        <Badge variant="secondary" className="text-[10px]">{productCount} Productos</Badge>
                                    </div>
                                </div>
                                {isExpanded && <div className="p-0">
                                    {Object.entries(categories).map(([categoryName, categoryProducts]) => (
                                        <div key={categoryName} className="border-b last:border-b-0 border-slate-100">
                                            <div className="bg-indigo-50/30 px-10 py-1.5 flex items-center gap-2 border-b border-slate-50">
                                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>
                                                <h3 className="text-xs font-bold text-indigo-600 uppercase">{categoryName}</h3>
                                            </div>
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="border-b border-slate-100 bg-white text-[10px] text-slate-400 uppercase">
                                                        <th className="pl-12 pr-4 py-2 w-[40%]">Producto</th>
                                                        <th className="px-4 py-2 text-center w-[15%]">Estado</th>
                                                        <th className="px-4 py-2 w-[20%]">Versión</th>
                                                        <th className="px-4 py-2 text-right w-[25%]">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {categoryProducts.map((product: any) => {
                                                        const latestVersion = product.versions?.[0];
                                                        return (
                                                            <tr key={product.id} className="group hover:bg-indigo-50/10 border-b last:border-b-0 border-slate-50">
                                                                <td className="pl-12 pr-4 py-3">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="bg-slate-100 p-1.5 rounded text-slate-400"><Layers size={16}/></div>
                                                                        <div>
                                                                            <div 
                                                                                className={`font-bold text-sm ${isSales ? 'text-slate-600 cursor-default' : 'text-slate-700 hover:underline cursor-pointer text-indigo-700'}`} 
                                                                                onClick={() => handleOpenProduct(product.id, product.versions)}
                                                                            >
                                                                                {product.name}
                                                                            </div>
                                                                            <div className="text-[10px] text-slate-400 font-mono">ID: {product.id}</div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    {latestVersion?.status === VersionStatus.READY ? 
                                                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 flex items-center justify-center gap-1"><CheckCircle2 size={10}/> Listo</span> : 
                                                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100 flex items-center justify-center gap-1"><AlertCircle size={10}/> Borrador</span>
                                                                    }
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {latestVersion ? <span className="text-xs bg-slate-100 px-2 py-1 rounded border border-slate-200">{latestVersion.version_name}</span> : <span className="text-[10px] text-slate-400 italic">Sin Recetas</span>}
                                                                </td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <div className="flex justify-end gap-2">
                                                                        {/* VISOR DE PLANOS (VISIBLE PARA TODOS) */}
                                                                        {product.blueprint_path ? (
                                                                            <div className={`flex gap-1 mr-2 ${!isSales ? 'border-r border-slate-200 pr-2' : ''}`}>
                                                                                <button onClick={(e) => { e.stopPropagation(); handleViewBlueprint(product.blueprint_path!); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Ver Plano"><FileText size={16}/></button>
                                                                                {!isSales && <button onClick={(e) => handleDeleteBlueprint(e, product.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"><FileMinus size={16}/></button>}
                                                                            </div>
                                                                        ) : (
                                                                            !isSales && <div className="mr-2 border-r border-slate-200 pr-2">
                                                                                <button onClick={(e) => { e.stopPropagation(); handleUploadClick(product.id); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Paperclip size={16}/></button>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {!isSales && (
                                                                            <>
                                                                                <button onClick={(e) => openEditModal(e, product)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit size={16}/></button>
                                                                                <button onClick={(e) => handleDelete(e, product.id, product.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Editar Producto" : "Nuevo Producto"}>
                 <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Cliente</label>
                        <select className="w-full p-2 border rounded" value={formState.client_id} onChange={(e) => setFormState({...formState, client_id: Number(e.target.value)})}>
                            <option value={0}>-- Seleccionar --</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Nombre</label>
                        <Input placeholder="Ej. Cocina Torre Y" value={formState.name} onChange={(e) => setFormState({...formState, name: e.target.value})}/>
                    </div>
                    <div className="relative">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Categoría</label>
                        <Input placeholder="Ej. Cocinas" value={formState.category} onChange={(e) => { setFormState({...formState, category: e.target.value}); setShowCategorySuggestions(true); }} onFocus={() => setShowCategorySuggestions(true)} onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 300)} />
                        {showCategorySuggestions && (
                            <div className="absolute z-50 w-full mt-1 bg-white rounded shadow-lg border max-h-48 overflow-auto">
                                {filteredCategories.map((cat, i) => (
                                    <div key={i} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer" onMouseDown={() => { setFormState({...formState, category: cat}); setShowCategorySuggestions(false); }}>{cat}</div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={!formState.name || !formState.client_id}>{isEditing ? 'Guardar' : 'Crear'}</Button>
                    </div>
                </div>
            </Modal>

            {viewingBlueprintUrl && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-6xl h-[90vh] flex flex-col relative">
                        <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center">
                            <h3 className="font-bold flex gap-2"><FileText size={18}/> Visor</h3>
                            <button onClick={closeBlueprintModal}><X size={20}/></button>
                        </div>
                        <div className="flex-1 bg-slate-100"><iframe src={viewingBlueprintUrl} className="w-full h-full border-none" title="Plano"/></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DesignCatalogPage;