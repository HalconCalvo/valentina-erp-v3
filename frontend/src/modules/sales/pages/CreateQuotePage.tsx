import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    Save, Plus, Trash2, Edit, 
    ArrowLeft, X, Pencil, AlertTriangle, RefreshCw, Loader
} from 'lucide-react';

import { useSales } from '../hooks/useSales';
import { useClients } from '../../foundations/hooks/useClients';
import { useFoundations } from '../../foundations/hooks/useFoundations';
import { designService } from '../../../api/design-service';
import { salesService } from '../../../api/sales-service'; 
import axios from 'axios'; 

import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import { SalesOrderItem, SalesOrderStatus } from '../../../types/sales';

// URL BASE
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// --- HELPERS ---
const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '$ 0.00';
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    }).format(amount);
};

const safeDate = (dateString: string | undefined | null) => {
    if (!dateString) return new Date().toISOString().split('T')[0];
    try {
        return new Date(dateString).toISOString().split('T')[0];
    } catch {
        return new Date().toISOString().split('T')[0];
    }
};

const CreateQuotePage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams(); 
    const isEditMode = Boolean(id);

    // Hooks
    const salesHook = useSales();
    const savingSales = salesHook?.loading;
    const clientHook = useClients();
    const foundationHook = useFoundations();

    // Data Segura
    const clients = clientHook?.clients && Array.isArray(clientHook.clients) ? clientHook.clients : [];
    const taxRates = foundationHook?.taxRates && Array.isArray(foundationHook.taxRates) ? foundationHook.taxRates : [];
    const config = foundationHook?.config || null;
    
    const [masters, setMasters] = useState<any[]>([]);

    // --- ESTADOS ---
    const [loadingData, setLoadingData] = useState(false); 
    const [saving, setSaving] = useState(false); 

    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [currentStatus, setCurrentStatus] = useState<SalesOrderStatus | null>(null);

    // --- ESTADO PARA COMISIÓN ---
    const [myCommissionRate, setMyCommissionRate] = useState<number>(0);
    const [loadingCommission, setLoadingCommission] = useState(false);

    // HEADER
    const [header, setHeader] = useState({
        client_id: 0,
        project_name: '',
        tax_rate_id: 0,
        valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        applied_margin_percent: 0, 
        notes: '',      
        conditions: ''  
    });

    const [items, setItems] = useState<SalesOrderItem[]>([]);
    
    // ITEM CONSTRUCTOR
    const [lineItem, setLineItem] = useState({
        master_id: 0,
        version_id: 0,
        quantity: 1,
        unit_price: 0, 
        manual_name: '',
        frozen_cost: 0 
    });
    
    const [loadingCost, setLoadingCost] = useState<boolean>(false);
    const [addMode, setAddMode] = useState<'CATALOG' | 'MANUAL'>('CATALOG');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // --- 4. CARGA DE COMISIÓN (SILENCIOSA) ---
    const fetchUserCommission = async () => {
        setLoadingCommission(true);
        const token = localStorage.getItem('token');
        if (!token) {
            console.error("Token de autenticación no encontrado.");
            setLoadingCommission(false);
            return;
        }

        try {
            const url = `${API_URL}/api/v1/users/me`;
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            let rate = response.data.commission_rate;
            
            if (rate === undefined || rate === null) {
                rate = 0;
            }

            if (rate > 1) {
                rate = rate / 100;
            }
            
            setMyCommissionRate(rate); 

        } catch (e: any) {
            console.error("Error obteniendo datos del usuario:", e);
        } finally {
            setLoadingCommission(false);
        }
    };

    // --- 1. CARGA INICIAL ---
    useEffect(() => {
        const initPage = async () => {
            try {
                if (clientHook?.fetchClients) await clientHook.fetchClients();
                if (foundationHook?.fetchTaxRates) await foundationHook.fetchTaxRates();
                if (foundationHook?.fetchConfig) await foundationHook.fetchConfig(); 
                
                const filteredMasters = await designService.getMasters(undefined, true);
                setMasters(filteredMasters);

                if (!isEditMode) {
                    await fetchUserCommission();
                }

            } catch (error) {
                console.error("Error inicializando página", error);
            }
        };
        initPage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditMode]); 

    // --- 2. CARGAR DATOS SI ES EDICIÓN ---
    useEffect(() => {
        if (isEditMode && id) {
            const loadOrder = async () => {
                setLoadingData(true);
                try {
                    const data = await salesService.getOrderDetail(Number(id));
                    if (data) {
                        setHeader({
                            client_id: data.client_id || 0,
                            project_name: data.project_name || '',
                            tax_rate_id: data.tax_rate_id || 0,
                            valid_until: safeDate(data.valid_until),
                            applied_margin_percent: data.applied_margin_percent || 0,
                            notes: data.notes || '',
                            conditions: data.conditions || '' 
                        });
                        setItems(Array.isArray(data.items) ? data.items : []);
                        setCurrentStatus(data.status as SalesOrderStatus);
                        
                        if (data.applied_commission_percent !== undefined) {
                            let savedRate = data.applied_commission_percent;
                            if (savedRate > 1) savedRate = savedRate / 100;
                            setMyCommissionRate(savedRate);
                        }
                    }
                } catch (error) {
                    console.error("Error cargando orden:", error);
                    alert("No se pudo cargar la cotización.");
                    navigate('/sales');
                } finally {
                    setLoadingData(false); 
                }
            };
            loadOrder();
        }
    }, [id, isEditMode, navigate]);

    // --- 3. CONFIG DEFAULT ---
    useEffect(() => {
        if (!isEditMode && config && header.applied_margin_percent === 0) {
            const margin = Number(config.target_profit_margin) || 0;
            setHeader(prev => ({ ...prev, applied_margin_percent: margin }));
        }
    }, [config, isEditMode]);

    // --- FILTROS ---
    const mastersOfClient = useMemo(() => {
        if (!header.client_id) return [];
        return masters.filter(m => m.client_id === Number(header.client_id));
    }, [masters, header.client_id]);

    const availableCategories = useMemo(() => {
        const cats = mastersOfClient.map(m => m.category);
        return Array.from(new Set(cats));
    }, [mastersOfClient]);

    const filteredMasters = useMemo(() => {
        if (!selectedCategory) return [];
        return mastersOfClient.filter(m => m.category === selectedCategory);
    }, [mastersOfClient, selectedCategory]);

    const selectedMaster = filteredMasters.find(m => m.id === Number(lineItem.master_id));
    // @ts-ignore
    const availableVersions = (selectedMaster && Array.isArray(selectedMaster.versions)) ? selectedMaster.versions : [];

    // --- 5. LÓGICA FINANCIERA ---
    const itemsSum = useMemo(() => items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0), [items]);
    const commissionAmount = itemsSum * myCommissionRate;
    const finalSubtotal = itemsSum + commissionAmount;
    const selectedTaxRate = taxRates.find(t => t.id === header.tax_rate_id);
    const taxAmount = selectedTaxRate ? finalSubtotal * selectedTaxRate.rate : 0;
    const total = finalSubtotal + taxAmount;

    // --- 6. PRECIOS API ---
    useEffect(() => {
        let isMounted = true;
        const fetchAndCalculate = async () => {
            if (addMode === 'CATALOG' && lineItem.version_id) {
                setLoadingCost(true);
                try {
                    const detail = await designService.getVersion(Number(lineItem.version_id));
                    if (!isMounted) return;

                    const freshCost = Number(detail.estimated_cost) || 0;
                    const rawMarginInput = Number(header.applied_margin_percent) || 0;
                    let multiplier = 1;
                    if (rawMarginInput > 0 && rawMarginInput <= 1) multiplier = 1 + rawMarginInput;
                    else multiplier = 1 + (rawMarginInput / 100);

                    const calculatedPrice = freshCost * multiplier;
                    setLineItem(prev => ({ ...prev, unit_price: parseFloat(calculatedPrice.toFixed(2)), frozen_cost: freshCost }));
                } catch (error) { console.error(error); } 
                finally { if (isMounted) setLoadingCost(false); }
            }
        };
        fetchAndCalculate();
        return () => { isMounted = false; };
    }, [lineItem.version_id, header.applied_margin_percent, addMode]);


    // --- HANDLERS ---
    const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setHeader({...header, client_id: Number(e.target.value)});
        setSelectedCategory('');
        setLineItem({...lineItem, master_id: 0, version_id: 0, unit_price: 0, frozen_cost: 0});
        setEditingIndex(null); 
    };

    const handleEditItem = (index: number) => {
        const item = items[index];
        setEditingIndex(index);
        const newItemState = {
            master_id: 0, version_id: 0, quantity: item.quantity,
            unit_price: item.unit_price, manual_name: item.product_name, frozen_cost: item.frozen_unit_cost || 0
        };
        if (item.origin_version_id) {
            setAddMode('CATALOG');
            let found = false;
            for (const m of masters) {
                const v = m.versions?.find((ver:any) => ver.id === item.origin_version_id);
                if (v) { setSelectedCategory(m.category); newItemState.master_id = m.id; newItemState.version_id = v.id; found = true; break; }
            }
            if (!found) setAddMode('MANUAL');
        } else { setAddMode('MANUAL'); }
        setLineItem(newItemState);
    };

    const handleCancelEdit = () => {
        setEditingIndex(null);
        setLineItem({...lineItem, master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: ''});
        setAddMode('CATALOG');
    };

    const handleAddItem = () => {
        if (lineItem.quantity <= 0 || lineItem.unit_price <= 0) { alert("Precio/Cantidad inválidos"); return; }
        let productName = lineItem.manual_name;
        if (addMode === 'CATALOG') {
            const v = availableVersions.find((x:any) => x.id === Number(lineItem.version_id));
            if (!v) { alert("Error versión"); return; }
            productName = `${selectedMaster?.name} - ${v.version_name}`;
        }
        const newItem: SalesOrderItem = {
            id: editingIndex !== null ? items[editingIndex].id : -Date.now(), 
            product_name: productName,
            origin_version_id: addMode === 'CATALOG' ? Number(lineItem.version_id) : null,
            quantity: Number(lineItem.quantity),
            unit_price: Number(lineItem.unit_price),
            frozen_unit_cost: addMode === 'CATALOG' ? lineItem.frozen_cost : (editingIndex !== null ? items[editingIndex].frozen_unit_cost : 0)
        };
        const updatedItems = [...items];
        if (editingIndex !== null) { updatedItems[editingIndex] = newItem; setEditingIndex(null); } 
        else { updatedItems.push(newItem); }
        setItems(updatedItems);
        setLineItem(prev => ({...prev, quantity: 1, manual_name: '', master_id: 0, version_id: 0, unit_price: 0})); 
    };

    const handleRemoveItem = (id?: number) => {
        setItems(items.filter(i => i.id !== id));
        if (editingIndex !== null) handleCancelEdit();
    };

    const handleSubmit = async () => {
        if (!header.client_id || !header.project_name || !header.tax_rate_id || items.length === 0) { alert("Faltan datos obligatorios"); return; }
        
        // --- CAMBIO: Se eliminó la confirmación de ventana ---
        // El usuario ya ve la alerta amarilla en la UI, guardamos directo.
        
        setSaving(true);
        try {
            const cleanItems = items.map((item) => ({
                product_name: item.product_name,
                origin_version_id: item.origin_version_id || null, 
                quantity: Number(item.quantity), unit_price: Number(item.unit_price),
                frozen_unit_cost: Number(item.frozen_unit_cost || 0), cost_snapshot: item.cost_snapshot || {}
            }));
            const payload = {
                client_id: Number(header.client_id), project_name: header.project_name,
                tax_rate_id: Number(header.tax_rate_id), valid_until: new Date(header.valid_until).toISOString(),
                applied_margin_percent: Number(header.applied_margin_percent), applied_tolerance_percent: 3.0,
                currency: 'MXN', is_warranty: false, notes: header.notes, conditions: header.conditions, items: cleanItems 
            };
            if (isEditMode && id) {
                await salesService.updateOrder(Number(id), payload);
                // Usamos un alert simple de éxito, pero sin bloquear el flujo previo
                alert("✅ Cotización Actualizada.");
            } else {
                await salesService.createOrder(payload);
                alert("✅ Cotización Creada Exitosamente.");
            }
            navigate('/sales');
        } catch (error: any) { alert("Error al guardar: " + (error.response?.data?.detail || error.message)); } 
        finally { setSaving(false); }
    };

    if (loadingData) return <div className="text-center p-10"><Loader className="animate-spin mx-auto"/> Cargando...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20 bg-slate-50 min-h-full">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    {isEditMode ? <Edit className="text-indigo-600"/> : <Plus className="text-emerald-600"/>}
                    {isEditMode ? `Editando Cotización #${id}` : 'Nueva Cotización'}
                </h1>
                <Button variant="secondary" onClick={() => navigate('/sales')}><ArrowLeft size={18} className="mr-2"/> Regresar</Button>
            </div>

            {isEditMode && (currentStatus === SalesOrderStatus.ACCEPTED || currentStatus === SalesOrderStatus.SENT) && (
                <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 rounded shadow-sm flex items-center gap-3 animate-pulse-slow">
                    <AlertTriangle className="shrink-0" />
                    <div>
                        <p className="font-bold">Modo de Edición Restrictiva</p>
                        <p className="text-sm">Esta cotización ya fue enviada o aceptada. Si guardas cambios, perderá su autorización y volverá a estatus "EN AJUSTES".</p>
                    </div>
                </div>
            )}

            {/* 1. DATOS GENERALES */}
            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">CLIENTE *</label>
                            <select className="w-full p-2 border border-slate-300 rounded bg-slate-50" value={header.client_id} onChange={handleClientChange}>
                                <option value={0}>-- Seleccionar --</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">PROYECTO *</label>
                            <Input value={header.project_name} onChange={(e) => setHeader({...header, project_name: e.target.value})}/>
                        </div>
                    </div>
                    <div className="space-y-4 border-l pl-6 border-slate-100">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">IMPUESTO *</label>
                            <select className="w-full p-2 border border-slate-300 rounded text-sm" value={header.tax_rate_id} onChange={(e) => setHeader({...header, tax_rate_id: Number(e.target.value)})}>
                                <option value={0}>-- Seleccionar --</option>
                                {taxRates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.rate * 100}%)</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">VIGENCIA</label>
                            <Input type="date" value={header.valid_until} onChange={(e) => setHeader({...header, valid_until: e.target.value})}/>
                        </div>
                    </div>
                </div>
            </Card>

            {/* 2. OBSERVACIONES */}
            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">NOTAS</label><textarea className="w-full p-2 border rounded text-sm h-20" value={header.notes} onChange={(e) => setHeader({...header, notes: e.target.value})}/></div>
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">CONDICIONES</label><textarea className="w-full p-2 border rounded text-sm h-20" value={header.conditions} onChange={(e) => setHeader({...header, conditions: e.target.value})}/></div>
                </div>
            </Card>

            {/* 3. CONSTRUCTOR */}
            <div className="flex flex-col lg:flex-row gap-6">
                <div className={`w-full lg:w-1/3 p-6 rounded-xl border ${editingIndex !== null ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                    <div className="space-y-4">
                        {addMode === 'CATALOG' ? (
                            <>
                                <div>
                                    <label className="text-xs font-bold text-slate-500">CATEGORÍA</label>
                                    <select className="w-full p-2 border rounded text-sm" value={selectedCategory} disabled={!header.client_id} onChange={(e) => { setSelectedCategory(e.target.value); setLineItem({...lineItem, master_id: 0, version_id: 0}); }}>
                                        <option value="">-- Seleccionar --</option>
                                        {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500">PRODUCTO</label>
                                    <select className="w-full p-2 border rounded text-sm" value={lineItem.master_id} disabled={!selectedCategory} onChange={(e) => setLineItem({...lineItem, master_id: Number(e.target.value), version_id: 0})}>
                                        <option value={0}>-- Seleccionar --</option>
                                        {filteredMasters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500">VERSIÓN</label>
                                    <select className="w-full p-2 border rounded text-sm" disabled={!lineItem.master_id} value={lineItem.version_id} onChange={(e) => setLineItem({...lineItem, version_id: Number(e.target.value)})}>
                                        <option value={0}>-- Seleccionar --</option>
                                        {availableVersions.map((v:any) => <option key={v.id} value={v.id}>{v.version_name}</option>)}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <Input placeholder="Producto manual..." value={lineItem.manual_name} onChange={(e) => setLineItem({...lineItem, manual_name: e.target.value})}/>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <Input type="number" placeholder="Cant" value={lineItem.quantity} onChange={(e) => setLineItem({...lineItem, quantity: Number(e.target.value)})}/>
                            <div className="relative">
                                {loadingCost ? <span className="text-xs text-slate-400">Cargando...</span> : 
                                <Input type={addMode === 'CATALOG' ? "text" : "number"} readOnly={addMode==='CATALOG'} className={addMode==='CATALOG' ? 'bg-slate-100' : ''} value={addMode==='CATALOG' ? formatCurrency(lineItem.unit_price).replace('MX$', '') : lineItem.unit_price} onChange={(e) => addMode==='MANUAL' && setLineItem({...lineItem, unit_price: Number(e.target.value)})}/>}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button className="flex-1" onClick={handleAddItem}>{editingIndex !== null ? 'Actualizar' : 'Agregar'}</Button>
                            {editingIndex !== null && <Button variant="secondary" onClick={handleCancelEdit}><X size={16}/></Button>}
                        </div>
                    </div>
                </div>

                {/* TABLA DERECHA */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex-1 overflow-x-auto min-h-[300px] p-0">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b text-xs text-slate-500 uppercase"><tr><th className="px-4 py-2">Producto</th><th className="text-center">Cant.</th><th className="text-right">Unitario</th><th className="text-right px-4">Total</th><th className="text-center"></th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item, idx) => (
                                    <tr key={idx} className={editingIndex === idx ? 'bg-amber-50' : ''}>
                                        <td className="px-4 py-2">{item.product_name}</td>
                                        <td className="text-center font-bold">{item.quantity}</td>
                                        <td className="text-right font-mono">{formatCurrency(item.unit_price)}</td>
                                        <td className="text-right px-4 font-bold font-mono">{formatCurrency(item.quantity * item.unit_price)}</td>
                                        <td className="text-center px-2">
                                            <button onClick={() => handleEditItem(idx)} className="text-indigo-500 mr-2"><Pencil size={16}/></button>
                                            <button onClick={() => handleRemoveItem(item.id)} className="text-red-500"><Trash2 size={16}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-200 text-right space-y-2">
                        <div className="flex justify-end gap-12 text-sm text-slate-500"><span>Suma Partidas:</span> <span className="font-mono">{formatCurrency(itemsSum)}</span></div>
                        
                        {/* LINEA DE COMISIÓN */}
                        <div className="flex justify-end gap-12 text-sm text-amber-600 font-bold border-b border-dashed border-slate-200 pb-2 mb-2">
                            <span className="flex items-center gap-1">
                                <Plus size={10}/> Comisión ({(myCommissionRate * 100).toFixed(1)}%):
                                {myCommissionRate === 0 && !isEditMode && (
                                    <button onClick={fetchUserCommission} disabled={loadingCommission} className="ml-2 text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50" title="Recargar">
                                        <RefreshCw size={12} className={loadingCommission ? "animate-spin" : ""}/>
                                    </button>
                                )}
                            </span> 
                            <span className="font-mono">{formatCurrency(commissionAmount)}</span>
                        </div>

                        <div className="flex justify-end gap-12 text-sm text-slate-700 font-bold"><span>Subtotal:</span> <span className="font-mono">{formatCurrency(finalSubtotal)}</span></div>
                        <div className="flex justify-end gap-12 text-sm text-slate-500"><span>IVA:</span> <span className="font-mono">{formatCurrency(taxAmount)}</span></div>
                        <div className="flex justify-end gap-12 text-xl font-black text-slate-800 border-t pt-2"><span>Total:</span> <span className="font-mono">{formatCurrency(total)}</span></div>
                        
                        <div className="flex justify-end gap-4 mt-4">
                            <Button className="w-64 bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={saving || savingSales}>
                                {saving ? 'Guardando...' : (isEditMode ? 'Actualizar' : 'Guardar')} <Save size={18} className="ml-2"/>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateQuotePage;