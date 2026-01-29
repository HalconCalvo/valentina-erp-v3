import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    Save, Plus, Trash2, ShoppingCart, 
    User, Calendar, FileText, Filter, DollarSign, Eye, Loader, Server, Edit, FileInput,
    ArrowLeft, X, Pencil 
} from 'lucide-react';

import { useSales } from '../hooks/useSales';
import { useClients } from '../../foundations/hooks/useClients';
import { useFoundations } from '../../foundations/hooks/useFoundations';
// import { useDesign } from '../../design/hooks/useDesign'; <--- YA NO LO NECESITAMOS PARA CARGAR MASTERS
import { designService } from '../../../api/design-service';
import { salesService } from '../../../api/sales-service'; 

import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import { SalesOrderItem } from '../../../types/sales';

// --- HELPERS ---
const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '$ 0.00';
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    }).format(amount);
};

const formatPercent = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0%';
    return `${val.toFixed(2)}%`;
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
    // const designHook = useDesign(); <--- OMITIDO

    // Data Segura
    const clients = clientHook?.clients && Array.isArray(clientHook.clients) ? clientHook.clients : [];
    const taxRates = foundationHook?.taxRates && Array.isArray(foundationHook.taxRates) ? foundationHook.taxRates : [];
    const config = foundationHook?.config || null;
    
    // --- CAMBIO CLAVE 1: Estado local para Masters filtrados ---
    const [masters, setMasters] = useState<any[]>([]);

    // --- ESTADOS ---
    const [loadingData, setLoadingData] = useState(false); 
    const [saving, setSaving] = useState(false); 

    const [selectedCategory, setSelectedCategory] = useState<string>('');
    
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
    
    // UI FLAGS
    const [loadingCost, setLoadingCost] = useState<boolean>(false);
    const [costSource, setCostSource] = useState<string>(''); 
    const [auditData, setAuditData] = useState<any>(null);
    const [addMode, setAddMode] = useState<'CATALOG' | 'MANUAL'>('CATALOG');

    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // --- 1. CARGA INICIAL ---
    useEffect(() => {
        const loadCatalogs = async () => {
            try {
                if (clientHook?.fetchClients) await clientHook.fetchClients();
                if (foundationHook?.fetchTaxRates) await foundationHook.fetchTaxRates();
                if (foundationHook?.fetchConfig) await foundationHook.fetchConfig(); 
                
                // --- CAMBIO CLAVE 2: Carga directa con Filtro ACTIVADO (true) ---
                // Param 1: clientId (undefined), Param 2: onlyReady (true)
                const filteredMasters = await designService.getMasters(undefined, true);
                setMasters(filteredMasters);

            } catch (error) {
                console.error("Error cargando catálogos", error);
            }
        };
        loadCatalogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // --- 4. FILTROS ---
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

    // --- 5. CÁLCULOS ---
    const subtotal = useMemo(() => items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0), [items]);
    const selectedTaxRate = taxRates.find(t => t.id === header.tax_rate_id);
    const taxAmount = selectedTaxRate ? subtotal * selectedTaxRate.rate : 0;
    const total = subtotal + taxAmount;

    // --- 6. PRECIOS API ---
    useEffect(() => {
        let isMounted = true;
        const fetchAndCalculate = async () => {
            if (addMode === 'CATALOG' && lineItem.version_id) {
                setLoadingCost(true);
                setCostSource('Consultando API...');
                try {
                    const detail = await designService.getVersion(Number(lineItem.version_id));
                    if (!isMounted) return;

                    const freshCost = Number(detail.estimated_cost) || 0;
                    const rawMarginInput = Number(header.applied_margin_percent) || 0;
                    
                    let multiplier = 1;
                    if (rawMarginInput > 0 && rawMarginInput <= 1) {
                        multiplier = 1 + rawMarginInput;
                    } else {
                        multiplier = 1 + (rawMarginInput / 100);
                    }

                    const calculatedPrice = freshCost * multiplier;

                    setLineItem(prev => ({
                        ...prev,
                        unit_price: parseFloat(calculatedPrice.toFixed(2)),
                        frozen_cost: freshCost
                    }));

                    setAuditData({
                        rawCost: freshCost,
                        rawMargin: rawMarginInput,
                        multiplier: multiplier,
                        finalPrice: calculatedPrice
                    });
                    
                    setCostSource(`API (ID: ${lineItem.version_id})`);
                } catch (error) {
                    console.error("Error calculating price:", error);
                    setCostSource("Error de Conexión");
                    setAuditData({ error: true });
                } finally {
                    if (isMounted) setLoadingCost(false);
                }
            } else {
                setAuditData(null);
                setCostSource('');
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
        setAuditData(null);
        setEditingIndex(null); 
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
            if (!found) {
                setAddMode('MANUAL');
            }
        } else {
            setAddMode('MANUAL');
        }

        setLineItem(newItemState);
    };

    const handleCancelEdit = () => {
        setEditingIndex(null);
        setLineItem({...lineItem, master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: ''});
        setAddMode('CATALOG');
    };

    const handleAddItem = () => {
        if (lineItem.quantity <= 0 || lineItem.unit_price <= 0) {
            alert("Precio o Cantidad inválidos.");
            return;
        }

        let productName = lineItem.manual_name;
        if (addMode === 'CATALOG') {
            const v = availableVersions.find((x:any) => x.id === Number(lineItem.version_id));
            if (!v) { alert("Versión no encontrada"); return; }
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
        if (editingIndex !== null) {
            updatedItems[editingIndex] = newItem;
            setEditingIndex(null);
        } else {
            updatedItems.push(newItem);
        }

        setItems(updatedItems);
        setLineItem(prev => ({...prev, quantity: 1, manual_name: '', master_id: 0, version_id: 0, unit_price: 0})); 
    };

    const handleRemoveItem = (id?: number) => {
        setItems(items.filter(i => i.id !== id));
        if (editingIndex !== null) handleCancelEdit();
    };

    const handleSubmit = async () => {
        if (!header.client_id || !header.project_name || items.length === 0) {
            alert("Faltan datos obligatorios.");
            return;
        }
        
        setSaving(true);
        try {
            const cleanItems = items.map((item) => ({
                product_name: item.product_name,
                origin_version_id: item.origin_version_id || null, 
                quantity: Number(item.quantity),
                unit_price: Number(item.unit_price),
                frozen_unit_cost: Number(item.frozen_unit_cost || 0),
                cost_snapshot: item.cost_snapshot || {}
            }));
            
            const payload = {
                client_id: Number(header.client_id),
                project_name: header.project_name,
                tax_rate_id: Number(header.tax_rate_id),
                valid_until: new Date(header.valid_until).toISOString(),
                applied_margin_percent: Number(header.applied_margin_percent),
                applied_tolerance_percent: 3.0,
                currency: 'MXN',
                is_warranty: false,
                notes: header.notes,
                conditions: header.conditions, 
                items: cleanItems 
            };

            if (isEditMode && id) {
                await salesService.updateOrder(Number(id), payload);
                alert("✅ Cotización Actualizada!");
            } else {
                await salesService.createOrder(payload);
                alert("✅ Cotización Creada!");
            }
            
            navigate('/sales');

        } catch (error: any) {
            console.error("Error al guardar:", error);
            const msg = error.response?.data?.detail || "Error desconocido";
            alert(`Error al guardar: ${JSON.stringify(msg)}`);
        } finally {
            setSaving(false);
        }
    };

    if (loadingData) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader className="animate-spin mx-auto text-emerald-600 mb-2" size={40}/>
                    <p className="text-slate-500 font-medium">Cargando cotización...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20 bg-slate-50 min-h-full">
            
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        {isEditMode ? <Edit className="text-indigo-600"/> : <Plus className="text-emerald-600"/>}
                        {isEditMode ? `Editando Cotización #${id}` : 'Nueva Cotización'}
                    </h1>
                    <p className="text-slate-500 text-sm">
                        {isEditMode ? 'Modifica los productos o condiciones.' : 'Selecciona Cliente → Categoría → Producto.'}
                    </p>
                </div>
                <Button variant="secondary" onClick={() => navigate('/sales')}>
                    <ArrowLeft size={18} className="mr-2"/> Regresar
                </Button>
            </div>

            {/* 1. DATOS GENERALES */}
            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">CLIENTE *</label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                                <select 
                                    className="w-full pl-9 p-2 border border-slate-300 rounded bg-slate-50 outline-none"
                                    value={header.client_id}
                                    onChange={handleClientChange}
                                >
                                    <option value={0}>-- Seleccionar --</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">PROYECTO *</label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                                <Input 
                                    className="pl-9"
                                    placeholder="Ej. Casa Familia..."
                                    value={header.project_name}
                                    onChange={(e) => setHeader({...header, project_name: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 border-l pl-6 border-slate-100">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">IMPUESTO *</label>
                            <select 
                                className="w-full p-2 border border-slate-300 rounded text-sm"
                                value={header.tax_rate_id}
                                onChange={(e) => setHeader({...header, tax_rate_id: Number(e.target.value)})}
                            >
                                <option value={0}>-- Seleccionar --</option>
                                {taxRates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.rate * 100}%)</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">VIGENCIA</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                                <Input 
                                    type="date"
                                    className="pl-9"
                                    value={header.valid_until}
                                    onChange={(e) => setHeader({...header, valid_until: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* 2. TÉRMINOS Y OBSERVACIONES */}
            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <FileInput size={16} className="text-indigo-500"/> Términos y Observaciones
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">NOTAS / INTRODUCCIÓN (PDF)</label>
                        <textarea 
                            className="w-full p-2 border border-slate-300 rounded text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none"
                            placeholder="Ej. Por medio de la presente le envío la cotización..."
                            value={header.notes}
                            onChange={(e) => setHeader({...header, notes: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">CONDICIONES COMERCIALES (PIE DE PÁGINA)</label>
                        <textarea 
                            className="w-full p-2 border border-slate-300 rounded text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none"
                            placeholder="Ej. 50% anticipo, entrega en 4 semanas..."
                            value={header.conditions}
                            onChange={(e) => setHeader({...header, conditions: e.target.value})}
                        />
                    </div>
                </div>
            </Card>

            {/* 3. CONSTRUCTOR DE PRODUCTOS */}
            <div className="flex flex-col lg:flex-row gap-6">
                
                {/* PANEL IZQUIERDO: AGREGAR / EDITAR */}
                <div className={`w-full lg:w-1/3 p-6 rounded-xl border h-fit shadow-sm transition-colors ${editingIndex !== null ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className={`font-bold text-sm ${editingIndex !== null ? 'text-amber-700' : 'text-slate-600'}`}>
                            {editingIndex !== null ? 'EDITANDO PARTIDA' : 'NUEVA PARTIDA'}
                        </h3>
                        
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button 
                                className={`flex-1 px-2 py-1 text-xs font-bold rounded-md ${addMode === 'CATALOG' ? 'bg-white shadow text-emerald-700' : 'text-slate-500'}`}
                                onClick={() => setAddMode('CATALOG')}
                            >
                                Catálogo
                            </button>
                            <button 
                                className={`flex-1 px-2 py-1 text-xs font-bold rounded-md ${addMode === 'MANUAL' ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}
                                onClick={() => setAddMode('MANUAL')}
                            >
                                Manual
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {addMode === 'CATALOG' ? (
                            <>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">1. CATEGORÍA</label>
                                    <div className="relative">
                                        <Filter className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                                        <select 
                                            className="w-full pl-9 p-2 border border-slate-300 rounded text-sm"
                                            value={selectedCategory}
                                            disabled={!header.client_id}
                                            onChange={(e) => {
                                                setSelectedCategory(e.target.value);
                                                setLineItem({...lineItem, master_id: 0, version_id: 0});
                                            }}
                                        >
                                            <option value="">-- Seleccionar --</option>
                                            {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">2. PRODUCTO</label>
                                    <select 
                                        className="w-full p-2 border border-slate-300 rounded text-sm"
                                        value={lineItem.master_id}
                                        disabled={!selectedCategory}
                                        onChange={(e) => setLineItem({...lineItem, master_id: Number(e.target.value), version_id: 0})}
                                    >
                                        <option value={0}>-- Seleccionar --</option>
                                        {filteredMasters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">3. VERSIÓN</label>
                                    <select 
                                        className="w-full p-2 border border-slate-300 rounded text-sm"
                                        disabled={!lineItem.master_id}
                                        value={lineItem.version_id}
                                        onChange={(e) => setLineItem({...lineItem, version_id: Number(e.target.value)})}
                                    >
                                        <option value={0}>-- Seleccionar --</option>
                                        {availableVersions.map((v:any) => (
                                            <option key={v.id} value={v.id}>{v.version_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">DESCRIPCIÓN</label>
                                <Input 
                                    placeholder="Producto manual..."
                                    value={lineItem.manual_name}
                                    onChange={(e) => setLineItem({...lineItem, manual_name: e.target.value})}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">CANTIDAD</label>
                                <Input type="number" value={lineItem.quantity} onChange={(e) => setLineItem({...lineItem, quantity: Number(e.target.value)})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">PRECIO VENTA</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-2 top-2.5 text-slate-400" size={14}/>
                                    
                                    {loadingCost ? (
                                        <div className="flex items-center h-10 pl-6 bg-slate-50 text-slate-400 text-xs border border-slate-200 rounded">
                                            <Loader className="animate-spin mr-2" size={14}/> Buscando...
                                        </div>
                                    ) : (
                                        <Input 
                                            type={addMode === 'CATALOG' ? "text" : "number"}
                                            className={`pl-6 font-bold ${addMode === 'CATALOG' ? 'bg-slate-100' : 'bg-white'}`}
                                            readOnly={addMode === 'CATALOG'}
                                            value={addMode === 'CATALOG' 
                                                ? formatCurrency(lineItem.unit_price).replace('MX$', '') 
                                                : lineItem.unit_price} 
                                            onChange={(e) => addMode === 'MANUAL' && setLineItem({...lineItem, unit_price: Number(e.target.value)})}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {addMode === 'CATALOG' && auditData && !loadingCost && (
                            <div className="mt-4 p-3 bg-amber-100 border border-amber-300 rounded text-xs text-amber-900 shadow-inner">
                                <div className="flex items-center justify-between font-black mb-2 border-b border-amber-200 pb-1">
                                    <span className="flex items-center gap-1"><Eye size={14}/> AUDITORÍA DE DATO</span>
                                    <span className="text-[10px] bg-amber-200 px-1 rounded flex items-center gap-1">
                                        <Server size={10}/> {costSource}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-y-1">
                                    <span>Costo Receta (Fresco):</span>
                                    <span className="text-right font-mono font-bold text-red-600">
                                        {formatCurrency(auditData.rawCost)}
                                    </span>

                                    <span>Margen ({formatPercent(auditData.rawMargin)}):</span>
                                    <span className="text-right font-mono">
                                        x {(auditData?.multiplier || 1).toFixed(4)}
                                    </span>
                                    
                                    <span className="pt-1 mt-1 border-t border-amber-300 font-bold">PRECIO FINAL:</span>
                                    <span className="pt-1 mt-1 border-t border-amber-300 text-right font-mono font-black text-emerald-700 text-sm">
                                        {formatCurrency(auditData.finalPrice)}
                                    </span>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex gap-2 mt-2">
                            <Button 
                                className={`flex-1 ${editingIndex !== null ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-800 hover:bg-slate-900'}`} 
                                onClick={handleAddItem}
                            >
                                {editingIndex !== null ? <Save size={16} className="mr-2"/> : <ShoppingCart size={16} className="mr-2"/>}
                                {editingIndex !== null ? 'Actualizar' : 'Agregar'}
                            </Button>
                            
                            {editingIndex !== null && (
                                <Button variant="secondary" onClick={handleCancelEdit} title="Cancelar">
                                    <X size={16}/>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* PANEL DERECHO: LISTA */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                        Partidas ({items.length})
                    </div>
                    <div className="flex-1 overflow-x-auto min-h-[300px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-slate-100 text-xs uppercase text-slate-400">
                                <tr>
                                    <th className="px-4 py-3">Concepto</th>
                                    <th className="px-4 py-3 text-center">Cant.</th>
                                    <th className="px-4 py-3 text-right">P. Unit</th>
                                    <th className="px-4 py-3 text-right">Importe</th>
                                    <th className="px-4 py-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {items.map((item, idx) => (
                                    <tr key={item.id} className={editingIndex === idx ? 'bg-amber-50' : ''}>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-700">{item.product_name}</div>
                                            {item.origin_version_id && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1 rounded">DISEÑO</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold">{item.quantity}</td>
                                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.unit_price)}</td>
                                        <td className="px-4 py-3 text-right font-bold font-mono">{formatCurrency(item.quantity * item.unit_price)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button 
                                                    onClick={() => handleEditItem(idx)} 
                                                    className="text-indigo-400 hover:text-indigo-600 p-1 hover:bg-indigo-50 rounded"
                                                    title="Editar"
                                                >
                                                    <Pencil size={16}/>
                                                </button>
                                                <button 
                                                    onClick={() => handleRemoveItem(item.id)} 
                                                    className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-200 text-right space-y-2">
                        <div className="flex justify-end gap-12 text-sm text-slate-500">
                            <span>Subtotal:</span> <span className="font-mono">{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="flex justify-end gap-12 text-sm text-slate-500">
                            <span>IVA:</span> <span className="font-mono">{formatCurrency(taxAmount)}</span>
                        </div>
                        <div className="flex justify-end gap-12 text-xl font-black text-slate-800 border-t pt-2">
                            <span>Total:</span> <span className="font-mono">{formatCurrency(total)}</span>
                        </div>
                        
                        {/* BOTONES DE ACCIÓN INFERIORES */}
                        <div className="flex justify-end gap-4 mt-4">
                            <Button 
                                variant="secondary" 
                                className="w-32" 
                                onClick={() => navigate('/sales')}
                            >
                                <ArrowLeft size={16} className="mr-2"/> Regresar
                            </Button>

                            <Button 
                                className="w-64 bg-emerald-600 hover:bg-emerald-700" 
                                onClick={handleSubmit} 
                                disabled={saving || savingSales}
                            >
                                {saving ? 'Guardando...' : (isEditMode ? 'Actualizar Cotización' : 'Guardar Cotización')} 
                                <Save size={18} className="ml-2"/>
                            </Button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateQuotePage;