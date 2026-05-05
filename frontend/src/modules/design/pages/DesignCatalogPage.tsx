import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; 
import { useDesign } from '../hooks/useDesign';
import { useClients } from '../../foundations/hooks/useClients'; 
import { 
    Edit, Trash2, Plus, Search, 
    ChevronDown, ChevronRight, Layers, 
    FileText, AlertCircle, CheckCircle2,
    Paperclip, X, FileMinus, Lock,
    Tag, ArrowLeft, Calculator, Printer, ShieldAlert,
    Package, RefreshCw, Download, Upload
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import ExportButton from '@/components/ui/ExportButton';

import * as XLSX from 'xlsx';
import axiosClient from '../../../api/axios-client';
import { designService } from '../../../api/design-service';
import { productionService } from '../../../api/production-service';
import { VersionStatus } from '../../../types/design';

type ModuleView = 'HOME' | 'CATALOG' | 'DEFICIT' | 'SIMULATOR_MODULE' | 'SIMULATOR_BATCHES';

const DesignCatalogPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation(); 
    
    // --- ESTADO DE VISTA MAESTRA ---
    const [currentView, setCurrentView] = useState<ModuleView>('HOME');
    const [viewHistory, setViewHistory] = useState<string[]>([]);
    const [liveBatches, setLiveBatches] = useState<any[]>([]);
    const [loadingLiveBatches, setLoadingLiveBatches] = useState(false);
    const [deletingBatchId, setDeletingBatchId] = useState<number | null>(null);

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
    const [materials, setMaterials] = useState<any[]>([]);
    
    // UI State Catálogo
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
    const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingVersionId, setUploadingVersionId] = useState<number | null>(null);
    const [viewingBlueprintUrl, setViewingBlueprintUrl] = useState<string | null>(null);
    const [exportingClientId, setExportingClientId] = useState<number | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const [importingClientId, setImportingClientId] = useState<number | null>(null);

    const [formState, setFormState] = useState({ name: '', category: 'General', client_id: 0 });

    useEffect(() => {
        loadMasters();
        fetchClients();
        axiosClient.get('/foundations/materials/')
            .then(res => setMaterials(Array.isArray(res.data) ? res.data : res.data?.data || []))
            .catch(() => console.error('Error cargando materiales'));
    }, [loadMasters, fetchClients]);


    const loadDashboardMetrics = async () => {
        try {
            const pending = await designService.getPendingInstances();
            setPendingInstancesCount(pending.length);

            const batches = await productionService.getBatches();
            setAmberBatchesCount(batches.filter(b => b.status === 'ON_HOLD').length);
            setActiveBatchesCount(batches.filter(b => b.status === 'IN_PRODUCTION' || b.status === 'FINISHED').length);
            setLiveBatches(
                batches.filter((b: any) =>
                    ['DRAFT', 'ON_HOLD', 'IN_PRODUCTION'].includes(b.status)
                )
            );
        } catch (err) {
            console.error("Error cargando métricas", err);
        }
    };

    const loadLiveBatches = async () => {
        setLoadingLiveBatches(true);
        try {
            const data = await productionService.getBatches();
            const live = data
                .filter((b: any) =>
                    ['DRAFT', 'ON_HOLD', 'IN_PRODUCTION'].includes(b.status)
                )
                .sort((a: any, b: any) => a.id - b.id);
            setLiveBatches(live);
        } catch {
            console.error('Error cargando lotes vivos');
        } finally {
            setLoadingLiveBatches(false);
        }
    };

    const getClientName = (id: number) => clients.find(c => c.id === id)?.full_name || 'Stock Interno';
    
    const mapMastersForExcel = (m: any) => ({
        "ID Sistema": m.id, "Producto": m.name, "Categoría": m.category, "Cliente": getClientName(m.client_id),
        "Tiene Plano": m.blueprint_path ? 'SÍ' : 'NO', "Versiones Activas": m.versions ? m.versions.length : 0
    });

    const handleUploadClick = (versionId: number) => {
        if(isSales) return;
        setUploadingVersionId(versionId);
        setTimeout(() => { if (fileInputRef.current) fileInputRef.current.click(); }, 50);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadingVersionId) return;
        try {
            const formData = new FormData();
            formData.append('blueprint', file);
            const token = localStorage.getItem('token');
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
            const uploadRes = await fetch(
                `${baseUrl}/design/versions/${uploadingVersionId}/blueprint-file`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                }
            );
            if (!uploadRes.ok) {
                const err = await uploadRes.json();
                throw new Error(err.detail || 'Error al subir el archivo');
            }
            const { path } = await uploadRes.json();
            await designService.updateVersionBlueprint(uploadingVersionId, path);
            alert("✅ Plano adjuntado a la versión.");
            await loadMasters();
        } catch (error: any) {
            console.error(error);
            alert(`Error al subir: ${error.message}`);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadingVersionId(null);
        }
    };

    const handleViewBlueprint = (path: string) => setViewingBlueprintUrl(path); 
    const closeBlueprintModal = () => setViewingBlueprintUrl(null);

    const handleDeleteVersionBlueprint = async (e: React.MouseEvent, versionId: number) => {
        e.stopPropagation();
        if(isSales) return;
        if (window.confirm("¿Eliminar el plano de esta versión?")) {
            try {
                await designService.updateVersionBlueprint(versionId, '');
                await loadMasters();
            } catch (error) {
                alert("Error al eliminar el plano.");
            }
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

    const clientProducts = useMemo(() => {
        if (!formState.client_id) return [];
        return masters.filter(m => m.client_id === Number(formState.client_id));
    }, [masters, formState.client_id]);

    const filteredProductSuggestions = useMemo(() => {
        if (!formState.name || formState.name.length < 2) return clientProducts;
        return clientProducts.filter(p =>
            p.name.toLowerCase().includes(formState.name.toLowerCase())
        );
    }, [clientProducts, formState.name]);

    const exactMatch = useMemo(() =>
        clientProducts.some(p => p.name.toLowerCase() === formState.name.toLowerCase()),
        [clientProducts, formState.name]
    );

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

    const handleExportRecipes = (clientId: number) => {
        const clientName = getClientName(clientId);
        const clientMasters = masters.filter(m => m.client_id === clientId);

        const exportData = {
            exported_at: new Date().toISOString(),
            client_id: clientId,
            client_name: clientName,
            products: clientMasters.map(m => ({
                name: m.name,
                category: m.category,
                versions: (m.versions || []).map(v => ({
                    version_name: v.version_name,
                    status: v.status,
                    installation_days: v.installation_days || 1,
                    components: (v.components || []).map(c => ({
                        material_id: c.material_id,
                        quantity: c.quantity
                    }))
                }))
            }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Recetas_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getMaterialBySku = (materialId: number) => {
        const mat = materials.find(m => m.id === materialId);
        return {
            sku:  mat?.sku  || `MAT-${materialId}`,
            name: mat?.name || 'Desconocido'
        };
    };

    const handleBackupExcel = () => {
        const productosData = masters.map(m => ({
            'ID':         m.id,
            'Cliente':    getClientName(m.client_id),
            'Producto':   m.name,
            'Categoría':  m.category,
            'Versiones':  (m.versions || []).length,
            'Estado':     (m.versions || []).some(v => v.status === 'READY')
                              ? 'LISTO' : 'BORRADOR',
            'Exportado':  new Date().toLocaleDateString('es-MX')
        }));

        const versionesData: any[] = [];
        masters.forEach(m => {
            (m.versions || []).forEach(v => {
                versionesData.push({
                    'ID Versión':       v.id,
                    'ID Producto':      m.id,
                    'Cliente':          getClientName(m.client_id),
                    'Producto':         m.name,
                    'Versión':          v.version_name,
                    'Status':           v.status,
                    'Costo Estimado':   v.estimated_cost || 0,
                    'Días Instalación': v.installation_days || 1,
                    'Tiene MDF':        v.has_mdf_components ? 'SÍ' : 'NO',
                    'Tiene Piedra':     v.has_stone_components ? 'SÍ' : 'NO',
                });
            });
        });

        const recetasData: any[] = [];
        masters.forEach(m => {
            (m.versions || []).forEach(v => {
                (v.components || []).forEach(c => {
                    const mat = getMaterialBySku(c.material_id);
                    recetasData.push({
                        'ID Versión':    v.id,
                        'Cliente':       getClientName(m.client_id),
                        'Producto':      m.name,
                        'Versión':       v.version_name,
                        'SKU':           mat.sku,
                        'Material':      mat.name,
                        'Cantidad':      c.quantity,
                    });
                });
            });
        });

        const wb = XLSX.utils.book_new();

        const ws1 = XLSX.utils.json_to_sheet(productosData);
        const ws2 = XLSX.utils.json_to_sheet(versionesData);
        const ws3 = XLSX.utils.json_to_sheet(recetasData);

        ws1['!cols'] = [40,80,80,60,40,40,60].map(w => ({ wch: w/5 }));
        ws2['!cols'] = [40,40,80,80,60,60,60,60,40,40].map(w => ({ wch: w/5 }));
        ws3['!cols'] = [40,40,40,80,80,60,40,60].map(w => ({ wch: w/5 }));

        XLSX.utils.book_append_sheet(wb, ws1, 'Productos');
        XLSX.utils.book_append_sheet(wb, ws2, 'Versiones');
        XLSX.utils.book_append_sheet(wb, ws3, 'Recetas');

        const fecha = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `Respaldo_Recetas_${fecha}.xlsx`);
    };

    const handleImportRecipes = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.products || !Array.isArray(data.products)) {
                return alert('Archivo inválido. No contiene productos.');
            }

            const confirmMsg =
                `¿Importar ${data.products.length} productos de "${data.client_name}"?\n\n` +
                `Se crearán como NUEVOS productos. Los existentes NO se modifican.`;
            if (!window.confirm(confirmMsg)) return;

            let creados = 0;
            let errores = 0;

            for (const product of data.products) {
                try {
                    const newMaster = await designService.createMaster({
                        name: product.name,
                        category: product.category || 'General',
                        client_id: importingClientId || data.client_id,
                        is_active: true
                    });

                    for (const version of (product.versions || [])) {
                        await designService.createVersion({
                            master_id: newMaster.id,
                            version_name: version.version_name || 'V1.0',
                            status: VersionStatus.DRAFT,
                            is_active: true,
                            components: version.components || []
                        });
                    }
                    creados++;
                } catch {
                    errores++;
                }
            }

            alert(`✅ Importación completada.\n${creados} productos creados.\n${errores} errores.`);
            await loadMasters();
        } catch {
            alert('Error al leer el archivo. Verifica que sea un JSON válido.');
        } finally {
            if (importInputRef.current) importInputRef.current.value = '';
            setImportingClientId(null);
        }
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

    const batchStatusConfig: Record<string, { label: string; color: string }> = {
        DRAFT:         { label: 'Por Producir',  color: 'bg-gray-100 text-gray-700'   },
        ON_HOLD:       { label: 'En Espera',     color: 'bg-amber-100 text-amber-700' },
        IN_PRODUCTION: { label: 'En Producción', color: 'bg-blue-100 text-blue-700'   },
    };

    const navigateTo = (view: string) => {
        setViewHistory(prev => [...prev, currentView]);
        setCurrentView(view as any);
    };

    const navigateBack = () => {
        if (viewHistory.length === 0) return;
        const prev = viewHistory[viewHistory.length - 1];
        setViewHistory(h => h.slice(0, -1));
        setCurrentView(prev as any);
    };

    const handleDeleteBatch = async (batchId: number, folio: string) => {
        if (!window.confirm(
            `¿Detener el lote ${folio}?\n\n` +
            `Las instancias regresarán a PENDIENTE y el material ` +
            `comprometido quedará liberado.\n\n` +
            `Esta acción no se puede deshacer.`
        )) return;

        setDeletingBatchId(batchId);
        try {
            const result = await productionService.deleteBatch(batchId);
            alert(result.message);
            await loadLiveBatches();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Error al eliminar el lote.');
        } finally {
            setDeletingBatchId(null);
        }
    };

    useEffect(() => {
        if (location.state) {
            const state = location.state as any;
            if (state.openNewModal) {
                navigateTo('CATALOG');
                openCreateModal();
                window.history.replaceState({}, document.title);
            } else if (state.returnTo === 'CATALOG') {
                navigateTo('CATALOG');
                window.history.replaceState({}, document.title);
            }
        }
    }, [location.state]);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-300">
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileChange} />
            <input
                type="file"
                ref={importInputRef}
                className="hidden"
                accept=".json"
                onChange={handleImportRecipes}
            />

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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">

                        {/* Tarjeta 1: Catálogo de Productos */}
                        <div className="w-full relative h-40">
                            <Card
                                onClick={() => navigateTo('CATALOG')}
                                className="p-5 cursor-pointer hover:shadow-xl transition-all
                     border-l-4 border-l-indigo-500 transform
                     hover:-translate-y-1 h-full flex flex-col
                     justify-between bg-white overflow-hidden group"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16
                          flex items-center justify-center bg-indigo-50
                          text-indigo-700 border-r border-indigo-100
                          font-black transition-colors
                          group-hover:bg-indigo-100 text-2xl">
                                    {totalDrafts}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[11px] font-black text-slate-500
                            uppercase tracking-widest">
                                            Módulo 1
                                        </p>
                                        <Layers size={16} className="text-indigo-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-700
                             leading-tight">
                                            Catálogo de<br/>Productos
                                        </h3>
                                    </div>
                                    <div className="flex items-center justify-between
                            pt-2 border-t border-slate-100">
                                        <p className="text-[10px] text-slate-400 font-bold
                            uppercase truncate">
                                            El Génesis de Recetas
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Tarjeta 2: Simulador y Creación de Lotes */}
                        <div className="w-full relative h-40">
                            <Card
                                onClick={() => navigateTo('SIMULATOR_MODULE')}
                                className="p-5 cursor-pointer hover:shadow-xl transition-all
                     border-l-4 border-l-blue-500 transform
                     hover:-translate-y-1 h-full flex flex-col
                     justify-between bg-white overflow-hidden group"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16
                          flex items-center justify-center bg-blue-50
                          text-blue-700 border-r border-blue-100
                          font-black transition-colors
                          group-hover:bg-blue-100 text-2xl">
                                    {pendingInstancesCount}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[11px] font-black text-slate-500
                            uppercase tracking-widest">
                                            Módulo 2
                                        </p>
                                        <Calculator size={16} className="text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-700
                             leading-tight">
                                            Simulador y<br/>Creación de Lotes
                                        </h3>
                                    </div>
                                    <div className="flex items-center justify-between
                            pt-2 border-t border-slate-100">
                                        <p className="text-[10px] text-slate-400 font-bold
                            uppercase truncate">
                                            Puente a Fábrica
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Tarjeta 3: Control de Déficit y Mermas */}
                        <div className="w-full relative h-40">
                            <Card
                                onClick={() => navigateTo('DEFICIT')}
                                className="p-5 cursor-pointer hover:shadow-xl transition-all
                     border-l-4 border-l-orange-500 transform
                     hover:-translate-y-1 h-full flex flex-col
                     justify-between bg-white overflow-hidden group"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16
                          flex items-center justify-center bg-orange-50
                          text-orange-700 border-r border-orange-100
                          font-black transition-colors
                          group-hover:bg-orange-100 text-2xl">
                                    {amberBatchesCount}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[11px] font-black text-slate-500
                            uppercase tracking-widest">
                                            Módulo 3
                                        </p>
                                        <ShieldAlert size={16} className="text-orange-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-700
                             leading-tight">
                                            Control de<br/>Déficit y Mermas
                                        </h3>
                                    </div>
                                    <div className="flex items-center justify-between
                            pt-2 border-t border-slate-100">
                                        <p className="text-[10px] text-slate-400 font-bold
                            uppercase truncate">
                                            Puente a Compras
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Tarjeta 4: Centro de Impresión */}
                        <div className="w-full relative h-40">
                            <Card
                                onClick={() => navigate('/design/print-center')}
                                className="p-5 cursor-pointer hover:shadow-xl transition-all
                     border-l-4 border-l-emerald-500 transform
                     hover:-translate-y-1 h-full flex flex-col
                     justify-between bg-white overflow-hidden group"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-16
                          flex items-center justify-center bg-emerald-50
                          text-emerald-700 border-r border-emerald-100
                          font-black transition-colors
                          group-hover:bg-emerald-100 text-2xl">
                                    {activeBatchesCount}
                                </div>
                                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[11px] font-black text-slate-500
                            uppercase tracking-widest">
                                            Módulo 4
                                        </p>
                                        <Printer size={16} className="text-emerald-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-700
                             leading-tight">
                                            Centro de<br/>Impresión
                                        </h3>
                                    </div>
                                    <div className="flex items-center justify-between
                            pt-2 border-t border-slate-100">
                                        <p className="text-[10px] text-slate-400 font-bold
                            uppercase truncate">
                                            Control de Piso
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        </div>

                    </div>
                </>
            )}

            {/* =========================================
                VISTA 2: SUBMÓDULOS ACTIVOS
            ========================================= */}
            {currentView !== 'HOME' && (
                <div className="animate-in slide-in-from-right-8 duration-300">
                    
                    <div className="flex justify-end mb-6">
                        <button
                            onClick={navigateBack}
                            className="flex items-center gap-2 bg-white border 
                   border-slate-300 text-slate-700 px-4 py-2 
                   rounded-lg font-bold hover:bg-slate-50 
                   hover:text-indigo-600 transition-all shadow-sm"
                        >
                            <ArrowLeft size={18} /> Regresar
                        </button>
                    </div>

                    {/* --- MÓDULO 2: SIMULADOR (vista intermedia 2A / 2B) --- */}
                    {currentView === 'SIMULATOR_MODULE' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-6 
                        pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 
                           flex items-center gap-2">
                                        <Calculator className="text-blue-500"/>
                                        Simulador y Creación de Lotes
                                    </h2>
                                    <p className="text-slate-500 text-sm mt-1">
                                        Agrupa productos pagados, cruza recetas contra inventario 
                                        y supervisa los lotes enviados a fábrica.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                {/* Sub-tarjeta 2A: Simulador */}
                                <div className="w-full relative h-40">
                                    <Card
                                        onClick={() => navigate('/design/simulator')}
                                        className="p-5 cursor-pointer hover:shadow-xl transition-all
                     border-l-4 border-l-blue-500 transform
                     hover:-translate-y-1 h-full flex flex-col
                     justify-between bg-white overflow-hidden group"
                                    >
                                        <div className="absolute top-0 left-0 bottom-0 w-16
                          flex items-center justify-center bg-blue-50
                          text-blue-700 border-r border-blue-100
                          font-black transition-colors
                          group-hover:bg-blue-100 text-2xl">
                                            {pendingInstancesCount}
                                        </div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div className="flex justify-between items-start">
                                                <p className="text-[11px] font-black text-slate-500
                            uppercase tracking-widest">
                                                    2A. Simulador
                                                </p>
                                                <Calculator size={16} className="text-blue-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-slate-700
                             leading-tight">
                                                    Simulador y<br/>Lotificación
                                                </h3>
                                            </div>
                                            <div className="flex items-center justify-between
                            pt-2 border-t border-slate-100">
                                                <p className="text-[10px] text-slate-400 font-bold
                            uppercase truncate">
                                                    Órdenes pendientes de producir
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                </div>

                                {/* Sub-tarjeta 2B: Ver Lotes */}
                                <div className="w-full relative h-40">
                                    <Card
                                        onClick={() => {
                                            navigateTo('SIMULATOR_BATCHES');
                                            loadLiveBatches();
                                        }}
                                        className="p-5 cursor-pointer hover:shadow-xl transition-all
                     border-l-4 border-l-blue-300 transform
                     hover:-translate-y-1 h-full flex flex-col
                     justify-between bg-white overflow-hidden group"
                                    >
                                        <div className="absolute top-0 left-0 bottom-0 w-16
                          flex items-center justify-center bg-blue-50
                          text-blue-400 border-r border-blue-100
                          font-black transition-colors
                          group-hover:bg-blue-100 text-2xl">
                                            {liveBatches.length}
                                        </div>
                                        <div className="ml-16 h-full flex flex-col justify-between pl-2">
                                            <div className="flex justify-between items-start">
                                                <p className="text-[11px] font-black text-slate-500
                            uppercase tracking-widest">
                                                    2B. Ver Lotes
                                                </p>
                                                <Package size={16} className="text-blue-300" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-slate-700
                             leading-tight">
                                                    Ver Lotes de<br/>Producción
                                                </h3>
                                            </div>
                                            <div className="flex items-center justify-between
                            pt-2 border-t border-slate-100">
                                                <p className="text-[10px] text-slate-400 font-bold
                            uppercase truncate">
                                                    Lotes vivos en fábrica
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                </div>

                            </div>
                        </div>
                    )}

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
                                    {!isSales && (
                                        <button
                                            onClick={handleBackupExcel}
                                            className="flex items-center gap-2 px-3 py-2 text-xs font-bold
                                                       text-emerald-700 bg-emerald-50 border border-emerald-200
                                                       rounded-lg hover:bg-emerald-100 transition-colors shadow-sm"
                                            title="Descargar respaldo completo en Excel (3 hojas)"
                                        >
                                            <Download size={14} /> Respaldo Excel
                                        </button>
                                    )}
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
                                            <div className="flex items-center gap-2">
                                                {!isSales && (
                                                    <>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleExportRecipes(clientId);
                                                            }}
                                                            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold
                                                                       text-indigo-600 bg-indigo-50 border border-indigo-100
                                                                       rounded-lg hover:bg-indigo-100 transition-colors"
                                                            title="Exportar recetas de este cliente"
                                                        >
                                                            <Download size={13} /> Exportar
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setImportingClientId(clientId);
                                                                setTimeout(() => importInputRef.current?.click(), 50);
                                                            }}
                                                            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold
                                                                       text-emerald-600 bg-emerald-50 border border-emerald-100
                                                                       rounded-lg hover:bg-emerald-100 transition-colors"
                                                            title="Importar recetas para este cliente"
                                                        >
                                                            <Upload size={13} /> Importar
                                                        </button>
                                                    </>
                                                )}
                                                <Badge variant="default" className="bg-slate-200 text-slate-700 hover:bg-slate-300">
                                                    {productCount} Productos
                                                </Badge>
                                            </div>
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
                                                                                        SKU: PRD-{product.id.toString().padStart(4, '0')} {v ? `- ${v.version_name}` : ''}
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
                                                                        {v?.blueprint_path ? (
                                                                            <>
                                                                                <button onClick={(e) => { e.stopPropagation(); handleViewBlueprint(v.blueprint_path!); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="Ver Plano"><FileText size={16}/></button>
                                                                                {!isSales && <button onClick={(e) => { e.stopPropagation(); handleDeleteVersionBlueprint(e, v.id!); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Quitar Plano"><FileMinus size={16}/></button>}
                                                                            </>
                                                                        ) : (
                                                                            !isSales && v ? <button onClick={(e) => { e.stopPropagation(); handleUploadClick(v.id!); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Adjuntar Plano a esta versión"><Paperclip size={16}/></button> : null
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

                    {/* --- MÓDULO 2B: LOTES DE PRODUCCIÓN --- */}
                    {currentView === 'SIMULATOR_BATCHES' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-6 
                        pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 
                           flex items-center gap-2">
                                        <Package className="text-blue-500"/>
                                        Lotes de Producción
                                    </h2>
                                    <p className="text-slate-500 text-sm mt-1">
                                        Lotes vivos enviados a fábrica (DRAFT · EN ESPERA ·
                                        EN PRODUCCIÓN).
                                    </p>
                                </div>
                                <button
                                    onClick={loadLiveBatches}
                                    className="flex items-center gap-2 text-sm text-slate-500 
                       hover:text-blue-600 border border-slate-200 
                       rounded-lg px-3 py-2 hover:bg-blue-50 transition"
                                >
                                    <RefreshCw size={14} /> Actualizar
                                </button>
                            </div>

                            {loadingLiveBatches ? (
                                <div className="flex justify-center py-12 text-slate-400">
                                    <RefreshCw className="animate-spin mr-2" size={20} />
                                    Cargando lotes...
                                </div>
                            ) : liveBatches.length === 0 ? (
                                <Card className="p-12 text-center bg-white border 
                           border-slate-200 shadow-sm flex flex-col 
                           items-center justify-center">
                                    <Package size={48} className="text-blue-200 mb-4"/>
                                    <h3 className="text-xl font-bold text-slate-700">
                                        No hay lotes activos en fábrica
                                    </h3>
                                    <p className="text-slate-400 text-sm mt-2">
                                        Los lotes aparecen aquí al crearlos desde el Simulador.
                                    </p>
                                </Card>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {liveBatches.map((batch: any) => {
                                        const cfg = batchStatusConfig[batch.status]
                                            ?? { label: batch.status, color: 'bg-gray-100 text-gray-600' };
                                        return (
                                            <div
                                                key={batch.id}
                                                className="bg-white rounded-xl border border-slate-200 
                             shadow-sm overflow-hidden"
                                            >
                                                {/* Header del lote */}
                                                <div className="flex items-center justify-between 
                                  px-5 py-3 bg-slate-50 
                                  border-b border-slate-200">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-black text-slate-800 text-sm">
                                                            {batch.folio}
                                                        </span>
                                                        <span className="text-xs font-semibold px-2 py-0.5 
                                       rounded-full bg-slate-200 
                                       text-slate-600">
                                                            {batch.batch_type}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-bold px-3 py-1 
                                     rounded-full ${cfg.color}`}>
                                                            {cfg.label}
                                                        </span>
                                                        {batch.status === 'DRAFT' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteBatch(batch.id, batch.folio)}
                                                                disabled={deletingBatchId === batch.id}
                                                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg
                   text-xs font-bold border border-red-300
                   text-red-600 bg-red-50 hover:bg-red-100
                   transition disabled:opacity-40"
                                                            >
                                                                {deletingBatchId === batch.id ? 'Deteniendo...' : '🛑 ALTO'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Instancias del lote */}
                                                {(batch.instances || []).length === 0 ? (
                                                    <p className="px-5 py-3 text-xs text-slate-400 italic">
                                                        Sin instancias asignadas.
                                                    </p>
                                                ) : (
                                                    <div className="divide-y divide-slate-100">
                                                        {(batch.instances || []).map((inst: any) => (
                                                            <div
                                                                key={inst.id}
                                                                className="px-5 py-3 flex items-center gap-3
                                                                                 hover:bg-slate-50 transition-colors"
                                                            >
                                                                {/* OV */}
                                                                <span className="text-xs font-mono font-bold text-indigo-600
                                                                                 shrink-0 bg-indigo-50 px-2 py-0.5 rounded-lg
                                                                                 border border-indigo-100">
                                                                    {inst.order_folio || `#${inst.id}`}
                                                                </span>

                                                                {/* Cliente */}
                                                                <span className="text-xs text-slate-500 shrink-0 max-w-[120px]
                                                                                 truncate" title={inst.client_name || ''}>
                                                                    {inst.client_name || '—'}
                                                                </span>

                                                                <span className="text-slate-200 shrink-0">·</span>

                                                                {/* Proyecto */}
                                                                <span className="text-xs text-slate-500 shrink-0 max-w-[130px]
                                                                                 truncate" title={inst.project_name || ''}>
                                                                    {inst.project_name || '—'}
                                                                </span>

                                                                <span className="text-slate-200 shrink-0">·</span>

                                                                {/* Nombre de instancia */}
                                                                <span className="text-sm font-bold text-slate-800 flex-1
                                                                                 min-w-0 truncate" title={inst.custom_name || ''}>
                                                                    {inst.custom_name || '—'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* MODALES COMPARTIDOS */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Editar Producto" : "Nuevo Producto"}>
                 <div className="space-y-5 py-2">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cliente Asignado</label>
                        <select className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none shadow-sm" value={formState.client_id} onChange={(e) => {
                                        setFormState({...formState, client_id: Number(e.target.value), name: ''});
                                        setShowProductSuggestions(false);
                                    }}>
                            <option value={0}>-- Catálogo Interno (Stock) --</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                        </select>
                    </div>
                    <div className="relative">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            Nombre del Producto
                            {formState.client_id > 0 && clientProducts.length > 0 && (
                                <span className="ml-2 text-xs font-normal text-slate-400">
                                    ({clientProducts.length} productos existentes para este cliente)
                                </span>
                            )}
                        </label>
                        <Input
                            placeholder="Ej. Cocina Tipo A - Torre Norte"
                            value={formState.name}
                            onChange={(e) => {
                                setFormState({...formState, name: e.target.value});
                                setShowProductSuggestions(true);
                            }}
                            onFocus={() => setShowProductSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowProductSuggestions(false), 200)}
                            className="shadow-sm"
                        />
                        {showProductSuggestions && formState.client_id > 0 && filteredProductSuggestions.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-xl border border-slate-200 max-h-52 overflow-auto">
                                {exactMatch && (
                                    <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                                        <AlertCircle size={14} className="text-amber-600 shrink-0"/>
                                        <span className="text-xs font-semibold text-amber-700">
                                            Ya existe un producto con este nombre exacto
                                        </span>
                                    </div>
                                )}
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                    Productos existentes de este cliente
                                </div>
                                {filteredProductSuggestions.map(p => (
                                    <div
                                        key={p.id}
                                        onMouseDown={async () => {
                                            setIsModalOpen(false);
                                            if (p.versions && p.versions.length > 0) {
                                                navigate(`/design/versions/${p.versions[0].id}`);
                                            } else {
                                                try {
                                                    const newVersion = await designService.createVersion({
                                                        master_id: p.id,
                                                        version_name: "V1.0",
                                                        status: VersionStatus.DRAFT,
                                                        is_active: true,
                                                        components: []
                                                    });
                                                    await loadMasters();
                                                    navigate(`/design/versions/${newVersion.id}`);
                                                } catch {
                                                    alert("Error al abrir el producto.");
                                                }
                                            }
                                        }}
                                        className="px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50
                                                   hover:text-indigo-700 cursor-pointer border-b
                                                   border-slate-100 last:border-b-0 flex items-center
                                                   justify-between group"
                                    >
                                        <span className="font-medium">{p.name}</span>
                                        <span className="text-[10px] text-slate-400 group-hover:text-indigo-400
                                                         font-mono shrink-0 ml-2">
                                            PRD-{p.id.toString().padStart(4, '0')}
                                            {p.versions?.[0]?.version_name ? ` · ${p.versions[0].version_name}` : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
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