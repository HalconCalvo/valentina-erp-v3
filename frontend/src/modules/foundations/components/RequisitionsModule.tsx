import React, { useState, useEffect } from 'react';
import { 
    ClipboardList, AlertTriangle, Clock, CheckCircle, Package, 
    Snowflake, ArrowLeft, Search, Plus, X, Tag, ArrowUpRight, Trash2 
} from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';

interface Material { id: number; sku: string; name: string; physical_stock: number; min_stock: number; usage_unit: string; }
interface Requisition { id: number; material_id: number; custom_description?: string; requested_quantity: number; status: string; notes: string; created_at: string; }

type RequisitionSubSection = 'NEW' | 'CRITICAL' | 'FROZEN' | null;

interface RequisitionsModuleProps {
    onSubSectionChange?: (isActive: boolean) => void;
}

export const RequisitionsModule: React.FC<RequisitionsModuleProps> = ({ onSubSectionChange }) => {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [orders, setOrders] = useState<any[]>([]); 
    const [isLoading, setIsLoading] = useState(false);
    const [activeSubSection, setActiveSubSection] = useState<RequisitionSubSection>(null);

    const [showManualForm, setShowManualForm] = useState(false);
    const [isCatalogItem, setIsCatalogItem] = useState(true);
    const [manualMatId, setManualMatId] = useState('');
    const [customDesc, setCustomDesc] = useState('');
    const [manualQty, setManualQty] = useState('');
    const [manualNotes, setManualNotes] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showMatDropdown, setShowMatDropdown] = useState(false);

    useEffect(() => {
        if (onSubSectionChange) {
            onSubSectionChange(activeSubSection !== null);
        }
    }, [activeSubSection, onSubSectionChange]);

    const loadData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [matRes, reqRes, ordRes] = await Promise.all([
                axiosClient.get('/foundations/materials/'), 
                axiosClient.get('/purchases/requisitions/'),
                axiosClient.get('/purchases/orders/')
            ]);
            
            setMaterials(matRes.data);
            setRequisitions(Array.isArray(reqRes.data) ? reqRes.data : []);
            setOrders(Array.isArray(ordRes.data) ? ordRes.data : []);
        } catch (error) { 
            console.error("Error cargando datos", error); 
        } finally { 
            if (!silent) setIsLoading(false); 
        }
    };

    useEffect(() => { 
        loadData(); 
        const interval = setInterval(() => loadData(true), 15000);
        return () => clearInterval(interval);
    }, []);

    // ---> FILTROS ROBUSTOS <---
    const pendingReqs = requisitions.filter(r => {
        const s = r.status?.toUpperCase();
        return s === 'PENDIENTE' || s === 'EN_COMPRA';
    });

    const frozenReqs = requisitions.filter(r => r.status?.toUpperCase() === 'APLAZADA');

    const reqMaterialIds = [...pendingReqs, ...frozenReqs].map(r => r.material_id);
    const activeOrders = orders.filter(o => ['BORRADOR', 'AUTORIZADA', 'ENVIADA'].includes(o.status?.toUpperCase()));
    const orderMaterialIds = activeOrders.flatMap(o => o.items?.map((i: any) => i.material_id) || []);

    const materialesAtendidos = [...reqMaterialIds, ...orderMaterialIds];
    
    const criticalStock = materials.filter(m => 
        (m.min_stock || 0) > 0 && 
        (m.physical_stock || 0) <= (m.min_stock || 0) &&
        !materialesAtendidos.includes(m.id)
    );

    const handleUpdateStatus = async (id: number, newStatus: string) => {
        try {
            await axiosClient.put(`/purchases/requisitions/${id}/status?status=${newStatus}`);
            loadData(true); 
        } catch (error) { alert("Error al actualizar estatus"); }
    };

    const handleDeleteReq = async (id: number) => {
        if (!window.confirm("¿Seguro que deseas ELIMINAR esta solicitud manual?")) return;
        try {
            await axiosClient.delete(`/purchases/requisitions/${id}`);
            loadData(true);
        } catch (error) { alert("Error al eliminar."); }
    };

    const handleCreateManualReq = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isCatalogItem && !manualMatId) return alert("Selecciona material.");
        setIsLoading(true);
        try {
            await axiosClient.post('/purchases/requisitions/', {
                material_id: isCatalogItem ? parseInt(manualMatId) : null,
                custom_description: !isCatalogItem ? customDesc : null,
                requested_quantity: parseFloat(manualQty),
                notes: manualNotes.trim() ? `[MANUAL] ${manualNotes}` : "[MANUAL] Petición Ad-hoc"
            });
            setManualMatId(''); setCustomDesc(''); setManualQty(''); setManualNotes('');
            setSearchTerm(''); setShowManualForm(false);
            loadData(true);
        } catch (error) { alert("Error al crear"); }
        finally { setIsLoading(false); }
    };
    
    const handleQuickRestock = async (material: Material) => {
        setIsLoading(true);
        let qtyToOrder = material.min_stock > 0 ? material.min_stock : 1; 
        try {
            await axiosClient.post('/purchases/requisitions/', {
                material_id: material.id,
                custom_description: null,
                requested_quantity: qtyToOrder,
                notes: `[AUTO] Reposición por stock crítico. Actual: ${material.physical_stock}`
            });
            loadData(true);
        } catch (error) { alert("Error al crear requisición."); }
        finally { setIsLoading(false); }
    };
    
    const getMaterialName = (req: Requisition) => {
        if (req.custom_description && req.custom_description !== 'REPOSICIÓN AUTOMÁTICA') return <span className="flex items-center gap-1 text-red-700 font-black"><Tag size={14}/> {req.custom_description}</span>;
        const mat = materials.find(m => m.id === req.material_id);
        return mat ? `[${mat.sku}] ${mat.name}` : `ID: ${req.material_id}`;
    };

    const filteredMaterials = materials.filter(m => 
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isAutomaticReq = (req: Requisition) => {
        const notes = req.notes || '';
        const desc = req.custom_description || '';
        return notes.includes('Valentina') || notes.includes('[AUTO]') || desc === 'REPOSICIÓN AUTOMÁTICA';
    };

    const renderNewRequestsTable = () => (
        <Card className="p-8 bg-white animate-in slide-in-from-right-4 duration-300 space-y-6 rounded-3xl border-slate-100 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter"><ClipboardList className="text-red-600"/> Solicitudes de la Fábrica</h3>
                    <p className="text-slate-500 font-medium italic text-sm">Gestión de requisiciones pendientes.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setShowManualForm(!showManualForm)} className={`${showManualForm ? 'bg-slate-500' : 'bg-red-600 hover:bg-red-700'} text-white font-black uppercase text-[10px] tracking-widest px-4 shadow-md`}>
                        {showManualForm ? <X size={16} className="mr-2"/> : <Plus size={16} className="mr-2"/>} {showManualForm ? 'Cancelar' : 'Nueva Manual'}
                    </Button>
                    <Button onClick={() => setActiveSubSection(null)} variant="outline" className="font-black uppercase text-[10px] tracking-widest px-4 border-slate-300"><ArrowLeft size={16} className="mr-2"/> Regresar</Button>
                </div>
            </div>

            {showManualForm && (
                <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 mb-6 relative z-30">
                    <form onSubmit={handleCreateManualReq} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-4 relative">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <input type="text" placeholder="Buscar por SKU o Nombre..." className="w-full text-sm border border-slate-300 rounded-lg pl-9 pr-4 py-2 bg-white" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setShowMatDropdown(true); }} onFocus={() => setShowMatDropdown(true)} />
                                {showMatDropdown && (
                                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-2xl mt-1 max-h-48 overflow-auto">
                                        {filteredMaterials.map(m => (
                                            <li key={m.id} className="px-4 py-2 hover:bg-red-50 cursor-pointer text-sm border-b border-slate-50" onClick={() => { setManualMatId(m.id.toString()); setSearchTerm(`[${m.sku}] ${m.name}`); setShowMatDropdown(false); }}>
                                                <span className="font-bold text-red-700">[{m.sku}]</span> <span className="text-slate-700">{m.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <input type="number" step="0.01" className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2" value={manualQty} onChange={e => setManualQty(e.target.value)} placeholder="Cant." />
                        </div>
                        <div className="md:col-span-4">
                            <input type="text" className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2" value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="Notas..." />
                        </div>
                        <div className="md:col-span-2">
                            <Button type="submit" className="w-full bg-red-600 text-white font-black text-xs uppercase h-10 shadow-md">Solicitar</Button>
                        </div>
                    </form>
                </div>
            )}

            {pendingReqs.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <CheckCircle className="mx-auto text-emerald-400 mb-4" size={48}/><p className="text-emerald-600 font-black uppercase tracking-widest text-sm">Todo al día</p>
                </div>
            ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative z-10">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] border-b border-slate-200">
                            <tr><th className="p-4">Material / Solicitud</th><th className="p-4 text-center">Cantidad</th><th className="p-4">Notas</th><th className="p-4 text-right">Acciones</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {pendingReqs.map(req => (
                                <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-bold text-slate-700 uppercase">
                                        <div className="flex flex-col">
                                            {getMaterialName(req)}
                                            {isAutomaticReq(req) && <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-1">Alarma del Sistema</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center text-red-700 font-black text-lg">{req.requested_quantity}</td>
                                    <td className="p-4 text-slate-500 italic text-xs max-w-xs truncate">{req.notes || 'Sin notas'}</td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        {req.status?.toUpperCase() === 'PENDIENTE' ? (
                                            <button onClick={() => handleUpdateStatus(req.id, 'EN_COMPRA')} title="Autorizar" className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100"><CheckCircle size={18}/></button>
                                        ) : (
                                            <span className="text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-1 rounded border border-emerald-200 flex items-center gap-1"><CheckCircle size={12}/> Autorizada</span>
                                        )}
                                        
                                        {/* Copo de nieve visible para TODAS (Auto y Manuales) */}
                                        <button onClick={() => handleUpdateStatus(req.id, 'APLAZADA')} title="Congelar / Aplazar Compra" className="p-2 bg-blue-50 text-blue-500 rounded-xl border border-blue-100 hover:bg-blue-600 hover:text-white transition-colors"><Snowflake size={18}/></button>
                                        
                                        {/* Basurero SOLO para las Manuales */}
                                        {!isAutomaticReq(req) && (
                                            <button onClick={() => handleDeleteReq(req.id)} title="Eliminar Solicitud Manual" className="p-2 bg-rose-50 text-rose-500 rounded-xl border border-rose-100 hover:bg-rose-600 hover:text-white transition-colors"><Trash2 size={18}/></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );

    const renderCriticalStockTable = () => (
        <Card className="p-8 bg-white animate-in slide-in-from-right-4 duration-300 space-y-6 rounded-3xl border-slate-100 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter"><AlertTriangle className="text-orange-500"/> Alertas de Stock Crítico</h3>
                    <p className="text-slate-500 font-medium italic text-sm">Materiales bajo el punto de reorden.</p>
                </div>
                <Button onClick={() => setActiveSubSection(null)} variant="outline" className="font-black uppercase text-[10px] tracking-widest px-4 border-slate-300"><ArrowLeft size={16} className="mr-2"/> Regresar</Button>
            </div>

            {criticalStock.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <Package className="mx-auto text-emerald-300 mb-4" size={48}/><p className="text-emerald-600 font-black uppercase tracking-widest text-sm">Almacén Saludable</p>
                </div>
            ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative z-10">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] border-b border-slate-200">
                            <tr><th>Material / SKU</th><th className="text-center">Stock Actual</th><th className="text-center">Mínimo</th><th className="text-right">Acción</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {criticalStock.map(mat => (
                                <tr key={mat.id}>
                                    <td className="p-4 font-bold text-slate-700 uppercase">{mat.name}</td>
                                    <td className="p-4 text-center text-orange-600 font-black">{mat.physical_stock}</td>
                                    <td className="p-4 text-center text-slate-400">{mat.min_stock}</td>
                                    <td className="p-4 text-right"><Button onClick={() => handleQuickRestock(mat)} size="sm" className="bg-orange-500 text-white font-black text-[10px] uppercase">Solicitar</Button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );

    const renderFrozenReqsTable = () => (
        <Card className="p-8 bg-white animate-in slide-in-from-right-4 duration-300 space-y-6 rounded-3xl border-slate-100 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter"><Snowflake className="text-slate-400"/> La Congeladora</h3>
                    <p className="text-slate-500 font-medium italic text-sm">Compras aplazadas.</p>
                </div>
                <Button onClick={() => setActiveSubSection(null)} variant="outline" className="font-black uppercase text-[10px] tracking-widest px-4 border-slate-300"><ArrowLeft size={16} className="mr-2"/> Regresar</Button>
            </div>

            {frozenReqs.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <Snowflake className="mx-auto text-slate-200 mb-4" size={48}/><p className="text-slate-400 font-black uppercase tracking-widest text-sm">Bandeja Vacía</p>
                </div>
            ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative z-10">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] border-b border-slate-200">
                            <tr>
                                <th className="p-4">Material / Solicitud</th>
                                <th className="p-4 text-center">Cantidad</th>
                                <th className="p-4">Notas de Pausa</th>
                                <th className="p-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {frozenReqs.map(req => (
                                <tr key={req.id}>
                                    <td className="p-4 font-bold text-slate-700">
                                        <div className="flex flex-col">
                                            {getMaterialName(req)}
                                            {isAutomaticReq(req) && <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-1">Alarma Pausada</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center text-slate-600 font-black">{req.requested_quantity}</td>
                                    <td className="p-4 text-slate-400 italic text-xs max-w-xs truncate">{req.notes || 'Sin observaciones'}</td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => handleUpdateStatus(req.id, 'PENDIENTE')} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 flex items-center gap-2 ml-auto hover:bg-indigo-600 hover:text-white transition-colors">
                                            <Clock size={16}/><span className="text-[10px] font-black uppercase">Descongelar</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );

    if (activeSubSection === 'NEW') return renderNewRequestsTable();
    if (activeSubSection === 'CRITICAL') return renderCriticalStockTable();
    if (activeSubSection === 'FROZEN') return renderFrozenReqsTable(); 

    const subMenuItems = [
        { id: 'NEW', title: 'A. PENDIENTES', count: pendingReqs.length, color: 'red', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100', desc: 'Solicitudes de Fábrica' },
        { id: 'CRITICAL', title: 'B. CRÍTICO', count: criticalStock.length, color: 'orange', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100', desc: 'Stock bajo el mínimo' },
        { id: 'FROZEN', title: 'C. CONGELADORA', count: frozenReqs.length, color: 'slate', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100', desc: 'Requisiciones Aplazadas' },
    ];

    return (
        <div className="space-y-8">
            {activeSubSection === null && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    {subMenuItems.map(item => (
                        <Card key={item.id} onClick={() => setActiveSubSection(item.id as RequisitionSubSection)} className={`p-6 cursor-pointer border-l-4 transition-all hover:-translate-y-1 bg-white shadow-sm border-l-${item.color}-500 relative h-40`}>
                            <div className={`absolute top-0 left-0 bottom-0 w-20 flex items-center justify-center border-r font-black text-3xl ${item.bg} ${item.text} ${item.border}`}>{item.count}</div>
                            <div className="ml-20 flex flex-col justify-between h-full">
                                <p className="text-[11px] font-black uppercase tracking-widest text-slate-800">{item.title}</p>
                                <div className="text-right"><p className={`text-xl font-black leading-none ${item.text}`}>{item.desc}</p></div>
                                <ArrowUpRight size={18} className="self-end text-slate-400" />
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};