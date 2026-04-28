import React, { useState, useEffect } from 'react';
import { 
    Search, Ban, Send, PackageCheck, 
    ArrowUpRight, Loader2, ArrowLeft, ArrowRight,
    Building2, ShoppingCart, Calendar, Clock, CheckCircle2, FileText, XCircle, Trash2, CheckSquare, Square, AlertCircle, RefreshCw, Snowflake, Plus, AlertTriangle
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import axiosClient from '../../../api/axios-client';

type SubSection = 'CREATION' | 'BRAKE' | 'SENDING' | null;

interface PurchaseOrdersModuleProps {
    onSubSectionChange?: (active: boolean) => void;
    targetTab?: string | null;
    onExternalBack?: () => void;
}

export const PurchaseOrdersModule: React.FC<PurchaseOrdersModuleProps> = ({ onSubSectionChange, targetTab, onExternalBack }) => {
    const [activeSubSection, setActiveSubSection] = useState<SubSection>(targetTab as SubSection || null);
    const [loading, setLoading] = useState(true);
    const [suggestedOrders, setSuggestedOrders] = useState<any[]>([]);
    const [brakeOrders, setBrakeOrders] = useState<any[]>([]);
    const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});

    const [providersList, setProvidersList] = useState<any[]>([]);
    const [materialsList, setMaterialsList] = useState<any[]>([]);

    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [manualOrderForm, setManualOrderForm] = useState({ 
        provider_name: '',
        overhead_category: '',
        items: [{ sku: '', material_name: '', qty: 1, expected_cost: '0.00' }] 
    });

    const [activeDropdown, setActiveDropdown] = useState<{type: 'provider' | 'sku' | 'material' | null, index: number | null}>({type: null, index: null});

    const [assignModal, setAssignModal] = useState<{
        open: boolean;
        requisitionId: number | null;
        itemName: string;
        currentQty: number;
    }>({ open: false, requisitionId: null, itemName: '', currentQty: 0 });

    const [assignForm, setAssignForm] = useState({
        provider_id: '',
        provider_search: '',
        expected_unit_cost: '0.00',
    });

    const [assignProviderFocused, setAssignProviderFocused] = useState(false);

    const [pendingCategory, setPendingCategory] = useState<string>('');
    const [categoryError, setCategoryError] = useState<string | null>(null);

    const OVERHEAD_CATEGORIES = [
        'PLANTA', 'COMUNICACIONES', 'COMBUSTIBLES', 'TRANSPORTE',
        'INSUMOS', 'MAQUINARIA', 'EXTERNOS', 'OTRO'
    ];

    const [isReqModalOpen, setIsReqModalOpen] = useState(false);
    const [reqForm, setReqForm] = useState({
        description: '',
        qty: '1',
        notes: '',
        isCatalogItem: false,
        material_id: '',
        material_search: '',
    });

    const getRole = () => {
        const userRaw = localStorage.getItem('user');
        const userRoleDirect = localStorage.getItem('user_role');
        const roleDirect = localStorage.getItem('role');

        if (userRaw) {
            try {
                const userObj = JSON.parse(userRaw);
                return userObj.role || userObj.user_role || 'GUEST';
            } catch (e) {
                return 'GUEST';
            }
        }
        return userRoleDirect || roleDirect || 'GUEST';
    };

    const role = getRole().toUpperCase();
    const canCreateDirectOC = ['ADMIN', 'GERENCIA', 'DIRECTOR'].includes(role);
    const canCreateRequisition = ['PRODUCTION', 'WAREHOUSE', 'DESIGN',
                                   'LOGISTICS', 'SALES'].includes(role);

    useEffect(() => {
        if (targetTab) {
            setActiveSubSection(targetTab as SubSection);
        }
    }, [targetTab]);

    useEffect(() => {
        if (onSubSectionChange) {
            onSubSectionChange(activeSubSection !== null);
        }
    }, [activeSubSection, onSubSectionChange]);

    const extractList = (res: any, fallbackKey: string) => {
        if (Array.isArray(res.data)) return res.data;
        if (res.data?.data && Array.isArray(res.data.data)) return res.data.data;
        if (res.data?.items && Array.isArray(res.data.items)) return res.data.items;
        if (res.data?.[fallbackKey] && Array.isArray(res.data[fallbackKey])) return res.data[fallbackKey];
        return [];
    };

    const safeStatus = (status: any) => String(status || '').trim().toUpperCase();

    const fetchCatalogs = async () => {
        try {
            const [provRes, matRes] = await Promise.all([
                axiosClient.get('/foundations/providers/'),
                axiosClient.get('/foundations/materials/')
            ]);
            setProvidersList(extractList(provRes, 'providers'));
            setMaterialsList(extractList(matRes, 'materials'));
        } catch (error) {
            console.error("Error al cargar catálogos:", error);
        }
    };

    const fetchPlanning = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const ts = new Date().getTime(); 
            const response = await axiosClient.get(`/purchases/planning/consolidated?t=${ts}`);
            const data = extractList({data: response.data}, 'items');
            const sortedData = [...data].sort((a, b) => {
                const aHasProject = a.items?.some((it: any) => it.project_name) || false;
                const bHasProject = b.items?.some((it: any) => it.project_name) || false;
                return aHasProject === bHasProject ? 0 : aHasProject ? -1 : 1;
            });
            setSuggestedOrders(sortedData);
            
            if (!silent) {
                const initialSelection: Record<string, boolean> = {};
                sortedData.forEach((group: any) => {
                    group.items?.forEach((item: any) => {
                        initialSelection[`${group.provider_id}-${item.material_id}`] = true;
                    });
                });
                setSelectedItems(initialSelection);
            }
        } catch (error) {
            console.error("Error al cargar planeación:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchBrakeOrders = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const ts = new Date().getTime();
            const response = await axiosClient.get(`/purchases/orders/?t=${ts}`);
            setBrakeOrders(extractList({data: response.data}, 'orders'));
        } catch (error) {
            console.error("Error al cargar órdenes:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleForceRefresh = () => {
        fetchPlanning();
        fetchBrakeOrders();
    };

    useEffect(() => {
        fetchPlanning();
        fetchBrakeOrders();
        fetchCatalogs(); 

        const interval = setInterval(() => {
            fetchPlanning(true);
            fetchBrakeOrders(true);
        }, 15000);
        
        return () => clearInterval(interval);
    }, []); 

    const handleEmitPurchaseOrder = async (group: any) => {
        const itemsToEmit = group.items.filter((item: any) => selectedItems[`${group.provider_id}-${item.material_id}`]);
        if (itemsToEmit.length === 0) return alert("Debe seleccionar al menos un producto.");
        if (!pendingCategory) {
            setCategoryError("Debes seleccionar una categoría antes de generar la OC.");
            return;
        }
        if (!window.confirm(`¿Confirmar emisión de Orden de Compra para ${group.provider_name}?`)) return;
        setLoading(true);
        try {
            const payload = {
                provider_id: group.provider_id,
                overhead_category: pendingCategory,
                items: itemsToEmit.map((item: any) => ({
                    requisition_id: item.requisition_id,
                    material_id: item.material_id,
                    name: item.name,
                    qty: item.qty,
                    expected_cost: item.expected_cost
                }))
            };
            await axiosClient.post('/purchases/orders/bulk-emit', payload);
            fetchPlanning(true);
            fetchBrakeOrders(true);
        } catch (error: any) {
            alert(error.response?.data?.detail || "Error al emitir la Orden de Compra.");
        } finally {
            setLoading(false);
        }
    };

    const handleAddRow = () => {
        setManualOrderForm({
            ...manualOrderForm,
            items: [...manualOrderForm.items, { sku: '', material_name: '', qty: 1, expected_cost: '0.00' }]
        });
    };

    const handleRemoveRow = (indexToRemove: number) => {
        if (manualOrderForm.items.length === 1) return;
        const newItems = [...manualOrderForm.items];
        newItems.splice(indexToRemove, 1);
        setManualOrderForm({ ...manualOrderForm, items: newItems });
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...manualOrderForm.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setManualOrderForm({ ...manualOrderForm, items: newItems });
    };

    const handleSubmitManualOrder = async () => {
        const validItems = manualOrderForm.items.filter(it => it.material_name.trim() !== '');
        
        if (!manualOrderForm.provider_name || validItems.length === 0) {
            return alert("Por favor, completa el proveedor y al menos un material válido.");
        }
        if (!manualOrderForm.overhead_category) {
            return alert("Debes seleccionar una categoría de gasto.");
        }
        
        setLoading(true);
        try {
            const payload = {
                provider_name: manualOrderForm.provider_name,
                overhead_category: manualOrderForm.overhead_category,
                items: validItems.map(it => ({
                    sku: it.sku,
                    name: it.material_name,
                    qty: it.qty,
                    expected_cost: parseFloat(it.expected_cost as string) || 0
                }))
            };
            await axiosClient.post('/purchases/orders/manual', payload);
            
            setIsManualModalOpen(false);
            setManualOrderForm({ provider_name: '', overhead_category: '', items: [{ sku: '', material_name: '', qty: 1, expected_cost: '0.00' }] });
            fetchBrakeOrders(true);
        } catch (error: any) {
            alert(error.response?.data?.detail || "Error al crear la orden manual.");
        } finally {
            setLoading(false);
        }
    };

    const handleAuthorizeOrder = async (orderId: number, folio: string) => {
        if (!window.confirm(`¿Autorizar definitivamente la orden ${folio}?`)) return;
        setLoading(true);
        try {
            await axiosClient.put(`/purchases/orders/${orderId}/authorize`);
            fetchBrakeOrders(true); 
        } catch (error) {
            alert("Error al autorizar.");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveItemFromOrder = async (orderId: number, itemId: number, sku: string) => {
        if (!window.confirm(`¿Quitar SKU ${sku} de esta orden?`)) return;
        setLoading(true);
        try {
            await axiosClient.delete(`/purchases/orders/${orderId}/items/${itemId}`);
            fetchBrakeOrders(true);
            fetchPlanning(true);
        } catch (error) {
            alert("Error al remover partida.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteManualRequisition = async (reqId: number) => {
        if (!window.confirm("¿Eliminar esta solicitud manual permanentemente?")) return;
        setLoading(true);
        try {
            await axiosClient.delete(`/purchases/requisitions/${reqId}`);
            fetchPlanning(true);
        } catch (error) {
            alert("Error al eliminar.");
        } finally {
            setLoading(false);
        }
    };

    const handleFreezeRequisition = async (reqId: number) => {
        if (!window.confirm("¿Aplazar la compra de este material? Se enviará a la Congeladora para su revisión posterior.")) return;
        setLoading(true);
        try {
            await axiosClient.put(`/purchases/requisitions/${reqId}/status?status=APLAZADA`);
            fetchPlanning(true);
        } catch (error) {
            alert("Error al aplazar.");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitRequisition = async () => {
        if (!reqForm.description && !reqForm.material_id) {
            return alert("Describe qué necesitas o selecciona un material.");
        }
        if (!reqForm.qty || parseFloat(reqForm.qty) <= 0) {
            return alert("Ingresa una cantidad válida.");
        }
        setLoading(true);
        try {
            await axiosClient.post('/purchases/requisitions/', {
                material_id: reqForm.material_id ? parseInt(reqForm.material_id) : null,
                custom_description: !reqForm.material_id ? reqForm.description : null,
                requested_quantity: parseFloat(reqForm.qty),
                notes: reqForm.notes.trim()
                    ? `[MANUAL] ${reqForm.notes}`
                    : '[MANUAL] Petición Ad-hoc',
            });
            setIsReqModalOpen(false);
            setReqForm({
                description: '', qty: '1', notes: '',
                isCatalogItem: false, material_id: '', material_search: ''
            });
            fetchPlanning(true);
        } catch (error: any) {
            alert(error.response?.data?.detail || "Error al crear la solicitud.");
        } finally {
            setLoading(false);
        }
    };

    const handleAssignProvider = async () => {
        if (!assignModal.requisitionId || !assignForm.provider_id) {
            return alert("Selecciona un proveedor.");
        }
        const cost = parseFloat(assignForm.expected_unit_cost);
        if (isNaN(cost) || cost < 0) {
            return alert("Ingresa un precio unitario válido.");
        }
        setLoading(true);
        try {
            await axiosClient.put(
                `/purchases/requisitions/${assignModal.requisitionId}/assign`,
                {
                    provider_id: parseInt(assignForm.provider_id),
                    expected_unit_cost: cost,
                }
            );
            setAssignModal({ open: false, requisitionId: null, itemName: '', currentQty: 0 });
            setAssignForm({ provider_id: '', provider_search: '', expected_unit_cost: '0.00' });
            fetchPlanning(true);
        } catch (error: any) {
            alert(error.response?.data?.detail || "Error al asignar proveedor.");
        } finally {
            setLoading(false);
        }
    };

    const handleTransferCriticalItem = async (requisitionId: number, materialName: string) => {
        if (!window.confirm(`¿Sustituir "${materialName}"? Se moverá a Asignación Pendiente.`)) return;
        setLoading(true);
        try {
            await axiosClient.put(`/purchases/requisitions/${requisitionId}/transfer`);
            fetchPlanning(true);
        } catch (error) {
            alert("Error al transferir.");
        } finally {
            setLoading(false);
        }
    };

    const handleRejectOrder = async (orderId: number, folio: string) => {
        const confirmReject = window.confirm(`RECHAZAR ORDEN ${folio}\nAceptar: RE-COTIZAR\nCancelar: ELIMINAR TODO`);
        const action = confirmReject ? "RE-COTIZAR" : "CANCELAR";
        setLoading(true);
        try {
            await axiosClient.post(`/purchases/orders/${orderId}/reject?action=${action}`);
            fetchBrakeOrders(true);
            fetchPlanning(true);
        } catch (error) {
            alert("Error al rechazar.");
        } finally {
            setLoading(false);
        }
    };

    const handleDispatchOrder = async (orderId: number, folio: string) => {
        if (!window.confirm(`¿Confirmar despacho de la orden ${folio} al proveedor?`)) return;
        setLoading(true);
        try {
            await axiosClient.put(`/purchases/orders/${orderId}/dispatch`);
            fetchBrakeOrders(true); 
        } catch (error) {
            alert("Error al despachar.");
        } finally {
            setLoading(false);
        }
    };

    const handleRequestAdvance = async (orderId: number, folio: string, total: number) => {
        const safeTotal = parseFloat(total as any) || 0;
        const formattedTotalText = safeTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const exactInputValue = safeTotal.toFixed(2);

        const amountStr = window.prompt(
            `¿Cuánto anticipo requiere la OC ${folio}?\n(Total de la OC: $${formattedTotalText})\nPuedes pedir el 100% o solo una parte:`, 
            exactInputValue
        );
        
        if (!amountStr) return;
        
        const amount = parseFloat(amountStr.replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) return alert("Monto inválido");

        setLoading(true);
        try {
            await axiosClient.post(`/purchases/orders/${orderId}/request-advance`, { amount });
            fetchBrakeOrders(true); 
        } catch (error: any) {
            const mensaje = error.response?.data?.detail || "Error: Ya solicitaste este anticipo o hubo un problema de red.";
            alert(mensaje);
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeAuthorization = async (orderId: number, folio: string) => {
        if (!window.confirm(`¿Revocar firma de la orden ${folio}? Regresará a Mesa de Control para edición.`)) return;
        setLoading(true);
        try {
            await axiosClient.put(`/purchases/orders/${orderId}/revoke`);
            fetchBrakeOrders(true);
        } catch (error) {
            alert("Error al revocar.");
        } finally {
            setLoading(false);
        }
    };

    const isAutomaticItem = (item: any) => {
        const notes = item.notes || '';
        const desc = item.original_desc || '';
        return notes.includes('Valentina') || notes.includes('[AUTO]') || desc === 'REPOSICIÓN AUTOMÁTICA';
    };

    const manualSubtotal = manualOrderForm.items.reduce((sum, it) => sum + (it.qty * (parseFloat(it.expected_cost as string) || 0)), 0);
    const manualIva = manualSubtotal * 0.16;
    const manualTotal = manualSubtotal + manualIva;

    const getProvName = (p: any) => String(p?.business_name || p?.legal_name || '').trim();
    const getMatDesc = (m: any) => String(m?.name || m?.description || m?.material_name || m?.product_name || '').trim();
    const getMatSku = (m: any) => String(m?.sku || m?.code || m?.item_code || '').trim();

    const searchProv = (manualOrderForm.provider_name || '').toLowerCase();
    const filteredProviders = providersList.filter(p => getProvName(p).toLowerCase().includes(searchProv));
    const exactProviderMatch = searchProv !== '' && providersList.some(p => getProvName(p).toLowerCase() === searchProv);
    const isNewProvider = searchProv !== '' && !exactProviderMatch;

    const activeRow = activeDropdown.index !== null ? manualOrderForm.items[activeDropdown.index] : null;
    const searchSku = activeRow ? (activeRow.sku || '').toLowerCase() : '';
    const filteredMaterialsBySku = materialsList.filter(m => getMatSku(m).toLowerCase().includes(searchSku));
    const searchDesc = activeRow ? (activeRow.material_name || '').toLowerCase() : '';
    const filteredMaterialsByDesc = materialsList.filter(m => getMatDesc(m).toLowerCase().includes(searchDesc));

    const handleSelectMaterial = (index: number, mat: any) => {
        const newItems = [...manualOrderForm.items];
        const dbCost = parseFloat(mat.current_cost || mat.standard_cost || mat.cost || 0);
        const cost = dbCost.toFixed(2);
        
        newItems[index] = {
            ...newItems[index],
            sku: getMatSku(mat),
            material_name: getMatDesc(mat),
            expected_cost: cost
        };
        
        setManualOrderForm({ ...manualOrderForm, items: newItems });
        setActiveDropdown({ type: null, index: null });
    };

    const renderPlanningTable = () => (
        <div className="space-y-12 pb-20">
            {suggestedOrders.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <PackageCheck className="mx-auto text-slate-200 mb-4" size={48} />
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Sin requerimientos pendientes</p>
                </div>
            ) : (
                suggestedOrders.map((group, idx) => {
                    const isUnassigned = !group.provider_id;
                    const selectedInGroup = group.items.filter((it: any) => selectedItems[`${group.provider_id}-${it.material_id}`]);
                    const subtotal = selectedInGroup.reduce((acc: number, it: any) => acc + (it.qty * it.expected_cost), 0);
                    const iva = subtotal * 0.16;
                    const total = subtotal + iva;
                    
                    return (
                        <div key={idx} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div className="flex items-center gap-5">
                                    <div className={`p-3 rounded-2xl shadow-inner ${isUnassigned ? 'bg-slate-200 text-slate-500' : 'bg-indigo-600 text-white'}`}>
                                        <Building2 size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter leading-none">{group.provider_name || "Asignación Pendiente"}</h3>
                                        </div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 mt-1">Abastecimiento Valentina</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-0 overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-6 py-4 text-center w-10">Sel.</th>
                                            <th className="px-4 py-4 text-left w-32">SKU</th>
                                            <th className="px-4 py-4 text-left">Descripción Material</th>
                                            <th className="px-4 py-4 text-center">Cantidad</th>
                                            <th className="px-4 py-4 text-center w-32">Precio Unit.</th>
                                            <th className="px-8 py-4 text-right">Proyecto</th>
                                            <th className="px-8 py-4 text-right w-40">Importe</th>
                                            <th className="px-6 py-4 text-center w-24">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {group.items?.map((item: any, i: number) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            const isAuto = isAutomaticItem(item);
                                            
                                            return (
                                                <tr key={i} className={`hover:bg-slate-50/30 transition-colors group ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>
                                                    <td className="px-6 py-3 text-center">
                                                        <button onClick={() => { const key = `${group.provider_id}-${item.material_id}`; setSelectedItems(prev => ({ ...prev, [key]: !prev[key] })); }} className="text-indigo-600">
                                                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 font-black text-indigo-600 text-[11px] uppercase tracking-wider">{item.sku}</td>
                                                    <td className="px-4 py-3 font-bold text-slate-700 text-xs uppercase tracking-tight leading-snug">
                                                        <div className="flex flex-col">
                                                            <span>{item.name}</span>
                                                            {isAuto && <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-0.5">Alarma del Sistema</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-xs font-black text-slate-600">{item.qty}</td>
                                                    <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">${(item.expected_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-8 py-3 text-right">
                                                        {isCritical ? (
                                                            <div className="flex items-center justify-end gap-2 text-rose-600 font-black text-[10px] uppercase tracking-tighter"><AlertCircle size={14} /> {item.project_name}</div>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase italic tracking-tighter">S/PROYECTO</span>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-3 text-right text-xs font-black text-slate-800">${((item.qty || 0) * (item.expected_cost || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-6 py-3 text-center">
                                                        <div className="flex justify-center gap-2">
                                                            {isUnassigned && (
                                                                <button
                                                                    onClick={() => {
                                                                        setAssignModal({
                                                                            open: true,
                                                                            requisitionId: item.requisition_id,
                                                                            itemName: item.name,
                                                                            currentQty: item.qty,
                                                                        });
                                                                        setAssignForm({
                                                                            provider_id: '',
                                                                            provider_search: '',
                                                                            expected_unit_cost: '0.00',
                                                                        });
                                                                    }}
                                                                    title="Asignar Proveedor y Precio"
                                                                    className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-600 hover:text-white transition-colors shadow-sm border border-indigo-100"
                                                                >
                                                                    <Building2 size={16} />
                                                                </button>
                                                            )}
                                                            {!isCritical && (
                                                                <button onClick={() => handleFreezeRequisition(item.requisition_id)} title="Congelar / Aplazar Compra" className="p-1.5 bg-blue-50 text-blue-500 rounded-md hover:bg-blue-600 hover:text-white transition-colors shadow-sm border border-blue-100">
                                                                    <Snowflake size={16} />
                                                                </button>
                                                            )}
                                                            {!isAuto && !isCritical && (
                                                                <button onClick={() => handleDeleteManualRequisition(item.requisition_id)} title="Eliminar Solicitud Manual" className="p-1.5 bg-rose-50 text-rose-400 rounded-md hover:bg-rose-600 hover:text-white transition-colors shadow-sm border border-rose-100">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            )}
                                                            {isCritical && (
                                                                <button onClick={() => handleTransferCriticalItem(item.requisition_id, item.name)} title="Transferir a Sin Asignar" className="p-1.5 bg-indigo-50 text-indigo-400 rounded-md hover:bg-indigo-600 hover:text-white transition-colors">
                                                                    <RefreshCw size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-8 bg-white flex justify-between items-end border-t border-slate-50">
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                        <select
                                            value={pendingCategory}
                                            onChange={e => {
                                                setPendingCategory(e.target.value);
                                                setCategoryError(null);
                                            }}
                                            className={`border rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none ${
                                                categoryError
                                                    ? 'border-red-400 bg-red-50'
                                                    : 'border-slate-200'
                                            }`}
                                        >
                                            <option value="">— Categoría de gasto —</option>
                                            {OVERHEAD_CATEGORIES.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        {categoryError && (
                                            <p className="text-xs text-red-600 font-bold">{categoryError}</p>
                                        )}
                                    </div>
                                    <Button onClick={() => handleEmitPurchaseOrder(group)} className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-black uppercase text-xs h-12 px-10" disabled={isUnassigned || loading || selectedInGroup.length === 0}>
                                        Generar Orden de Compra ({selectedInGroup.length})
                                    </Button>
                                </div>
                                <div className="w-80 space-y-1 pr-14">
                                    <div className="flex justify-between items-center px-2 py-1 text-slate-500"><span className="text-[10px] font-black uppercase tracking-widest">Subtotal</span><span className="text-sm font-bold">${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 pb-3 text-slate-500"><span className="text-[10px] font-black uppercase tracking-widest">IVA (16%)</span><span className="text-sm font-bold">${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    <div className="flex justify-between items-center pt-4 px-2">
                                        <span className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.25em]">Total Neto</span>
                                        <div className="text-right"><span className="text-3xl font-black text-slate-900 leading-none">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );

    const renderBrakeTable = () => {
        const draftOrders = brakeOrders.filter(o => safeStatus(o.status) === 'DRAFT');
        return (
            <div className="space-y-12 pb-20">
                {draftOrders.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed"><Ban className="mx-auto text-slate-200 mb-4" size={48} /><p className="text-slate-400 font-black uppercase text-[10px]">No hay órdenes en revisión</p></div>
                ) : (
                    draftOrders.map((order, idx) => {
                        const subtotal = order.total_estimated_amount || 0;
                        const iva = subtotal * 0.16;
                        const total = subtotal + iva;
                        const canAuthorize = role === 'DIRECTOR' || role === 'GERENCIA';
                        return (
                            <div key={idx} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-l-4 border-l-rose-500 animate-in fade-in duration-300">
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50/30">
                                    <div className="flex items-center gap-5"><div className="p-3 rounded-2xl shadow-inner bg-rose-100 text-rose-600"><FileText size={24} /></div><div><h3 className="text-xl font-black text-slate-800 uppercase leading-none">{order.provider_name}</h3><p className="text-[9px] font-black uppercase text-slate-400 mt-1 tracking-widest text-rose-600">FOLIO: {order.folio}</p></div></div>
                                </div>
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-8 py-4 text-left w-32">SKU</th><th className="px-4 py-4 text-left">Descripción</th><th className="px-4 py-4 text-center">Cant.</th><th className="px-4 py-4 text-center w-32">P. Unit</th><th className="px-8 py-4 text-right">Proyecto</th><th className="px-8 py-4 text-right w-40">Importe</th><th className="px-6 py-4 text-center w-10">Quitar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {order.items?.map((item: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                                                <td className="px-8 py-3 font-black text-indigo-600 text-[11px] uppercase">{item.sku}</td><td className="px-4 py-3 font-bold text-slate-700 text-xs uppercase">{item.name}</td><td className="px-4 py-3 text-center text-xs font-black text-slate-600">{item.qty}</td><td className="px-4 py-3 text-center text-xs font-bold text-slate-400">${(item.expected_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td><td className="px-8 py-3 text-right"><span className="text-[10px] font-black text-rose-600 uppercase">{item.project_name || "GENERAL"}</span></td><td className="px-8 py-3 text-right text-xs font-black text-slate-800">${(item.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td><td className="px-6 py-3 text-center"><button onClick={() => handleRemoveItemFromOrder(order.id, item.id, item.sku)} className="text-rose-400 hover:text-rose-600"><Trash2 size={16} /></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="p-8 bg-white flex justify-between items-end border-t border-slate-50">
                                    <div className="flex gap-3">
                                        {canAuthorize && <Button onClick={() => handleAuthorizeOrder(order.id, order.folio)} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200 font-black uppercase text-xs h-12 px-10 shadow-lg">Autorizar Firma</Button>}
                                        <Button onClick={() => handleRejectOrder(order.id, order.folio)} variant="outline" className="text-slate-400 font-black uppercase text-[10px] px-6 h-12 border-slate-200">Rechazar</Button>
                                    </div>
                                    <div className="w-80 space-y-1 pr-14">
                                        <div className="flex justify-between items-center px-2 py-1 text-slate-500"><span className="text-[10px] font-black uppercase tracking-widest">Subtotal</span><span className="text-sm font-bold">${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                        <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 pb-3 text-slate-500"><span className="text-[10px] font-black uppercase tracking-widest">IVA (16%)</span><span className="text-sm font-bold">${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                        <div className="flex justify-between items-center pt-4 px-2"><span className="text-[11px] font-black text-rose-600 uppercase tracking-[0.25em]">Total Neto</span><div className="text-right"><span className="text-3xl font-black text-slate-900 leading-none">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        );
    };

    const renderSendingTable = () => {
        const authorizedOrders = brakeOrders.filter(o => safeStatus(o.status) === 'AUTORIZADA');
        
        const canDispatch = ['DIRECTOR', 'GERENCIA', 'ADMIN', 'ADMINISTRACION', 'COMPRAS'].includes(role);
        const canRevoke = ['DIRECTOR', 'GERENCIA', 'ADMINISTRACION', 'ADMIN', 'COMPRAS'].includes(role);

        return (
            <div className="space-y-12 pb-20">
                {authorizedOrders.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed"><Send className="mx-auto text-slate-200 mb-4" size={48} /><p className="text-slate-400 font-black uppercase text-[10px]">No hay órdenes listas para despacho</p></div>
                ) : (
                    authorizedOrders.map((order, idx) => {
                        const subtotal = order.total_estimated_amount || 0;
                        const iva = subtotal * 0.16;
                        const total = subtotal + iva;
                        return (
                            <div key={idx} className="bg-white rounded-3xl border border-emerald-200 shadow-md overflow-hidden border-t-8 border-t-emerald-500 animate-in slide-in-from-bottom-4 duration-500">
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/30">
                                    <div className="flex items-center gap-5"><div className="p-3 rounded-2xl shadow-inner bg-emerald-100 text-emerald-600"><PackageCheck size={24} /></div><div><h3 className="text-xl font-black text-slate-800 uppercase leading-none">{order.provider_name}</h3><p className="text-[9px] font-black uppercase text-emerald-600 mt-1 tracking-widest leading-none">FOLIO: {order.folio}</p><p className="text-[8px] font-black uppercase text-slate-400 mt-1 tracking-tighter leading-none">AUTORIZÓ: {order.authorized_by || 'SISTEMA'}</p></div></div>
                                    <Button 
                                        variant="outline" 
                                        className="text-[9px] font-black uppercase border-slate-200 h-8 hover:bg-slate-100"
                                        onClick={() => {
                                            const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
                                            const baseUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000';
                                            window.open(`${baseUrl}/api/v1/purchases/orders/${order.id}/pdf?token=${token}`, '_blank');
                                        }}
                                    >
                                        <FileText size={14} className="mr-1" />
                                        Ver PDF Oficial
                                    </Button>
                                </div>
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-8 py-4 text-left w-32">SKU</th><th className="px-4 py-4 text-left">Descripción</th><th className="px-4 py-4 text-center">Cant.</th><th className="px-4 py-4 text-center w-32">P. Unit</th><th className="px-8 py-4 text-right">Proyecto</th><th className="px-8 py-4 text-right w-40">Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {order.items?.map((item: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                                                <td className="px-8 py-3 font-black text-indigo-600 text-[11px] uppercase">{item.sku}</td><td className="px-4 py-3 font-bold text-slate-700 text-xs uppercase">{item.name}</td><td className="px-4 py-3 text-center text-xs font-black text-slate-600">{item.qty}</td><td className="px-4 py-3 text-center text-xs font-bold text-slate-400">${(item.expected_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td><td className="px-8 py-3 text-right"><span className="text-[10px] font-black text-rose-600 uppercase">{item.project_name || "GENERAL"}</span></td><td className="px-8 py-3 text-right text-xs font-black text-slate-800">${(item.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t border-slate-100">
                                    <div className="flex gap-4">
                                        {canDispatch && (
                                            <Button onClick={() => handleDispatchOrder(order.id, order.folio)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs h-12 px-10 shadow-lg"><Send size={16} className="mr-3" /> Enviar OC a Proveedor</Button>
                                        )}
                                        {canDispatch && (
                                            <Button onClick={() => handleRequestAdvance(order.id, order.folio, total)} variant="outline" className="border-orange-300 text-orange-600 font-black uppercase text-[10px] px-6 h-12 hover:bg-orange-50"><AlertTriangle size={14} className="mr-2" /> Pedir Anticipo</Button>
                                        )}
                                        {canRevoke && (
                                            <Button onClick={() => handleRevokeAuthorization(order.id, order.folio)} variant="outline" className="border-amber-200 text-amber-700 font-black uppercase text-[10px] px-6 h-12"><RefreshCw size={14} className="mr-2" /> Revocar Firma</Button>
                                        )}
                                    </div>
                                    <div className="w-80 space-y-1 pr-14">
                                        <div className="flex justify-between items-center text-slate-500"><span className="text-[10px] font-black uppercase">Subtotal</span><span className="text-sm font-bold">${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                        <div className="flex justify-between items-center text-slate-500 border-b border-slate-200 pb-2"><span className="text-[10px] font-black uppercase">IVA (16%)</span><span className="text-sm font-bold">${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                        <div className="flex justify-between items-center pt-2"><span className="text-[11px] font-black text-emerald-600 uppercase">Total Autorizado</span><span className="text-3xl font-black text-slate-900">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        );
    };

    const subMenuItems = [
        { id: 'CREATION', title: 'A. SOLICITUDES', icon: <Search />, color: 'indigo', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', activeBorder: 'border-l-indigo-600', count: suggestedOrders.length, desc: 'Revisar' },
        { id: 'BRAKE', title: 'B. FRENO', icon: <Ban />, color: 'rose', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', activeBorder: 'border-l-rose-600', count: brakeOrders.filter(o => safeStatus(o.status) === 'DRAFT').length, desc: 'Pausadas' },
        { id: 'SENDING', title: 'C. POR ENVIAR', icon: <Send />, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', activeBorder: 'border-l-emerald-600', count: brakeOrders.filter(o => safeStatus(o.status) === 'AUTORIZADA').length, desc: 'Envío' },
    ];

    return (
        <div className="space-y-10 min-h-[600px] relative">
            {activeSubSection === null && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
                    {subMenuItems.map(item => (
                        <div key={item.id} className="w-full relative h-40">
                            <Card onClick={() => setActiveSubSection(item.id as SubSection)} className={`p-6 cursor-pointer transition-all border-l-4 transform hover:-translate-y-1 h-full bg-white shadow-sm hover:shadow-xl ${item.activeBorder}`}>
                                <div className={`absolute top-0 left-0 bottom-0 w-20 flex items-center justify-center border-r font-black text-3xl ${item.bg} ${item.text} ${item.border}`}>{item.count}</div>
                                <div className="ml-20 h-full flex flex-col justify-between">
                                    <div className="flex justify-between items-start"><p className="text-[11px] font-black uppercase tracking-widest text-slate-800">{item.title}</p><div className={item.text}>{React.cloneElement(item.icon as React.ReactElement, { size: 18 })}</div></div>
                                    <div className="text-right"><p className={`text-lg font-black leading-none tracking-tighter ${item.text}`}>{item.desc}</p></div>
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-tight">Gestión Operativa</p><ArrowUpRight size={16} className="text-slate-300"/></div>
                                </div>
                            </Card>
                        </div>
                    ))}
                </div>
            )}
            
            {activeSubSection !== null && (
                <div className="mt-4 p-8 bg-white rounded-3xl border border-slate-100 min-h-[500px] shadow-xl animate-in fade-in duration-300">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-6 mb-8 gap-4">
                        <div className="text-slate-800 font-black text-2xl uppercase tracking-tighter flex items-center gap-3 truncate">
                            {activeSubSection === 'CREATION' ? (
                                <>
                                    <Search size={28} className="text-indigo-600"/> Inteligencia de Abastecimiento
                                    {canCreateDirectOC && (
                                        <Button
                                            onClick={() => setIsManualModalOpen(true)}
                                            className="ml-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest px-5 rounded-lg shadow-md h-8 flex items-center gap-2"
                                        >
                                            <Plus size={14} /> OC DIRECTA
                                        </Button>
                                    )}
                                    {canCreateRequisition && (
                                        <Button
                                            onClick={() => setIsReqModalOpen(true)}
                                            className="ml-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest px-5 rounded-lg shadow-md h-8 flex items-center gap-2"
                                        >
                                            <Plus size={14} /> Solicitud Manual
                                        </Button>
                                    )}
                                </>
                            ) : activeSubSection === 'BRAKE' ? (
                                <><Ban size={28} className="text-rose-600"/> Mesa de Control / Freno</>
                            ) : (
                                <><Send size={28} className="text-emerald-600"/> Centro de Despacho</>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleForceRefresh} variant="outline" className="border-slate-300 rounded-full px-4 py-2" title="Forzar Sincronización">
                                <RefreshCw size={16} className="text-slate-500" />
                            </Button>
                            <Button onClick={() => {
                                if (onExternalBack) {
                                    onExternalBack();
                                } else {
                                    setActiveSubSection(null);
                                }
                            }} variant="outline" className="font-black uppercase text-[10px] tracking-widest border-slate-300 rounded-full px-6 py-2"><ArrowLeft size={16} className="mr-2"/> Regresar</Button>
                        </div>
                    </div>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 h-full text-slate-300"><Loader2 className="animate-spin mb-4" size={40} /><p className="font-black uppercase tracking-widest text-[10px] text-slate-400">Sincronizando Sistema...</p></div>
                    ) : (
                        activeSubSection === 'CREATION' ? renderPlanningTable() : activeSubSection === 'BRAKE' ? renderBrakeTable() : renderSendingTable()
                    )}
                </div>
            )}

            {/* Modal "Fast Track" */}
            {isManualModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl overflow-hidden border-t-8 border-t-emerald-500 animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
                        
                        {/* Cabecera Principal */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/10 shrink-0">
                            <div className="flex items-center gap-5 w-full">
                                <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600 flex-shrink-0">
                                    <PackageCheck size={32} strokeWidth={1.5} />
                                </div>
                                <div className="flex-1 mr-8 relative">
                                    <input
                                        value={manualOrderForm.provider_name}
                                        onChange={(e) => {
                                            setManualOrderForm({...manualOrderForm, provider_name: e.target.value});
                                            setActiveDropdown({type: 'provider', index: null});
                                        }}
                                        onFocus={() => setActiveDropdown({type: 'provider', index: null})}
                                        onBlur={() => setTimeout(() => {
                                            if(activeDropdown.type === 'provider') setActiveDropdown({type: null, index: null});
                                        }, 250)}
                                        placeholder="SELECCIONA O ESCRIBE EL PROVEEDOR AQUÍ..."
                                        className="w-full text-lg font-black text-slate-800 tracking-tight outline-none bg-transparent placeholder-slate-300 border-b border-transparent hover:border-emerald-200 focus:border-emerald-400 transition-colors py-1 uppercase"
                                    />
                                    
                                    <div className="flex items-center gap-3 mt-1.5 h-4">
                                        <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">FOLIO: NUEVA OC DIRECTA</p>
                                        {exactProviderMatch && (
                                            <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                <CheckCircle2 size={10}/> EN CATÁLOGO
                                            </span>
                                        )}
                                        {isNewProvider && (
                                            <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-100 px-2 py-0.5 rounded flex items-center gap-1">
                                                <AlertCircle size={10}/> PROVEEDOR NUEVO (SE GUARDARÁ AL ENVIAR)
                                            </span>
                                        )}
                                    </div>

                                    {activeDropdown.type === 'provider' && (
                                        <ul className="absolute z-[9999] top-full left-0 w-full md:w-2/3 bg-white border border-slate-200 shadow-xl max-h-48 overflow-y-auto mt-2 rounded-xl py-1">
                                            {filteredProviders.length > 0 ? (
                                                filteredProviders.map((p, i) => {
                                                    const pName = getProvName(p);
                                                    return (
                                                        <li 
                                                            key={i} 
                                                            onClick={() => {
                                                                setManualOrderForm({...manualOrderForm, provider_name: pName});
                                                                setActiveDropdown({type: null, index: null});
                                                            }}
                                                            className="px-4 py-3 text-xs font-bold text-slate-700 uppercase cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 border-b border-slate-50 last:border-0"
                                                        >
                                                            {pName}
                                                        </li>
                                                    );
                                                })
                                            ) : (
                                                <li className="px-4 py-3 text-xs font-bold text-slate-400 italic">No se encontraron coincidencias. Se registrará como nuevo.</li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Categoría de gasto */}
                        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/30">
                            <div className="flex items-center gap-4">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                                    Categoría de Gasto *
                                </label>
                                <select
                                    value={manualOrderForm.overhead_category}
                                    onChange={e => setManualOrderForm({
                                        ...manualOrderForm,
                                        overhead_category: e.target.value
                                    })}
                                    className={`border rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 focus:outline-none flex-1 ${
                                        !manualOrderForm.overhead_category
                                            ? 'border-red-300 bg-red-50'
                                            : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <option value="">— Seleccionar categoría —</option>
                                    {OVERHEAD_CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-x-auto overflow-y-visible relative bg-white pb-6">
                            <table className="w-full min-w-[800px]">
                                <thead>
                                    <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white sticky top-0 z-10">
                                        <th className="px-6 py-4 text-left w-48">SKU</th>
                                        <th className="px-4 py-4 text-left">DESCRIPCIÓN</th>
                                        <th className="px-4 py-4 text-center w-24">CANT.</th>
                                        <th className="px-4 py-4 text-center w-32">P. UNIT</th>
                                        <th className="px-6 py-4 text-center w-28">PROYECTO</th>
                                        <th className="px-6 py-4 text-right w-36">IMPORTE</th>
                                        <th className="px-4 py-4 text-center w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {manualOrderForm.items.map((item, rowIndex) => (
                                        <tr key={rowIndex} className="hover:bg-slate-50/30 transition-colors group">
                                            <td className="px-6 py-4 align-middle relative">
                                                <input
                                                    value={item.sku}
                                                    onChange={(e) => {
                                                        handleItemChange(rowIndex, 'sku', e.target.value);
                                                        setActiveDropdown({type: 'sku', index: rowIndex});
                                                    }}
                                                    onFocus={() => setActiveDropdown({type: 'sku', index: rowIndex})}
                                                    onBlur={() => setTimeout(() => {
                                                        if(activeDropdown.type === 'sku' && activeDropdown.index === rowIndex) setActiveDropdown({type: null, index: null});
                                                    }, 250)}
                                                    placeholder="BUSCAR SKU..."
                                                    className="w-full bg-transparent border-b border-dashed border-slate-300 focus:border-emerald-500 hover:border-emerald-300 outline-none py-1 font-black text-indigo-600 text-[11px] placeholder-slate-300 uppercase"
                                                />
                                                {activeDropdown.type === 'sku' && activeDropdown.index === rowIndex && (
                                                    <ul className="absolute z-[9999] top-full left-4 w-64 bg-white border border-slate-200 shadow-xl max-h-48 overflow-y-auto mt-1 rounded-xl py-1">
                                                        {filteredMaterialsBySku.length > 0 ? (
                                                            filteredMaterialsBySku.map((m, i) => {
                                                                const mSku = getMatSku(m);
                                                                const mDesc = getMatDesc(m);
                                                                return (
                                                                    <li 
                                                                        key={i} 
                                                                        onClick={() => handleSelectMaterial(rowIndex, m)}
                                                                        className="px-4 py-3 text-xs cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 border-b border-slate-50 last:border-0"
                                                                    >
                                                                        <span className="font-black text-indigo-600 block mb-0.5 uppercase">{mSku}</span>
                                                                        <span className="font-bold text-slate-600 uppercase">{mDesc}</span>
                                                                    </li>
                                                                );
                                                            })
                                                        ) : (
                                                            <li className="px-4 py-3 text-xs font-bold text-slate-400 italic">Libre</li>
                                                        )}
                                                    </ul>
                                                )}
                                            </td>
                                            
                                            <td className="px-4 py-4 align-middle relative">
                                                <input
                                                    value={item.material_name}
                                                    onChange={(e) => {
                                                        handleItemChange(rowIndex, 'material_name', e.target.value);
                                                        setActiveDropdown({type: 'material', index: rowIndex});
                                                    }}
                                                    onFocus={() => setActiveDropdown({type: 'material', index: rowIndex})}
                                                    onBlur={() => setTimeout(() => {
                                                        if(activeDropdown.type === 'material' && activeDropdown.index === rowIndex) setActiveDropdown({type: null, index: null});
                                                    }, 250)}
                                                    placeholder="ESCRIBIR PRODUCTO..."
                                                    className="w-full bg-transparent border-b border-dashed border-slate-300 focus:border-emerald-500 hover:border-emerald-300 outline-none py-1 font-bold text-slate-700 text-xs placeholder-slate-300 uppercase"
                                                />
                                                {activeDropdown.type === 'material' && activeDropdown.index === rowIndex && (
                                                    <ul className="absolute z-[9999] top-full left-0 w-[120%] bg-white border border-slate-200 shadow-xl max-h-48 overflow-y-auto mt-1 rounded-xl py-1">
                                                        {filteredMaterialsByDesc.length > 0 ? (
                                                            filteredMaterialsByDesc.map((m, i) => {
                                                                const mSku = getMatSku(m);
                                                                const mDesc = getMatDesc(m);
                                                                return (
                                                                    <li 
                                                                        key={i} 
                                                                        onClick={() => handleSelectMaterial(rowIndex, m)}
                                                                        className="px-4 py-3 text-xs cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 border-b border-slate-50 last:border-0 flex justify-between"
                                                                    >
                                                                        <span className="font-bold text-slate-700 uppercase truncate pr-4">{mDesc}</span>
                                                                        <span className="font-black text-indigo-400 uppercase text-[10px]">{mSku}</span>
                                                                    </li>
                                                                );
                                                            })
                                                        ) : (
                                                            <li className="px-4 py-3 text-xs font-bold text-slate-400 italic">Libre</li>
                                                        )}
                                                    </ul>
                                                )}
                                            </td>

                                            <td className="px-4 py-4 text-center align-middle">
                                                <input
                                                    type="number" min="1"
                                                    value={item.qty}
                                                    onChange={(e) => handleItemChange(rowIndex, 'qty', Number(e.target.value))}
                                                    className="w-16 mx-auto bg-transparent text-center font-black text-slate-800 border-b border-dashed border-slate-300 focus:border-emerald-500 hover:border-emerald-300 outline-none py-1 text-xs"
                                                />
                                            </td>

                                            <td className="px-4 py-4 text-center align-middle">
                                                <div className="flex items-center justify-center border-b border-dashed border-slate-300 focus-within:border-emerald-500 hover:border-emerald-300 transition-colors w-24 mx-auto">
                                                    <span className="text-xs font-bold text-slate-500 mr-1">$</span>
                                                    <input
                                                        type="number" min="0" step="0.01"
                                                        value={item.expected_cost}
                                                        onChange={(e) => handleItemChange(rowIndex, 'expected_cost', e.target.value)}
                                                        onBlur={(e) => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            handleItemChange(rowIndex, 'expected_cost', val.toFixed(2));
                                                        }}
                                                        className="w-full bg-transparent text-left font-bold text-slate-500 outline-none py-1 text-xs"
                                                    />
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 text-center align-middle">
                                                <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">GENERAL</span>
                                            </td>
                                            
                                            <td className="px-6 py-4 text-right text-xs font-black text-slate-800 align-middle">
                                                ${(item.qty * (parseFloat(item.expected_cost as string) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                            </td>
                                            
                                            <td className="px-4 py-4 text-center align-middle">
                                                <button 
                                                    onClick={() => handleRemoveRow(rowIndex)}
                                                    disabled={manualOrderForm.items.length === 1}
                                                    className={`p-1.5 rounded-md transition-colors ${manualOrderForm.items.length === 1 ? 'text-slate-200 cursor-not-allowed' : 'text-rose-400 hover:bg-rose-50 hover:text-rose-600'}`}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            <div className="px-6 pt-4">
                                <button 
                                    onClick={handleAddRow}
                                    className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors px-2 py-1 rounded-md hover:bg-indigo-50"
                                >
                                    <Plus size={16} strokeWidth={3} /> AGREGAR PARTIDA
                                </button>
                            </div>
                        </div>

                        <div className="p-8 bg-white flex justify-between items-end border-t border-slate-100 shrink-0">
                            <div className="flex gap-4">
                                <Button 
                                    onClick={handleSubmitManualOrder} 
                                    disabled={loading} 
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs h-12 px-8 shadow-md rounded-lg"
                                >
                                    {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <><Send size={16} className="mr-3" /> ENVIAR A FIRMA</>}
                                </Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => setIsManualModalOpen(false)} 
                                    className="border-amber-200 text-amber-700 font-black uppercase text-[10px] px-6 h-12 rounded-lg hover:bg-amber-50"
                                >
                                    <RefreshCw size={14} className="mr-2" /> CANCELAR
                                </Button>
                            </div>
                            <div className="w-80 space-y-2 pr-6">
                                <div className="flex justify-between items-center text-slate-600">
                                    <span className="text-[11px] font-black uppercase tracking-widest">SUBTOTAL</span>
                                    <span className="text-sm font-bold">${manualSubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600 border-b border-slate-100 pb-3">
                                    <span className="text-[11px] font-black uppercase tracking-widest">IVA (16%)</span>
                                    <span className="text-sm font-bold">${manualIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-end pt-2">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-emerald-700 uppercase tracking-widest leading-tight">TOTAL</span>
                                        <span className="text-[11px] font-black text-emerald-700 uppercase tracking-widest leading-tight">AUTORIZADO</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-2xl font-black text-slate-900 tracking-tighter">${manualTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {isReqModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-t-indigo-500 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                    <ShoppingCart size={20} className="text-indigo-600" />
                                    Nueva Solicitud de Compra
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 font-bold uppercase">
                                    Administración cotizará y generará la OC
                                </p>
                            </div>
                            <button
                                onClick={() => setIsReqModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <XCircle size={22} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Búsqueda en catálogo */}
                            <div className="relative">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Material (del catálogo o descripción libre)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Buscar en catálogo o escribir descripción..."
                                    value={reqForm.material_search || reqForm.description}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setReqForm(f => ({
                                            ...f,
                                            material_search: val,
                                            description: val,
                                            material_id: '',
                                        }));
                                    }}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                                />
                                {reqForm.material_search && !reqForm.material_id && (
                                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-40 overflow-auto">
                                        {materialsList
                                            .filter(m => getMatDesc(m).toLowerCase().includes(reqForm.material_search.toLowerCase()) ||
                                                        getMatSku(m).toLowerCase().includes(reqForm.material_search.toLowerCase()))
                                            .slice(0, 8)
                                            .map((m, i) => (
                                                <li
                                                    key={i}
                                                    onMouseDown={() => setReqForm(f => ({
                                                        ...f,
                                                        material_id: String(m.id),
                                                        material_search: getMatDesc(m),
                                                        description: getMatDesc(m),
                                                    }))}
                                                    className="px-4 py-2 text-xs font-bold text-slate-700 uppercase cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 border-b border-slate-50 last:border-0 flex justify-between"
                                                >
                                                    <span>{getMatDesc(m)}</span>
                                                    <span className="text-indigo-400 text-[10px]">{getMatSku(m)}</span>
                                                </li>
                                            ))}
                                        {materialsList.filter(m =>
                                            getMatDesc(m).toLowerCase().includes(reqForm.material_search.toLowerCase()) ||
                                            getMatSku(m).toLowerCase().includes(reqForm.material_search.toLowerCase())
                                        ).length === 0 && (
                                            <li className="px-4 py-3 text-xs font-bold text-slate-400 italic">
                                                No está en catálogo — se usará como descripción libre ✓
                                            </li>
                                        )}
                                    </ul>
                                )}
                                {reqForm.material_id && (
                                    <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mt-1 inline-flex items-center gap-1">
                                        <CheckCircle2 size={10} /> Del catálogo
                                    </span>
                                )}
                            </div>

                            {/* Cantidad */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Cantidad
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={reqForm.qty}
                                    onChange={(e) => setReqForm(f => ({ ...f, qty: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                                />
                            </div>

                            {/* Notas */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Notas (opcional)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Urgencia, especificaciones, proyecto..."
                                    value={reqForm.notes}
                                    onChange={(e) => setReqForm(f => ({ ...f, notes: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 resize-none"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                            <Button
                                variant="outline"
                                onClick={() => setIsReqModalOpen(false)}
                                className="border-slate-200 text-slate-500 font-black uppercase text-[10px] px-5"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSubmitRequisition}
                                disabled={loading || (!reqForm.description && !reqForm.material_id)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] px-6 shadow-md"
                            >
                                <Plus size={14} className="mr-2" /> Enviar Solicitud
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {assignModal.open && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-t-indigo-500 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                    <Building2 size={20} className="text-indigo-600" />
                                    Asignar Proveedor
                                </h3>
                                <p className="text-xs text-slate-500 mt-1 font-bold uppercase truncate">
                                    {assignModal.itemName} — Qty: {assignModal.currentQty}
                                </p>
                            </div>
                            <button
                                onClick={() => setAssignModal({ open: false, requisitionId: null, itemName: '', currentQty: 0 })}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <XCircle size={22} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Selector de Proveedor */}
                            <div className="relative">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Proveedor
                                </label>
                                <input
                                    type="text"
                                    placeholder="Buscar o seleccionar proveedor..."
                                    value={assignForm.provider_search}
                                    onChange={(e) => setAssignForm(f => ({ 
                                        ...f, 
                                        provider_search: e.target.value, 
                                        provider_id: '' 
                                    }))}
                                    onFocus={() => setAssignProviderFocused(true)}
                                    onBlur={() => setTimeout(() => setAssignProviderFocused(false), 200)}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                                />
                                {assignProviderFocused && !assignForm.provider_id && (
                                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-auto">
                                        {providersList
                                            .filter(p => 
                                                assignForm.provider_search === '' || 
                                                getProvName(p).toLowerCase().includes(assignForm.provider_search.toLowerCase())
                                            )
                                            .map((p, i) => (
                                                <li
                                                    key={i}
                                                    onMouseDown={() => setAssignForm(f => ({
                                                        ...f,
                                                        provider_id: String(p.id),
                                                        provider_search: getProvName(p),
                                                    }))}
                                                    className="px-4 py-2 text-xs font-bold text-slate-700 uppercase cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 border-b border-slate-50 last:border-0"
                                                >
                                                    {getProvName(p)}
                                                </li>
                                            ))}
                                        {providersList.filter(p => 
                                            assignForm.provider_search === '' || 
                                            getProvName(p).toLowerCase().includes(assignForm.provider_search.toLowerCase())
                                        ).length === 0 && (
                                            <li className="px-4 py-3 text-xs font-bold text-slate-400 italic">
                                                Sin coincidencias
                                            </li>
                                        )}
                                    </ul>
                                )}
                                {assignForm.provider_id && (
                                    <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mt-1 inline-flex items-center gap-1">
                                        <CheckCircle2 size={10} /> Seleccionado
                                    </span>
                                )}
                            </div>

                            {/* Precio Unitario */}
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                    Precio Unitario Estimado
                                </label>
                                <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-400">
                                    <span className="text-sm font-bold text-slate-400 mr-2">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={assignForm.expected_unit_cost}
                                        onChange={(e) => setAssignForm(f => ({ ...f, expected_unit_cost: e.target.value }))}
                                        className="w-full text-sm font-bold text-slate-700 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                            <Button
                                variant="outline"
                                onClick={() => setAssignModal({ open: false, requisitionId: null, itemName: '', currentQty: 0 })}
                                className="border-slate-200 text-slate-500 font-black uppercase text-[10px] px-5"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleAssignProvider}
                                disabled={!assignForm.provider_id || loading}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] px-6 shadow-md"
                            >
                                <Building2 size={14} className="mr-2" /> Asignar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};