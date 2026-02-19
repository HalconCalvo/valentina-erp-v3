import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    Save, Plus, Trash2, Edit, 
    ArrowLeft, X, Pencil, AlertTriangle, RefreshCw, Loader,
    CheckCircle2, TrendingUp, Lock, Wallet
} from 'lucide-react';

import { useSales } from '../hooks/useSales';
import { useClients } from '../../foundations/hooks/useClients';
import { useFoundations } from '../../foundations/hooks/useFoundations';
import { designService } from '../../../api/design-service';
import { salesService } from '../../../api/sales-service'; 
import client from '../../../api/axios-client'; 

import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import { SalesOrderItem, SalesOrderStatus } from '../../../types/sales';

// --- HELPERS DE FORMATO ---
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
    return <CreateQuoteContent key={id || 'new'} id={id} navigate={navigate} />;
};

const CreateQuoteContent: React.FC<{id?: string, navigate: any}> = ({ id, navigate }) => {
    const isEditMode = Boolean(id);
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
    const isDirector = ['ADMIN', 'ADMINISTRADOR', 'DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);

    const salesHook = useSales();
    const savingSales = salesHook?.loading || false;
    const clientHook = useClients();
    const foundationHook = useFoundations();

    const clients = clientHook?.clients || [];
    const taxRates = foundationHook?.taxRates || [];
    const config = foundationHook?.config || null;
    
    const [masters, setMasters] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(isEditMode); 
    const [saving, setSaving] = useState(false); 

    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [currentStatus, setCurrentStatus] = useState<SalesOrderStatus | null>(null);

    const [commissionRate, setCommissionRate] = useState<number>(0);
    const [loadingCommission, setLoadingCommission] = useState(false);

    const INITIAL_HEADER = {
        client_id: 0,
        project_name: '',
        tax_rate_id: 0,
        valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        applied_margin_percent: 0, 
        notes: '',      
        conditions: ''  
    };

    const [header, setHeader] = useState(INITIAL_HEADER);
    const [items, setItems] = useState<SalesOrderItem[]>([]);
    
    const [lineItem, setLineItem] = useState({
        master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0 
    });
    
    const [loadingCost, setLoadingCost] = useState<boolean>(false);
    const [addMode, setAddMode] = useState<'CATALOG' | 'MANUAL'>('CATALOG');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // 1. CARGA INICIAL
    useEffect(() => {
        const loadCatalogs = async () => {
            try {
                if (clientHook?.fetchClients) clientHook.fetchClients();
                if (foundationHook?.fetchTaxRates) foundationHook.fetchTaxRates();
                if (foundationHook?.fetchConfig) foundationHook.fetchConfig();
                
                const filteredMasters = await designService.getMasters(undefined, true);
                setMasters(filteredMasters || []);

                if (!isEditMode) {
                    fetchUserCommission();
                }
            } catch (error) {
                console.error("Error cargando catálogos", error);
            }
        };
        loadCatalogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    const fetchUserCommission = async () => {
        setLoadingCommission(true);
        try {
            const response = await client.get('/users/me');
            if(response.data) {
                let rate: any = response.data.commission_rate ?? response.data.commission;
                if (rate !== undefined && rate !== null) {
                    let numRate = parseFloat(String(rate));
                    if (!isNaN(numRate)) {
                        if (numRate > 1.0) numRate = numRate / 100;
                        setCommissionRate(numRate);
                    }
                }
            }
        } catch (e) { console.error(e); } 
        finally { setLoadingCommission(false); }
    };

    // 2. CONFIGURACIÓN DEFAULT (SOLO NUEVAS)
    useEffect(() => {
        if (!isEditMode && config) {
            const defaultMargin = Number(config.target_profit_margin) || 0;
            if (header.applied_margin_percent === 0 && defaultMargin > 0) {
                setHeader(prev => ({ ...prev, applied_margin_percent: defaultMargin }));
            }
            if (taxRates.length > 0 && header.tax_rate_id === 0) {
                const defaultTaxId = config.default_tax_rate_id || taxRates[0].id;
                setHeader(prev => ({ ...prev, tax_rate_id: Number(defaultTaxId) }));
            }
        }
    }, [config, taxRates, isEditMode]);

    // 3. CARGA DE COTIZACIÓN (EDICIÓN / DIRECTOR)
    useEffect(() => {
        if (isEditMode && id) {
            setLoadingData(true);
            const loadOrder = async () => {
                try {
                    const timestamp = new Date().getTime();
                    const response = await client.get(`/sales/orders/${id}?t=${timestamp}`);
                    const data = response.data;

                    if (data) {
                        setHeader({
                            client_id: data.client_id || 0,
                            project_name: data.project_name || '',
                            tax_rate_id: data.tax_rate_id || 0,
                            valid_until: safeDate(data.valid_until),
                            applied_margin_percent: Number(data.applied_margin_percent) || 0, 
                            notes: data.notes || '',
                            conditions: data.conditions || '' 
                        });
                        setItems(Array.isArray(data.items) ? data.items : []);
                        setCurrentStatus(data.status as SalesOrderStatus);
                        
                        let savedRate = 0;
                        if (data.applied_commission_percent !== undefined && data.applied_commission_percent !== null) {
                            savedRate = Number(data.applied_commission_percent);
                        }
                        if (savedRate > 1) savedRate = savedRate / 100;
                        setCommissionRate(savedRate);
                    }
                } catch (error) {
                    console.error(error);
                    alert("Error al cargar cotización.");
                    // Si falla cargar, redirigimos al módulo de ventas, no al dashboard general
                    navigate('/sales');
                } finally {
                    setLoadingData(false);
                }
            };
            loadOrder();
        }
    }, [id, isEditMode, navigate]);

    // 4. CÁLCULOS FINANCIEROS (Matemática Correcta)
    const itemsSum = useMemo(() => items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0), [items]);
    
    const commissionAmount = itemsSum * commissionRate;
    const finalSubtotal = itemsSum + commissionAmount;
    
    const selectedTaxRate = taxRates.find(t => t.id === header.tax_rate_id);
    const taxAmount = selectedTaxRate ? finalSubtotal * selectedTaxRate.rate : 0;
    const total = finalSubtotal + taxAmount;

    // KPI Director
    const totalCost = useMemo(() => items.reduce((sum, i) => sum + ((i.frozen_unit_cost || 0) * i.quantity), 0), [items]);
    const totalRealCost = totalCost + commissionAmount; 
    const grossProfit = finalSubtotal - totalRealCost;
    const marginPercent = finalSubtotal > 0 ? (grossProfit / finalSubtotal) * 100 : 0;

    // --- HANDLERS ---
    
    // --- LÓGICA MANUAL DE CAMBIO DE VERSIÓN (FIX: COSTO + MARGEN) ---
    const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedVersionId = Number(e.target.value);
        
        const master = masters.find(m => m.id === lineItem.master_id);
        const version = master?.versions?.find((v: any) => v.id === selectedVersionId);
        
        // 1. Costo Base del Producto
        const cost = version ? Number(version.estimated_cost) : 0;

        // 2. Obtener el margen configurado en el encabezado
        const margin = Number(header.applied_margin_percent) || 0;
        
        // 3. Calcular Multiplicador (Ej: 30% -> 1.30)
        let multiplier = 1;
        if (margin > 0 && margin <= 1) multiplier = 1 + margin; 
        else multiplier = 1 + (margin / 100);

        // 4. Precio Venta = Costo * Multiplicador
        const salesPrice = cost * multiplier;

        // 5. Asignar
        setLineItem({
            ...lineItem,
            version_id: selectedVersionId,
            unit_price: Number(salesPrice.toFixed(2)), 
            frozen_cost: cost
        });
    };

    const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setHeader({...header, client_id: Number(e.target.value)}); setSelectedCategory(''); setLineItem({...lineItem, master_id: 0, version_id: 0, unit_price: 0, frozen_cost: 0}); setEditingIndex(null); };
    
    const handleAddItem = () => {
        if (lineItem.quantity <= 0 || lineItem.unit_price <= 0) { alert("Precio/Cantidad inválidos"); return; }
        
        let productName = lineItem.manual_name;
        if (addMode === 'CATALOG') {
            let foundMaster = masters.find(m => m.id === Number(lineItem.master_id));
            if (!foundMaster && selectedCategory) foundMaster = masters.find(m => m.category === selectedCategory && m.id === Number(lineItem.master_id));
            
            const v = (foundMaster && foundMaster.versions) ? foundMaster.versions.find((x:any) => x.id === Number(lineItem.version_id)) : null;
            
            if (v) {
                productName = `${foundMaster?.name} - ${v.version_name}`;
            } else {
                productName = "Producto de Catálogo";
            }
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
        
        setLineItem({
            master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0
        }); 
        setAddMode('CATALOG');
    };

    const handleRemoveItem = (id?: number) => { setItems(items.filter(i => i.id !== id)); if (editingIndex !== null) handleCancelEdit(); };
    
    const handleCancelEdit = () => { 
        setEditingIndex(null); 
        setLineItem({master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0}); 
        setAddMode('CATALOG'); 
    };
    
    const handleEditItem = (index: number) => {
        const item = items[index];
        setEditingIndex(index);
        
        const newItemState = { 
            master_id: 0, 
            version_id: 0, 
            quantity: item.quantity, 
            unit_price: item.unit_price, 
            manual_name: item.product_name, 
            frozen_cost: item.frozen_unit_cost || 0 
        };

        if (item.origin_version_id) { 
            setAddMode('CATALOG'); 
            let found = false; 
            for (const m of masters) { 
                const v = m.versions?.find((ver:any) => ver.id === item.origin_version_id); 
                if (v) { 
                    setSelectedCategory(m.category); 
                    newItemState.master_id = m.id; 
                    newItemState.version_id = v.id; 
                    found = true; 
                    break; 
                } 
            } 
            if (!found) setAddMode('MANUAL'); 
        } else { 
            setAddMode('MANUAL'); 
        }
        
        setLineItem(newItemState);
    };

    const handleRecalculatePrices = () => {
        if(!confirm(`¿Estás seguro de recalcular TODOS los precios usando un margen del ${header.applied_margin_percent}%? Esto sobrescribirá precios manuales.`)) return;
        const rawMargin = Number(header.applied_margin_percent) || 0;
        let multiplier = 1;
        if (rawMargin > 0 && rawMargin <= 1) multiplier = 1 + rawMargin;
        else multiplier = 1 + (rawMargin / 100);
        const newItems = items.map(item => {
            if (item.frozen_unit_cost && item.frozen_unit_cost > 0) return { ...item, unit_price: Math.ceil(item.frozen_unit_cost * multiplier) };
            return item;
        });
        setItems(newItems);
        alert("Precios actualizados.");
    };

    const handleSubmit = async (targetStatus?: SalesOrderStatus) => {
        const missingFields = [];
        if (!header.client_id) missingFields.push("Cliente");
        if (!header.project_name) missingFields.push("Nombre del Proyecto");
        if (!header.tax_rate_id) missingFields.push("Impuesto (IVA)");
        if (items.length === 0) missingFields.push("Al menos 1 Producto");

        if (missingFields.length > 0) {
            alert(`⚠️ No se puede guardar. Faltan los siguientes datos:\n\n- ${missingFields.join("\n- ")}`);
            return;
        }

        setSaving(true);
        try {
            const cleanItems = items.map((item) => ({
                product_name: item.product_name,
                origin_version_id: item.origin_version_id || null, 
                quantity: Number(item.quantity), unit_price: Number(item.unit_price),
                frozen_unit_cost: Number(item.frozen_unit_cost || 0), cost_snapshot: item.cost_snapshot || {}
            }));
            const payload: any = {
                client_id: Number(header.client_id), project_name: header.project_name,
                tax_rate_id: Number(header.tax_rate_id), valid_until: new Date(header.valid_until).toISOString(),
                applied_margin_percent: Number(header.applied_margin_percent), applied_tolerance_percent: 3.0,
                applied_commission_percent: commissionRate * 100, 
                currency: 'MXN', is_warranty: false, notes: header.notes, conditions: header.conditions, items: cleanItems 
            };
            
            if (targetStatus) {
                payload.status = targetStatus;
            } else if (!isEditMode) {
                payload.status = SalesOrderStatus.DRAFT;
            }

            if (isEditMode && id) {
                if (targetStatus === SalesOrderStatus.ACCEPTED) {
                   await salesService.authorizeOrder(Number(id));
                   alert("✅ Cotización AUTORIZADA correctamente.");
                } else {
                   await salesService.updateOrder(Number(id), payload);
                   alert("✅ Cotización Actualizada.");
                }
            } else {
                await salesService.createOrder(payload);
                alert("✅ Cotización Creada Exitosamente.");
            }
            
            // --- REDIRECCIÓN CORREGIDA: AL MÓDULO DE VENTAS ---
            navigate('/sales'); 
            
        } catch (error: any) { alert("Error al guardar: " + (error.response?.data?.detail || error.message)); } 
        finally { setSaving(false); }
    };

    // --- RENDER ---
    const mastersOfClient = useMemo(() => header.client_id ? masters.filter(m => m.client_id === Number(header.client_id)) : [], [masters, header.client_id]);
    const availableCategories = useMemo(() => Array.from(new Set(mastersOfClient.map(m => m.category))), [mastersOfClient]);
    const filteredMasters = useMemo(() => selectedCategory ? mastersOfClient.filter(m => m.category === selectedCategory) : [], [mastersOfClient, selectedCategory]);
    
    let availableVersions: any[] = [];
    if (lineItem.master_id) {
        const m = masters.find(x => x.id === Number(lineItem.master_id));
        if (m && Array.isArray(m.versions)) availableVersions = m.versions;
    }

    if (loadingData) return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50"><Loader className="animate-spin text-indigo-600 mb-4" size={32}/><p className="text-slate-500 font-medium">Cargando cotización...</p></div>;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20 bg-slate-50 min-h-full">
            {/* HEADER */}
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        {isEditMode ? <Edit className="text-indigo-600"/> : <Plus className="text-emerald-600"/>}
                        {isEditMode ? `Editando Cotización #${id}` : 'Nueva Cotización'}
                    </h1>
                    {isDirector && <span className="text-xs font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded w-fit mt-1">Modo Director Activo</span>}
                </div>
                <Button variant="secondary" onClick={() => navigate(-1)}><ArrowLeft size={18} className="mr-2"/> Regresar</Button>
            </div>

            {isEditMode && (currentStatus === SalesOrderStatus.ACCEPTED || currentStatus === SalesOrderStatus.SENT) && !isDirector && (
                <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 rounded shadow-sm flex items-center gap-3 animate-pulse-slow"><AlertTriangle className="shrink-0" /><div><p className="font-bold">Modo de Edición Restrictiva</p><p className="text-sm">Solo lectura o edición limitada por estatus.</p></div></div>
            )}

            {/* DATOS GENERALES */}
            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">CLIENTE *</label><select className="w-full p-2 border border-slate-300 rounded bg-slate-50" value={header.client_id} onChange={handleClientChange}><option value={0}>-- Seleccionar --</option>{clients?.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">PROYECTO *</label><Input value={header.project_name} onChange={(e) => setHeader({...header, project_name: e.target.value})}/></div>
                    </div>
                    <div className="space-y-4 border-l pl-6 border-slate-100">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 flex justify-between">
                                <span>IMPUESTO *</span>
                                {header.tax_rate_id === 0 && <span className="text-red-500 text-[9px] animate-pulse">REQUERIDO</span>}
                            </label>
                            <select className={`w-full p-2 border rounded text-sm ${header.tax_rate_id === 0 ? 'border-red-300 bg-red-50' : 'border-slate-300'}`} value={header.tax_rate_id} onChange={(e) => setHeader({...header, tax_rate_id: Number(e.target.value)})}>
                                <option value={0}>-- Seleccionar --</option>
                                {taxRates?.map(t => <option key={t.id} value={t.id}>{t.name} ({t.rate * 100}%)</option>)}
                            </select>
                        </div>
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">VIGENCIA</label><Input type="date" value={header.valid_until} onChange={(e) => setHeader({...header, valid_until: e.target.value})}/></div>
                        
                        {isDirector && (
                            <div className="bg-amber-50 p-2 rounded border border-amber-200">
                                <label className="block text-[10px] font-black text-amber-700 uppercase mb-1 flex items-center gap-1"><TrendingUp size={10}/> Margen Objetivo (%)</label>
                                <div className="flex gap-2">
                                    <Input type="number" autoComplete="off" className="bg-white border-amber-300 font-bold text-amber-800" value={header.applied_margin_percent} onChange={(e) => setHeader({...header, applied_margin_percent: Number(e.target.value)})}/>
                                    <button onClick={handleRecalculatePrices} className="bg-amber-500 hover:bg-amber-600 text-white p-2 rounded" title="Recalcular precios de lista"><RefreshCw size={16}/></button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">NOTAS</label><textarea className="w-full p-2 border rounded text-sm h-20" value={header.notes} onChange={(e) => setHeader({...header, notes: e.target.value})}/></div>
                    <div><label className="block text-xs font-bold text-slate-500 mb-1">CONDICIONES</label><textarea className="w-full p-2 border rounded text-sm h-20" value={header.conditions} onChange={(e) => setHeader({...header, conditions: e.target.value})}/></div>
                </div>
            </Card>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className={`w-full lg:w-1/3 p-6 rounded-xl border ${editingIndex !== null ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                    <div className="space-y-4">
                        {addMode === 'CATALOG' ? (
                            <>
                                <div><label className="text-xs font-bold text-slate-500">CATEGORÍA</label><select className="w-full p-2 border rounded text-sm" value={selectedCategory} disabled={!header.client_id} onChange={(e) => { setSelectedCategory(e.target.value); setLineItem({...lineItem, master_id: 0, version_id: 0}); }}><option value="">-- Seleccionar --</option>{availableCategories?.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                                <div><label className="text-xs font-bold text-slate-500">PRODUCTO</label><select className="w-full p-2 border rounded text-sm" value={lineItem.master_id} disabled={!selectedCategory} onChange={(e) => setLineItem({...lineItem, master_id: Number(e.target.value), version_id: 0})}><option value={0}>-- Seleccionar --</option>{filteredMasters?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                                
                                <div>
                                    <label className="text-xs font-bold text-slate-500">VERSIÓN</label>
                                    <select 
                                        className="w-full p-2 border rounded text-sm" 
                                        disabled={!lineItem.master_id} 
                                        value={lineItem.version_id} 
                                        onChange={handleVersionChange}
                                    > 
                                        <option value={0}>-- Seleccionar --</option>
                                        {availableVersions?.map((v:any) => <option key={v.id} value={v.id}>{v.version_name}</option>)}
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
                                <Input type={addMode === 'CATALOG' ? "text" : "number"} readOnly={addMode==='CATALOG' && !isDirector} className={addMode==='CATALOG' ? 'bg-slate-100' : ''} value={addMode==='CATALOG' && !isDirector ? formatCurrency(lineItem.unit_price).replace('MX$', '') : lineItem.unit_price} onChange={(e) => setLineItem({...lineItem, unit_price: Number(e.target.value)})}/>}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button className="flex-1" onClick={handleAddItem}>{editingIndex !== null ? 'Actualizar' : 'Agregar'}</Button>
                            {editingIndex !== null && <Button variant="secondary" onClick={handleCancelEdit}><X size={16}/></Button>}
                        </div>
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex-1 overflow-x-auto min-h-[300px] p-0">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b text-xs text-slate-500 uppercase"><tr><th className="px-4 py-2">Producto</th><th className="text-center">Cant.</th><th className="text-right">Unitario</th><th className="text-right px-4">Total</th><th className="text-center"></th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item, idx) => (
                                    <tr key={idx} className={editingIndex === idx ? 'bg-amber-50' : ''}>
                                        <td className="px-4 py-2">
                                            <div className="font-bold">{item.product_name}</div>
                                            {isDirector && (
                                                <div className="text-[10px] text-slate-400 font-mono flex gap-2">
                                                    {item.frozen_unit_cost > 0 && <span>Costo: {formatCurrency(item.frozen_unit_cost)}</span>}
                                                    <span className="text-indigo-400">DB: {formatCurrency(item.unit_price)}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-center font-bold">{item.quantity}</td>
                                        <td className="text-right font-mono">{formatCurrency(item.unit_price)}</td>
                                        <td className="text-right px-4 font-bold font-mono">{formatCurrency(item.quantity * item.unit_price)}</td>
                                        <td className="text-center px-2"><button onClick={() => handleEditItem(idx)} className="text-indigo-500 mr-2"><Pencil size={16}/></button><button onClick={() => handleRemoveItem(item.id)} className="text-red-500"><Trash2 size={16}/></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-200 text-right space-y-2">
                        {isDirector && (
                            <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4 text-xs">
                                <div className="font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-end gap-2"><Lock size={10}/> Análisis de Rentabilidad (Privado)</div>
                                <div className="grid grid-cols-3 gap-4 text-right">
                                    <div><div className="text-slate-500">Costo Material</div><div className="font-mono font-bold text-slate-700">{formatCurrency(totalCost)}</div></div>
                                    <div><div className="text-slate-500">Utilidad Bruta</div><div className={`font-mono font-bold ${grossProfit > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(grossProfit)}</div></div>
                                    <div><div className="text-slate-500">Margen Real</div><div className={`font-mono font-black ${marginPercent >= 20 ? 'text-emerald-600' : 'text-amber-600'}`}>{marginPercent.toFixed(1)}%</div></div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-12 text-sm text-slate-500"><span>Suma Partidas:</span> <span className="font-mono">{formatCurrency(itemsSum)}</span></div>
                        
                        <div className={`flex justify-end items-center gap-12 text-sm border-b border-dashed border-slate-200 pb-2 mb-2 p-2 rounded ${commissionRate === 0 ? 'bg-red-50 text-red-700 animate-pulse' : 'bg-green-50 text-emerald-700'}`}>
                            <span className="flex items-center gap-2 font-bold">
                                <Wallet size={16}/> 
                                {commissionRate === 0 ? "⚠️ 0% (SIN COMISIÓN)" : `Comisión Vendedor (${(commissionRate * 100).toFixed(1)}%):`}
                            </span> 
                            <span className="font-mono font-bold">{formatCurrency(commissionAmount)}</span>
                        </div>

                        <div className="flex justify-end gap-12 text-sm text-slate-700 font-bold"><span>Subtotal:</span> <span className="font-mono">{formatCurrency(finalSubtotal)}</span></div>
                        <div className="flex justify-end gap-12 text-sm text-slate-500"><span>IVA:</span> <span className="font-mono">{formatCurrency(taxAmount)}</span></div>
                        <div className="flex justify-end gap-12 text-xl font-black text-slate-800 border-t pt-2"><span>Total:</span> <span className="font-mono">{formatCurrency(total)}</span></div>
                        
                        <div className="flex justify-end gap-4 mt-4">
                            {isDirector && (currentStatus === SalesOrderStatus.SENT || currentStatus === SalesOrderStatus.DRAFT) && (
                                <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200" onClick={() => handleSubmit(SalesOrderStatus.ACCEPTED)} disabled={saving || savingSales}><CheckCircle2 size={18} className="mr-2"/> Aprobar Cotización</Button>
                            )}
                            <Button className="w-48 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleSubmit()} disabled={saving || savingSales}>{saving ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Guardar Borrador')} <Save size={18} className="ml-2"/></Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateQuotePage;