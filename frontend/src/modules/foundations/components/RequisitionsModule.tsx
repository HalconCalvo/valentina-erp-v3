import React, { useState, useEffect } from 'react';
import { 
    ClipboardList, AlertTriangle, Clock, Package,
    Snowflake, ArrowLeft, Search, Plus, X, Tag, ArrowUpRight
} from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface Material { id: number; sku: string; name: string; physical_stock: number; min_stock: number; usage_unit: string; }
interface Requisition { id: number; material_id: number; custom_description?: string; requested_quantity: number; status: string; notes: string; created_at: string; requested_by_user_id?: number; }

type RequisitionSubSection = 'CRITICAL' | 'FROZEN' | 'MINE' | 'NEW' | null;

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
    const [manualMatId, setManualMatId] = useState('');
    const [customDesc, setCustomDesc] = useState('');
    const [manualQty, setManualQty] = useState('');
    const [manualNotes, setManualNotes] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [skuSearch, setSkuSearch] = useState('');
    const [showMatDropdown, setShowMatDropdown] = useState(false);
    const [editingReq, setEditingReq] = useState<Requisition | null>(null);
    const currentUserId = parseInt(localStorage.getItem('user_id') || '0');

    useEffect(() => {
        if (onSubSectionChange) {
            onSubSectionChange(activeSubSection !== null);
        }
    }, [activeSubSection, onSubSectionChange]);

    const loadData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [matRes, reqRes, ordRes] = await Promise.all([
                axiosClient.get('/foundations/materials'), 
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
    const frozenReqs = requisitions.filter(r => r.status?.toUpperCase() === 'APLAZADA');

    const myReqs = requisitions.filter(r => 
        r.requested_by_user_id === currentUserId && 
        r.status?.toUpperCase() !== 'CANCELADA'
    );

    const reqMaterialIds = [...frozenReqs].map(r => r.material_id);
    const activeOrders = orders.filter(o => ['DRAFT', 'ENVIADA'].includes(o.status?.toUpperCase()));
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

    const handleCancelReq = async (id: number) => {
        if (!window.confirm("¿Cancelar esta solicitud? Quedará registrada como cancelada.")) return;
        try {
            await axiosClient.put(`/purchases/requisitions/${id}/cancel`);
            loadData(true);
        } catch (error: any) {
            alert(error.response?.data?.detail || "Error al cancelar.");
        }
    };

    const handleEditReq = async (req: Requisition, newQty: number, newNotes: string) => {
        try {
            await axiosClient.patch(`/purchases/requisitions/${req.id}`, {
                requested_quantity: newQty,
                notes: newNotes,
            });
            setEditingReq(null);
            loadData(true);
        } catch (error: any) {
            alert(error.response?.data?.detail || "Error al editar.");
        }
    };

    const handleCreateManualReq = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualMatId && !searchTerm.trim()) return alert("Ingresa un material o descripción.");
        setIsLoading(true);
        try {
            await axiosClient.post('/purchases/requisitions/', {
                material_id: manualMatId ? parseInt(manualMatId) : null,
                custom_description: !manualMatId ? searchTerm.trim() : null,
                requested_quantity: parseFloat(manualQty),
                notes: manualNotes.trim() ? `[MANUAL] ${manualNotes}` : "[MANUAL] Petición Ad-hoc"
            });
            setManualMatId(''); setCustomDesc(''); setManualQty(''); setManualNotes('');
            setSearchTerm(''); setSkuSearch(''); setShowManualForm(false);
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

    const renderNewRequisitionForm = () => (
        <Card className="p-8 bg-white animate-in slide-in-from-right-4 duration-300 space-y-6 rounded-3xl border-slate-100 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-6">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter">
                        <Plus className="text-indigo-500"/> Nueva Requisición
                    </h3>
                    <p className="text-slate-500 font-medium italic text-sm">Solicitud manual de material o servicio.</p>
                </div>
                <Button onClick={() => setActiveSubSection(null)} variant="outline" className="font-black uppercase text-[10px] tracking-widest px-4 border-slate-300">
                    <ArrowLeft size={16} className="mr-2"/> Regresar
                </Button>
            </div>

            <form onSubmit={handleCreateManualReq} className="space-y-6 max-w-xl">
                    {/* Búsqueda por SKU */}
                    <div className="relative">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-wider">SKU (opcional)</label>
                        <input
                            type="text"
                            placeholder="Ej. 0601-368, CHPCTA1BCO..."
                            value={skuSearch}
                            onChange={e => {
                                const val = e.target.value.toUpperCase();
                                setSkuSearch(val);
                                if (val.trim()) {
                                    const found = materials.find(m => m.sku.toUpperCase() === val.trim());
                                    if (found) {
                                        setManualMatId(String(found.id));
                                        setSearchTerm(`[${found.sku}] ${found.name}`);
                                    } else {
                                        setManualMatId('');
                                    }
                                } else {
                                    setManualMatId('');
                                    setSearchTerm('');
                                }
                            }}
                            className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono uppercase"
                        />
                        {skuSearch && materials.filter(m => m.sku.toUpperCase().includes(skuSearch)).length > 0 && (
                            <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-40 overflow-y-auto">
                                {materials.filter(m => m.sku.toUpperCase().includes(skuSearch)).slice(0, 8).map(m => (
                                    <div key={m.id}
                                        onClick={() => {
                                            setManualMatId(String(m.id));
                                            setSearchTerm(`[${m.sku}] ${m.name}`);
                                            setSkuSearch(m.sku);
                                            setShowMatDropdown(false);
                                        }}
                                        className="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-sm font-medium text-slate-700">
                                        <span className="font-mono text-xs text-indigo-600 mr-2">{m.sku}</span>{m.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                {/* Material o descripción libre */}
                <div className="relative">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Material o Descripción</label>
                    <input
                        type="text"
                        placeholder="Buscar material o escribir descripción..."
                        value={searchTerm}
                        onChange={e => {
                            setSearchTerm(e.target.value);
                            if (!e.target.value) setManualMatId('');
                            setShowMatDropdown(true);
                        }}
                        onFocus={() => setShowMatDropdown(true)}
                        required
                        className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                    />
                    {showMatDropdown && filteredMaterials.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                            {filteredMaterials.map(m => (
                                <div key={m.id}
                                    onClick={() => { setManualMatId(String(m.id)); setSearchTerm(`[${m.sku}] ${m.name}`); setShowMatDropdown(false); }}
                                    className="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-sm font-medium text-slate-700">
                                    <span className="font-mono text-xs text-slate-400 mr-2">{m.sku}</span>{m.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Cantidad */}
                <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Cantidad</label>
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0"
                        value={manualQty}
                        onChange={e => setManualQty(e.target.value)}
                        required
                        className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                    />
                </div>

                {/* Notas */}
                <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Notas (opcional)</label>
                    <textarea
                        placeholder="Motivo de la solicitud..."
                        value={manualNotes}
                        onChange={e => setManualNotes(e.target.value)}
                        rows={3}
                        className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                    />
                </div>

                <Button type="submit" disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest py-3">
                    <Plus size={16} className="mr-2"/> Crear Requisición
                </Button>
            </form>
        </Card>
    );

    const renderMyRequisitionsTable = () => (
        <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <ClipboardList className="text-purple-500"/> Mis Solicitudes
                </h3>
                <Button onClick={() => setActiveSubSection(null)} variant="outline" className="font-black uppercase text-[10px] tracking-widest px-4 border-slate-300">
                    <ArrowLeft size={16} className="mr-2"/> Regresar
                </Button>
            </div>
            {myReqs.length === 0 ? (
                <p className="text-center text-slate-400 py-8 font-medium">No tienes solicitudes activas.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                            <tr>
                                <th className="pb-3 font-black">Material</th>
                                <th className="pb-3 font-black text-center">Cantidad</th>
                                <th className="pb-3 font-black">Notas</th>
                                <th className="pb-3 font-black text-center">Estado</th>
                                <th className="pb-3 font-black text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {myReqs.map(req => (
                                <tr key={req.id} className="hover:bg-slate-50">
                                    <td className="py-3 font-medium text-slate-700">{getMaterialName(req)}</td>
                                    <td className="py-3 text-center font-black text-slate-800">{req.requested_quantity}</td>
                                    <td className="py-3 text-slate-500 text-xs">{req.notes}</td>
                                    <td className="py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                            req.status === 'PROCESADA' ? 'bg-emerald-50 text-emerald-700' :
                                            req.status === 'APLAZADA' ? 'bg-slate-100 text-slate-600' :
                                            req.status === 'CANCELADA' ? 'bg-red-50 text-red-600' :
                                            'bg-amber-50 text-amber-700'
                                        }`}>{req.status}</span>
                                    </td>
                                    <td className="py-3 text-center">
                                        <div className="flex justify-center gap-2">
                                            {!['PROCESADA', 'CANCELADA'].includes(req.status) && (
                                                <button
                                                    onClick={() => handleCancelReq(req.id)}
                                                    className="p-1.5 bg-red-50 text-red-500 rounded-md hover:bg-red-600 hover:text-white transition-colors border border-red-100"
                                                    title="Cancelar solicitud"
                                                >
                                                    <X size={14}/>
                                                </button>
                                            )}
                                        </div>
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

    if (activeSubSection === 'CRITICAL') return renderCriticalStockTable();
    if (activeSubSection === 'FROZEN') return renderFrozenReqsTable();
    if (activeSubSection === 'MINE') return renderMyRequisitionsTable();
    if (activeSubSection === 'NEW') return renderNewRequisitionForm();

    const subMenuItems = [
        { id: 'CRITICAL', title: 'A. URGENTES', count: criticalStock.length, color: 'orange', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100', desc: 'Stock crítico' },
        { id: 'FROZEN', title: 'B. APLAZADAS', count: frozenReqs.length, color: 'slate', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100', desc: 'Requisiciones aplazadas' },
        { id: 'MINE', title: 'C. MIS SOLICITUDES', count: myReqs.length, color: 'purple', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', desc: 'Creadas por mí' },
        { id: 'NEW', title: 'D. NUEVA SOLICITUD', count: '+', color: 'indigo', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', desc: 'Crear solicitud' },
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