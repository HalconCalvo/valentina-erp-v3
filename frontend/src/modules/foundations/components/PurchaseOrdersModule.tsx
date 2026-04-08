import React, { useState, useEffect } from 'react';
import { 
    Search, Ban, Send, PackageCheck, 
    ArrowUpRight, Loader2, ArrowLeft, ArrowRight,
    Building2, ShoppingCart, Calendar, Clock, CheckCircle2, FileText, XCircle, Trash2, CheckSquare, Square, AlertCircle, RefreshCw, Snowflake 
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import axiosClient from '../../../api/axios-client';

type SubSection = 'CREATION' | 'BRAKE' | 'SENDING' | null;

interface PurchaseOrdersModuleProps {
    onSubSectionChange?: (active: boolean) => void;
    targetTab?: string | null;
}

export const PurchaseOrdersModule: React.FC<PurchaseOrdersModuleProps> = ({ onSubSectionChange, targetTab }) => {
    // Inicializamos con targetTab si existe
    const [activeSubSection, setActiveSubSection] = useState<SubSection>(targetTab as SubSection || null);
    const [loading, setLoading] = useState(true);
    const [suggestedOrders, setSuggestedOrders] = useState<any[]>([]);
    const [brakeOrders, setBrakeOrders] = useState<any[]>([]);
    const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});

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

    // Escuchar cambios externos de pestaña
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

    const fetchPlanning = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = await axiosClient.get('/purchases/planning/consolidated');
            const data = Array.isArray(response.data) ? response.data : [];
            const sortedData = [...data].sort((a, b) => {
                const aHasProject = a.items.some((it: any) => it.project_name);
                const bHasProject = b.items.some((it: any) => it.project_name);
                return aHasProject === bHasProject ? 0 : aHasProject ? -1 : 1;
            });
            setSuggestedOrders(sortedData);
            
            if (!silent) {
                const initialSelection: Record<string, boolean> = {};
                sortedData.forEach((group: any) => {
                    group.items.forEach((item: any) => {
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
            const response = await axiosClient.get('/purchases/orders/');
            const data = Array.isArray(response.data) ? response.data : [];
            setBrakeOrders(data);
        } catch (error) {
            console.error("Error al cargar órdenes:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlanning();
        fetchBrakeOrders();

        const interval = setInterval(() => {
            fetchPlanning(true);
            fetchBrakeOrders(true);
        }, 15000);
        
        return () => clearInterval(interval);
    }, []); 

    const handleEmitPurchaseOrder = async (group: any) => {
        const itemsToEmit = group.items.filter((item: any) => selectedItems[`${group.provider_id}-${item.material_id}`]);
        if (itemsToEmit.length === 0) return alert("Debe seleccionar al menos un producto.");
        if (!window.confirm(`¿Confirmar emisión de Orden de Compra para ${group.provider_name}?`)) return;
        setLoading(true);
        try {
            const payload = {
                provider_id: group.provider_id,
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
            alert(error.response?.data?.detail || "Error al emitir.");
        } finally {
            setLoading(false);
        }
    };

    const handleAuthorizeOrder = async (orderId: number, folio: string) => {
        if (!window.confirm(`¿Autorizar definitivamente la orden ${folio}?`)) return;
        setLoading(true);
        try {
            await axiosClient.put(`/purchases/orders/${orderId}/authorize`);
            alert(`Orden ${folio} autorizada.`);
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
            alert(`Orden ${folio} enviada. Se movió a Almacén.`);
            fetchBrakeOrders(true);
        } catch (error) {
            alert("Error al despachar.");
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
                                                            {/* El Copo de Nieve siempre se muestra (excepto si es traslado de proyecto crítico) */}
                                                            {!isCritical && (
                                                                <button onClick={() => handleFreezeRequisition(item.requisition_id)} title="Congelar / Aplazar Compra" className="p-1.5 bg-blue-50 text-blue-500 rounded-md hover:bg-blue-600 hover:text-white transition-colors shadow-sm border border-blue-100">
                                                                    <Snowflake size={16} />
                                                                </button>
                                                            )}
                                                            {/* El Basurero SOLO se muestra si fue captura manual */}
                                                            {!isAuto && !isCritical && (
                                                                <button onClick={() => handleDeleteManualRequisition(item.requisition_id)} title="Eliminar Solicitud Manual" className="p-1.5 bg-rose-50 text-rose-400 rounded-md hover:bg-rose-600 hover:text-white transition-colors shadow-sm border border-rose-100">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            )}
                                                            {/* Transferencia si es de un proyecto */}
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
                                <Button onClick={() => handleEmitPurchaseOrder(group)} className="bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 shadow-sm font-black uppercase text-xs h-12 px-10" disabled={isUnassigned || loading || selectedInGroup.length === 0}>
                                    Generar Orden de Compra ({selectedInGroup.length})
                                </Button>
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
        const borradorOrders = brakeOrders.filter(o => o.status === 'BORRADOR');
        return (
            <div className="space-y-12 pb-20">
                {borradorOrders.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed"><Ban className="mx-auto text-slate-200 mb-4" size={48} /><p className="text-slate-400 font-black uppercase text-[10px]">No hay órdenes en revisión</p></div>
                ) : (
                    borradorOrders.map((order, idx) => {
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
        const authorizedOrders = brakeOrders.filter(o => o.status === 'AUTORIZADA');
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
                                            // Abrimos el PDF en una nueva pestaña (pasando el token por query si tu backend lo acepta, o asumiendo que el endpoint de PDF es público/por cookie)
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
                                        <Button onClick={() => handleDispatchOrder(order.id, order.folio)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs h-12 px-10 shadow-lg"><Send size={16} className="mr-3" /> Envíar OC a Proveedor</Button>
                                        <Button onClick={() => handleRevokeAuthorization(order.id, order.folio)} variant="outline" className="border-amber-200 text-amber-700 font-black uppercase text-[10px] px-6 h-12"><RefreshCw size={14} className="mr-2" /> Revocar Firma</Button>
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
        { id: 'BRAKE', title: 'B. FRENO', icon: <Ban />, color: 'rose', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', activeBorder: 'border-l-rose-600', count: brakeOrders.filter(o => o.status === 'BORRADOR').length, desc: 'Pausadas' },
        { id: 'SENDING', title: 'C. POR ENVIAR', icon: <Send />, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', activeBorder: 'border-l-emerald-600', count: brakeOrders.filter(o => o.status === 'AUTORIZADA').length, desc: 'Envío' },
    ];

    return (
        <div className="space-y-10 min-h-[600px]">
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
                            {activeSubSection === 'CREATION' ? <><Search size={28} className="text-indigo-600"/> Inteligencia de Abastecimiento</> : activeSubSection === 'BRAKE' ? <><Ban size={28} className="text-rose-600"/> Mesa de Control / Freno</> : <><Send size={28} className="text-emerald-600"/> Centro de Despacho</>}
                        </div>
                        <Button onClick={() => setActiveSubSection(null)} variant="outline" className="font-black uppercase text-[10px] tracking-widest border-slate-300 rounded-full px-6 py-2"><ArrowLeft size={16} className="mr-2"/> Regresar</Button>
                    </div>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 h-full text-slate-300"><Loader2 className="animate-spin mb-4" size={40} /><p className="font-black uppercase tracking-widest text-[10px] text-slate-400">Sincronizando Sistema...</p></div>
                    ) : (
                        activeSubSection === 'CREATION' ? renderPlanningTable() : activeSubSection === 'BRAKE' ? renderBrakeTable() : renderSendingTable()
                    )}
                </div>
            )}
        </div>
    );
};