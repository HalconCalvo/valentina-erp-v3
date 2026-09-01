import React, { useState, useEffect } from 'react';
import { 
    Search, Ban, Send, PackageCheck, 
    ArrowUpRight, Loader2, ArrowLeft,
    Building2, ShoppingCart, CheckCircle2, FileText, XCircle, Trash2, CheckSquare, Square, AlertCircle, RefreshCw, Snowflake, Plus, AlertTriangle, Truck, Pencil
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { VTable } from '@/components/ui/VTable';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import axiosClient from '../../../api/axios-client';
import { AllPurchaseOrdersModule } from './AllPurchaseOrdersModule';

type PendingConfirm =
    | { kind: 'emit'; group: any }
    | { kind: 'authorize'; orderId: number; folio: string }
    | { kind: 'removeItem'; orderId: number; itemId: number; sku: string }
    | { kind: 'deleteReq'; reqId: number }
    | { kind: 'freeze'; reqId: number }
    | { kind: 'transfer'; requisitionId: number; materialName: string }
    | { kind: 'reject'; orderId: number; folio: string }
    | { kind: 'dispatch'; orderId: number; folio: string }
    | { kind: 'revoke'; orderId: number; folio: string };

type SubSection = 'CREATION' | 'BRAKE' | 'SENDING' | 'PARTIAL' | 'ALL_ORDERS' | null;

interface PurchaseOrdersModuleProps {
    onSubSectionChange?: (active: boolean) => void;
    targetTab?: string | null;
    onExternalBack?: () => void;
}

export const PurchaseOrdersModule: React.FC<PurchaseOrdersModuleProps> = ({ onSubSectionChange, targetTab, onExternalBack }) => {
    const [activeSubSection, setActiveSubSection] = useState<SubSection>(targetTab as SubSection || null);
    const [allOrdersDetailOpen, setAllOrdersDetailOpen] = useState(false);
    const [allOrdersCloseSignal, setAllOrdersCloseSignal] = useState(0);
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

    const [newMatModal, setNewMatModal] = useState<{open: boolean, rowIndex: number | null}>({open: false, rowIndex: null});
    const [newMatForm, setNewMatForm] = useState({
        sku: '', name: '', category: '',
        purchase_unit: '', usage_unit: '',
        conversion_factor: 1,
        current_cost: '0.00',
        min_stock: 0, max_stock: 0,
    });
    const [newMatLoading, setNewMatLoading] = useState(false);
    const [skuYaExiste, setSkuYaExiste] = useState(false);
    const [skuMatchMaterial, setSkuMatchMaterial] = useState<any | null>(null);

    // Verificación de SKU duplicado SOLO contra materialsList en memoria (sin llamar al backend).
    // Reacciona al escribir el SKU, al precargarlo al abrir, y se limpia al cerrar el modal.
    useEffect(() => {
        if (!newMatModal.open) {
            setSkuYaExiste(false);
            setSkuMatchMaterial(null);
            return;
        }
        const target = (newMatForm.sku || '').trim().toUpperCase();
        if (!target) {
            setSkuYaExiste(false);
            setSkuMatchMaterial(null);
            return;
        }
        const match = materialsList.find(
            m => (m.sku || '').trim().toUpperCase() === target
        );
        setSkuYaExiste(!!match);
        setSkuMatchMaterial(match || null);
    }, [newMatForm.sku, materialsList, newMatModal.open]);

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
    const [emailModal, setEmailModal] = useState<{
        open: boolean;
        orderId: number | null;
        folio: string;
        providerEmail: string;
    }>({ open: false, orderId: null, folio: '', providerEmail: '' });
    const [sendingEmail, setSendingEmail] = useState(false);

    const [pendingCategory, setPendingCategory] = useState<string>('');
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    const [editingOverheadId, setEditingOverheadId] = useState<number | null>(null);
    const [overheadDraft, setOverheadDraft] = useState<string>('');
    const [editItemModal, setEditItemModal] = useState<{ open: boolean; orderId: number | null; item: any | null }>({ open: false, orderId: null, item: null });
    const [editItemForm, setEditItemForm] = useState<{ quantity_ordered: string; expected_unit_cost: string; custom_description: string }>({ quantity_ordered: '', expected_unit_cost: '', custom_description: '' });
    const [cancelItemModal, setCancelItemModal] = useState<{ open: boolean; orderId: number | null; item: any | null }>({ open: false, orderId: null, item: null });
    const [cancelItemReason, setCancelItemReason] = useState<string>('');

    const [allMaterials, setAllMaterials] = useState<any[]>([]);
    const [materialSuggestions, setMaterialSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

    const OVERHEAD_CATEGORIES = [
        'MATERIALES', 'PLANTA', 'COMUNICACIONES', 'COMBUSTIBLES', 'TRANSPORTE',
        'INSUMOS', 'MAQUINARIA', 'EXTERNOS', 'MAQUILA', 'OTRO'
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
    const canCreateDirectOC = ['ADMIN', 'MANAGER', 'DIRECTOR'].includes(role);
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
        axiosClient.get('/foundations/providers'),
        axiosClient.get('/foundations/materials')
    ]);
            setProvidersList(extractList(provRes, 'providers'));
            setMaterialsList(extractList(matRes, 'materials'));
        } catch {
            toast.error('Error al cargar catálogos.');
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
        } catch {
            toast.error('Error al cargar planeación.');
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
        } catch {
            toast.error('Error al cargar órdenes.');
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

    useEffect(() => {
        axiosClient.get('/foundations/materials')
            .then(res => setAllMaterials(extractList({ data: res.data }, 'materials')))
            .catch(() => { /* fail silently */ });
    }, []);

    const handleEmitPurchaseOrder = (group: any) => {
        const itemsToEmit = group.items.filter((item: any) => selectedItems[`${group.provider_id}-${item.material_id}`]);
        if (itemsToEmit.length === 0) {
            toast.warning('Debe seleccionar al menos un producto.');
            return;
        }
        if (!pendingCategory) {
            setCategoryError("Debes seleccionar una categoría antes de generar la OC.");
            return;
        }
        setPendingConfirm({ kind: 'emit', group });
    };

    const executePendingConfirm = async () => {
        if (!pendingConfirm) return;

        setLoading(true);
        try {
            switch (pendingConfirm.kind) {
                case 'emit': {
                    const { group } = pendingConfirm;
                    const itemsToEmit = group.items.filter(
                        (item: any) => selectedItems[`${group.provider_id}-${item.material_id}`],
                    );
                    await axiosClient.post('/purchases/orders/bulk-emit', {
                        provider_id: group.provider_id,
                        overhead_category: pendingCategory,
                        items: itemsToEmit.map((item: any) => ({
                            requisition_id: item.requisition_id,
                            material_id: item.material_id,
                            name: item.name,
                            qty: item.qty,
                            expected_cost: item.expected_cost,
                        })),
                    });
                    toast.success('Orden de compra emitida correctamente.');
                    fetchPlanning(true);
                    fetchBrakeOrders(true);
                    break;
                }
                case 'authorize':
                    await axiosClient.put(`/purchases/orders/${pendingConfirm.orderId}/authorize`);
                    toast.success('Orden autorizada correctamente.');
                    fetchBrakeOrders(true);
                    break;
                case 'removeItem':
                    await axiosClient.delete(
                        `/purchases/orders/${pendingConfirm.orderId}/items/${pendingConfirm.itemId}`,
                    );
                    toast.success('Partida removida de la orden.');
                    fetchBrakeOrders(true);
                    fetchPlanning(true);
                    break;
                case 'deleteReq':
                    await axiosClient.delete(`/purchases/requisitions/${pendingConfirm.reqId}`);
                    toast.success('Solicitud eliminada correctamente.');
                    fetchPlanning(true);
                    break;
                case 'freeze':
                    await axiosClient.put(
                        `/purchases/requisitions/${pendingConfirm.reqId}/status?status=APLAZADA`,
                    );
                    toast.success('Compra aplazada correctamente.');
                    fetchPlanning(true);
                    break;
                case 'transfer':
                    await axiosClient.put(
                        `/purchases/requisitions/${pendingConfirm.requisitionId}/transfer`,
                    );
                    toast.success('Material transferido a asignación pendiente.');
                    fetchPlanning(true);
                    break;
                case 'reject':
                    await axiosClient.post(
                        `/purchases/orders/${pendingConfirm.orderId}/reject?action=RE-COTIZAR`,
                    );
                    toast.success('Orden enviada a re-cotización.');
                    fetchBrakeOrders(true);
                    fetchPlanning(true);
                    break;
                case 'dispatch':
                    await axiosClient.put(`/purchases/orders/${pendingConfirm.orderId}/dispatch`);
                    toast.success('Orden marcada como enviada.');
                    fetchBrakeOrders(true);
                    break;
                case 'revoke':
                    await axiosClient.put(`/purchases/orders/${pendingConfirm.orderId}/revoke`);
                    toast.success('Autorización revocada. La orden regresó a mesa de control.');
                    fetchBrakeOrders(true);
                    break;
            }
            setPendingConfirm(null);
        } catch (error: any) {
            const detail = error.response?.data?.detail;
            const messages: Record<PendingConfirm['kind'], string> = {
                emit: 'Error al emitir la Orden de Compra.',
                authorize: 'Error al autorizar.',
                removeItem: 'Error al remover partida.',
                deleteReq: 'Error al eliminar.',
                freeze: 'Error al aplazar.',
                transfer: 'Error al transferir.',
                reject: 'Error al rechazar.',
                dispatch: 'Error al despachar.',
                revoke: 'Error al revocar.',
            };
            toast.error(detail || messages[pendingConfirm.kind]);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const getConfirmDialogProps = () => {
        if (!pendingConfirm) return null;

        switch (pendingConfirm.kind) {
            case 'emit':
                return {
                    title: 'Emitir orden de compra',
                    message: `¿Confirmar emisión de Orden de Compra para ${pendingConfirm.group.provider_name}?`,
                    consequence: 'Se generará una OC con los materiales seleccionados.',
                    variant: 'default' as const,
                    confirmLabel: 'Confirmar emisión',
                };
            case 'authorize':
                return {
                    title: 'Autorizar orden',
                    message: `¿Autorizar definitivamente la orden ${pendingConfirm.folio}?`,
                    consequence: 'La orden quedará lista para despacho al proveedor.',
                    variant: 'default' as const,
                    confirmLabel: 'Autorizar',
                };
            case 'removeItem':
                return {
                    title: 'Quitar partida',
                    message: `¿Quitar SKU ${pendingConfirm.sku} de esta orden?`,
                    consequence: 'La partida se eliminará de la orden de compra.',
                    variant: 'danger' as const,
                    confirmLabel: 'Quitar partida',
                };
            case 'deleteReq':
                return {
                    title: 'Eliminar solicitud',
                    message: '¿Eliminar esta solicitud manual permanentemente?',
                    consequence: 'La solicitud quedará eliminada del sistema.',
                    variant: 'danger' as const,
                    confirmLabel: 'Eliminar',
                };
            case 'freeze':
                return {
                    title: 'Aplazar compra',
                    message: '¿Aplazar la compra de este material?',
                    consequence: 'Se enviará a la Congeladora para su revisión posterior.',
                    variant: 'default' as const,
                    confirmLabel: 'Aplazar',
                };
            case 'transfer':
                return {
                    title: 'Transferir material',
                    message: `¿Sustituir "${pendingConfirm.materialName}"?`,
                    consequence: 'Se moverá a Asignación Pendiente.',
                    variant: 'default' as const,
                    confirmLabel: 'Transferir',
                };
            case 'reject':
                return {
                    title: `Rechazar orden ${pendingConfirm.folio}`,
                    message: 'Elige cómo proceder con esta orden.',
                    consequence: 'Re-cotizar devuelve la orden a revisión. Eliminar todo cancela la orden por completo.',
                    variant: 'danger' as const,
                    confirmLabel: 'Re-cotizar',
                    cancelLabel: 'Eliminar todo',
                };
            case 'dispatch':
                return {
                    title: 'Despachar orden',
                    message: `¿Confirmar despacho de la orden ${pendingConfirm.folio} al proveedor?`,
                    consequence: 'La orden quedará marcada como enviada.',
                    variant: 'default' as const,
                    confirmLabel: 'Confirmar despacho',
                };
            case 'revoke':
                return {
                    title: 'Revocar autorización',
                    message: `¿Revocar firma de la orden ${pendingConfirm.folio}?`,
                    consequence: 'Regresará a Mesa de Control para edición.',
                    variant: 'danger' as const,
                    confirmLabel: 'Revocar firma',
                };
            default:
                return null;
        }
    };

    const handleConfirmDialogCancel = async () => {
        if (pendingConfirm?.kind === 'reject') {
            setLoading(true);
            try {
                await axiosClient.post(
                    `/purchases/orders/${pendingConfirm.orderId}/reject?action=CANCELAR`,
                );
                toast.success('Orden eliminada correctamente.');
                fetchBrakeOrders(true);
                fetchPlanning(true);
                setPendingConfirm(null);
            } catch (error: any) {
                toast.error(error.response?.data?.detail || 'Error al rechazar.');
                throw error;
            } finally {
                setLoading(false);
            }
            return;
        }
        setPendingConfirm(null);
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
            toast.warning('Por favor, completa el proveedor y al menos un material válido.');
            return;
        }
        if (!manualOrderForm.overhead_category) {
            toast.warning('Debes seleccionar una categoría de gasto.');
            return;
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
            toast.success('Orden manual creada correctamente.');
            fetchBrakeOrders(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al crear la orden manual.');
        } finally {
            setLoading(false);
        }
    };

    const handleAuthorizeOrder = (orderId: number, folio: string) => {
        setPendingConfirm({ kind: 'authorize', orderId, folio });
    };

    const handleRemoveItemFromOrder = (orderId: number, itemId: number, sku: string) => {
        setPendingConfirm({ kind: 'removeItem', orderId, itemId, sku });
    };

    const handleDeleteManualRequisition = (reqId: number) => {
        setPendingConfirm({ kind: 'deleteReq', reqId });
    };

    const handleFreezeRequisition = (reqId: number) => {
        setPendingConfirm({ kind: 'freeze', reqId });
    };

    const handleSubmitRequisition = async () => {
        if (!reqForm.description && !reqForm.material_id) {
            toast.warning('Describe qué necesitas o selecciona un material.');
            return;
        }
        if (!reqForm.qty || parseFloat(reqForm.qty) <= 0) {
            toast.warning('Ingresa una cantidad válida.');
            return;
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
            toast.success('Solicitud creada correctamente.');
            fetchPlanning(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al crear la solicitud.');
        } finally {
            setLoading(false);
        }
    };

    const handleAssignProvider = async () => {
        if (!assignModal.requisitionId || !assignForm.provider_id) {
            toast.warning('Selecciona un proveedor.');
            return;
        }
        const cost = parseFloat(assignForm.expected_unit_cost);
        if (isNaN(cost) || cost < 0) {
            toast.warning('Ingresa un precio unitario válido.');
            return;
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
            toast.success('Proveedor asignado correctamente.');
            fetchPlanning(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al asignar proveedor.');
        } finally {
            setLoading(false);
        }
    };

    const handleTransferCriticalItem = (requisitionId: number, materialName: string) => {
        setPendingConfirm({ kind: 'transfer', requisitionId, materialName });
    };

    const handleRejectOrder = (orderId: number, folio: string) => {
        setPendingConfirm({ kind: 'reject', orderId, folio });
    };

    const handleDispatchOrder = (orderId: number, folio: string) => {
        setPendingConfirm({ kind: 'dispatch', orderId, folio });
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
        if (isNaN(amount) || amount <= 0) {
            toast.warning('Monto inválido');
            return;
        }

        setLoading(true);
        try {
            await axiosClient.post(`/purchases/orders/${orderId}/request-advance`, { amount });
            toast.success('Anticipo solicitado correctamente.');
            fetchBrakeOrders(true); 
        } catch (error: any) {
            toast.error(
                error.response?.data?.detail ||
                    'Error: Ya solicitaste este anticipo o hubo un problema de red.',
            );
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeAuthorization = (orderId: number, folio: string) => {
        setPendingConfirm({ kind: 'revoke', orderId, folio });
    };

    const handleSaveOverhead = async (orderId: number) => {
        try {
            await axiosClient.patch(`/purchases/orders/${orderId}`, { overhead_category: overheadDraft });
            setEditingOverheadId(null);
            toast.success('Categoría actualizada');
            fetchBrakeOrders(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al actualizar categoría.');
        }
    };

    const handleDescriptionChange = (value: string) => {
        setEditItemForm(f => ({ ...f, custom_description: value }));
        if (value.length >= 2) {
            const lower = value.toLowerCase();
            const filtered = allMaterials
                .filter(m =>
                    (m.name && String(m.name).toLowerCase().includes(lower)) ||
                    (m.sku && String(m.sku).toLowerCase().includes(lower))
                )
                .slice(0, 8);
            setMaterialSuggestions(filtered);
            setShowSuggestions(true);
        } else {
            setMaterialSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleSelectSuggestion = (material: any) => {
        setEditItemForm(f => ({
            ...f,
            custom_description: material.name,
            expected_unit_cost: String(material.current_cost ?? ''),
        }));
        setShowSuggestions(false);
        setMaterialSuggestions([]);
    };

    const handleOpenEditItem = (orderId: number, item: any) => {
        setEditItemForm({
            quantity_ordered: String(item.quantity_ordered ?? item.qty ?? ''),
            expected_unit_cost: String(item.expected_unit_cost ?? item.expected_cost ?? ''),
            custom_description: item.custom_description ?? item.name ?? '',
        });
        setEditItemModal({ open: true, orderId, item });
    };

    const handleSaveEditItem = async () => {
        if (!editItemModal.orderId || !editItemModal.item) return;
        const original = editItemModal.item;
        const body: Record<string, any> = {};
        const qty = parseFloat(editItemForm.quantity_ordered);
        const cost = parseFloat(editItemForm.expected_unit_cost);
        const desc = editItemForm.custom_description.trim();
        const origQty = parseFloat(String(original.quantity_ordered ?? original.qty ?? 0));
        const origCost = parseFloat(String(original.expected_unit_cost ?? original.expected_cost ?? 0));
        const origDesc = (original.custom_description ?? original.name ?? '').trim();
        if (!isNaN(qty) && qty !== origQty) body.quantity_ordered = qty;
        if (!isNaN(cost) && cost !== origCost) body.expected_unit_cost = cost;
        if (desc !== origDesc) body.custom_description = desc;
        if (Object.keys(body).length === 0) { setEditItemModal({ open: false, orderId: null, item: null }); return; }
        try {
            await axiosClient.patch(`/purchases/orders/${editItemModal.orderId}/items/${original.id}`, body);
            setEditItemModal({ open: false, orderId: null, item: null });
            toast.success('Partida actualizada');
            fetchBrakeOrders(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al actualizar la partida.');
        }
    };

    const handleCancelItem = async () => {
        if (!cancelItemModal.orderId || !cancelItemModal.item) return;
        if (!cancelItemReason.trim()) {
            toast.warning('Debes ingresar un motivo');
            return;
        }
        try {
            await axiosClient.patch(
                `/purchases/orders/${cancelItemModal.orderId}/items/${cancelItemModal.item.id}/cancel`,
                { cancel_reason: cancelItemReason },
            );
            setCancelItemModal({ open: false, orderId: null, item: null });
            setCancelItemReason('');
            toast.success('Partida cancelada');
            fetchBrakeOrders(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al cancelar la partida.');
        }
    };

    const handleSendByEmail = async () => {
        if (!emailModal.orderId) return;
        const email = emailModal.providerEmail.trim();
        if (!email || !email.includes('@')) {
            toast.warning('Ingresa un correo válido.');
            return;
        }
        setSendingEmail(true);
        try {
            await axiosClient.post(
                `/purchases/orders/${emailModal.orderId}/send-email`,
                { to_email: email },
                { timeout: 30000 }
            );
            toast.success(`OC ${emailModal.folio} enviada por correo a ${email}`);
            setEmailModal({ open: false, orderId: null, folio: '', providerEmail: '' });
            fetchBrakeOrders(true);
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al enviar el correo.');
        } finally {
            setSendingEmail(false);
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

    // Valores existentes (únicos, ordenados) para autocompletar el alta rápida de material.
    const existingCategories = [...new Set(materialsList.map(m => m.category).filter(Boolean))].sort();
    const existingPurchaseUnits = [...new Set(materialsList.map(m => m.purchase_unit).filter(Boolean))].sort();
    const existingUsageUnits = [...new Set(materialsList.map(m => m.usage_unit).filter(Boolean))].sort();

    const handleSelectMaterial = (index: number, mat: any) => {
        const sku = getMatSku(mat);
        const category = (mat.category || '').trim().toLowerCase();

        // Verificar si el SKU ya existe en otro renglón de la OC
        const duplicateIndex = manualOrderForm.items.findIndex(
            (it, i) => i !== index && (it.sku || '').trim().toUpperCase() === sku.toUpperCase()
        );

        if (duplicateIndex !== -1 && category !== 'piedra') {
            // Categoría ≠ Piedra → redirigir al renglón existente
            toast.warning(
                `El SKU "${sku}" ya está en el renglón ${duplicateIndex + 1}. Revisa la cantidad o el precio de ese renglón.`,
            );
            setActiveDropdown({ type: null, index: null });
            // Scroll/highlight al renglón existente
            const rowEl = document.getElementById(`oc-row-${duplicateIndex}`);
            if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        // Categoría = Piedra o no hay duplicado → agregar normalmente
        const newItems = [...manualOrderForm.items];
        const dbCost = parseFloat(mat.current_cost || mat.standard_cost || mat.cost || 0);
        const cost = dbCost.toFixed(2);
        
        newItems[index] = {
            ...newItems[index],
            sku: sku,
            material_name: getMatDesc(mat),
            expected_cost: cost
        };
        
        setManualOrderForm({ ...manualOrderForm, items: newItems });
        setActiveDropdown({ type: null, index: null });
    };

    const handleSaveNewMaterial = async () => {
        if (!newMatForm.sku.trim() || !newMatForm.name.trim()) {
            toast.warning('SKU y Nombre son obligatorios.');
            return;
        }
        setNewMatLoading(true);
        try {
            const res = await axiosClient.post('/foundations/materials', {
                sku: newMatForm.sku.trim().toUpperCase(),
                name: newMatForm.name.trim().toUpperCase(),
                category: newMatForm.category || '',
                purchase_unit: newMatForm.purchase_unit || '',
                usage_unit: newMatForm.usage_unit || '',
                conversion_factor: Number(newMatForm.conversion_factor) || 1,
                current_cost: parseFloat(newMatForm.current_cost) || 0,
                min_stock: Number(newMatForm.min_stock) || 0,
                max_stock: Number(newMatForm.max_stock) || 0,
                production_route: 'MATERIAL',
                item_type: 'MATERIAL',
                is_active: true,
            });
            const created = res.data;
            // Recargar lista de materiales
            const matRes = await axiosClient.get('/foundations/materials/');
            setMaterialsList(extractList(matRes, 'materials'));
            // Autocompletar la fila
            if (newMatModal.rowIndex !== null) {
                handleSelectMaterial(newMatModal.rowIndex, created);
            }
            setNewMatModal({ open: false, rowIndex: null });
            setNewMatForm({
                sku: '', name: '', category: '',
                purchase_unit: '', usage_unit: '',
                conversion_factor: 1,
                current_cost: '0.00',
                min_stock: 0, max_stock: 0,
            });
            toast.success('Material creado correctamente.');
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Error al crear el material.');
        } finally {
            setNewMatLoading(false);
        }
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
                                            <button
                                                onClick={() => {
                                                    setAssignModal({
                                                        open: true,
                                                        requisitionId: group.items[0]?.requisition_id,
                                                        itemName: group.provider_name || 'Proveedor',
                                                        currentQty: 0,
                                                    });
                                                    setAssignForm({
                                                        provider_id: String(group.provider_id || ''),
                                                        provider_search: group.provider_name || '',
                                                        expected_unit_cost: '0.00',
                                                    });
                                                }}
                                                title={isUnassigned ? "Asignar Proveedor" : "Cambiar Proveedor"}
                                                className={`p-1.5 rounded-lg transition-colors border text-xs font-bold flex items-center gap-1 ${isUnassigned ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white border-indigo-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white border-amber-100'}`}
                                            >
                                                <Building2 size={13} />
                                                {isUnassigned ? 'Asignar' : 'Cambiar'}
                                            </button>
                                        </div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 mt-1">Abastecimiento Valentina</p>
                                    </div>
                                </div>
                            </div>
                            <VTable
                                columns={[
                                    {
                                        key: 'selected',
                                        label: 'Sel.',
                                        width: '40px',
                                        render: (item) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            return (
                                                <div className={`text-center ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>
                                                    <button onClick={() => { const key = `${group.provider_id}-${item.material_id}`; setSelectedItems(prev => ({ ...prev, [key]: !prev[key] })); }} className="text-indigo-600">
                                                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                                    </button>
                                                </div>
                                            );
                                        },
                                    },
                                    {
                                        key: 'sku',
                                        label: 'SKU',
                                        width: '128px',
                                        render: (item) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            return (
                                                <span className={`font-black text-indigo-600 text-[11px] uppercase tracking-wider ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>{String(item.sku ?? '')}</span>
                                            );
                                        },
                                    },
                                    {
                                        key: 'name',
                                        label: 'Descripción Material',
                                        render: (item) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            const isAuto = isAutomaticItem(item);
                                            return (
                                                <div className={`font-bold text-slate-700 text-xs uppercase tracking-tight leading-snug ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>
                                                    <div className="flex flex-col">
                                                        <span>{String(item.name ?? '')}</span>
                                                        {isAuto && <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-0.5">Alarma del Sistema</span>}
                                                    </div>
                                                </div>
                                            );
                                        },
                                    },
                                    {
                                        key: 'qty',
                                        label: 'Cantidad',
                                        render: (item) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            return (
                                                <span className={`block text-center text-xs font-black text-slate-600 ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>{String(item.qty ?? '')}</span>
                                            );
                                        },
                                    },
                                    {
                                        key: 'expected_cost',
                                        label: 'Precio Unit.',
                                        width: '128px',
                                        render: (item) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            return (
                                                <span className={`block text-center text-xs font-bold text-slate-400 ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>${Number(item.expected_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                            );
                                        },
                                    },
                                    {
                                        key: 'project_name',
                                        label: 'Proyecto',
                                        render: (item) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            return (
                                                <div className={`text-right ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>
                                                    {isCritical ? (
                                                        <div className="flex items-center justify-end gap-2 text-rose-600 font-black text-[10px] uppercase tracking-tighter"><AlertCircle size={14} /> {String(item.project_name)}</div>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase italic tracking-tighter">S/PROYECTO</span>
                                                    )}
                                                </div>
                                            );
                                        },
                                    },
                                    {
                                        key: 'importe',
                                        label: 'Importe',
                                        width: '160px',
                                        render: (item) => {
                                            const isSelected = selectedItems[`${group.provider_id}-${item.material_id}`];
                                            const isCritical = !!item.project_name;
                                            return (
                                                <span className={`block text-right text-xs font-black text-slate-800 ${!isSelected ? 'opacity-40' : ''} ${isCritical ? 'bg-rose-50/20' : ''}`}>${((Number(item.qty) || 0) * (Number(item.expected_cost) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                            );
                                        },
                                    },
                                ]}
                                data={(group.items || []).map((item: any) => ({ ...item, _groupProviderId: group.provider_id })) as Record<string, unknown>[]}
                                actions={(item) => {
                                    const isCritical = !!item.project_name;
                                    const isAuto = isAutomaticItem(item);
                                    const actions = [];
                                    if (isUnassigned) {
                                        actions.push({
                                            label: 'Asignar',
                                            icon: <Building2 size={16} />,
                                            onClick: () => {
                                                setAssignModal({
                                                    open: true,
                                                    requisitionId: item.requisition_id as number,
                                                    itemName: String(item.name ?? ''),
                                                    currentQty: Number(item.qty ?? 0),
                                                });
                                                setAssignForm({
                                                    provider_id: '',
                                                    provider_search: '',
                                                    expected_unit_cost: '0.00',
                                                });
                                            },
                                        });
                                    }
                                    if (!isCritical) {
                                        actions.push({
                                            label: 'Congelar',
                                            icon: <Snowflake size={16} />,
                                            onClick: () => handleFreezeRequisition(item.requisition_id as number),
                                        });
                                    }
                                    if (!isAuto && !isCritical) {
                                        actions.push({
                                            label: 'Eliminar',
                                            icon: <Trash2 size={16} />,
                                            variant: 'danger' as const,
                                            onClick: () => handleDeleteManualRequisition(item.requisition_id as number),
                                        });
                                    }
                                    if (isCritical) {
                                        actions.push({
                                            label: 'Transferir',
                                            icon: <RefreshCw size={16} />,
                                            onClick: () => handleTransferCriticalItem(item.requisition_id as number, String(item.name ?? '')),
                                        });
                                    }
                                    return actions;
                                }}
                                className="border-0 shadow-none rounded-none"
                            />
                            <div className="p-8 bg-white flex justify-between items-end border-t border-slate-50">
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                        <SearchableSelect
                                            items={OVERHEAD_CATEGORIES}
                                            value={pendingCategory}
                                            onChange={(value) => {
                                                setPendingCategory(value);
                                                setCategoryError(null);
                                            }}
                                            getLabel={(c) => c}
                                            getValue={(c) => c}
                                            placeholder="— Categoría de gasto —"
                                            className={`w-full ${categoryError ? 'ring-1 ring-red-400' : ''}`}
                                        />
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

    const renderBrakeTable = (statusFilter: string = 'DRAFT') => {
        const draftOrders = brakeOrders.filter(o => safeStatus(o.status) === statusFilter);
        const isPartial = statusFilter === 'RECIBIDA_PARCIAL';
        return (
            <div className="space-y-12 pb-20">
                {draftOrders.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border border-slate-100 border-dashed"><Ban className="mx-auto text-slate-200 mb-4" size={48} /><p className="text-slate-400 font-black uppercase text-[10px]">{isPartial ? 'No hay órdenes en recepción parcial' : 'No hay órdenes en revisión'}</p></div>
                ) : (
                    draftOrders.map((order, idx) => {
                        const subtotal = order.total_estimated_amount || 0;
                        const iva = subtotal * 0.16;
                        const total = subtotal + iva;
                        const canAuthorize = role === 'DIRECTOR' || role === 'MANAGER';
                        const columns = [
                            { key: 'sku', label: 'SKU', render: (item: Record<string, unknown>) => <span className="font-black text-indigo-600 text-[11px] uppercase">{String(item.sku ?? '')}</span> },
                            { key: 'name', label: 'Descripción', render: (item: Record<string, unknown>) => <span className="font-bold text-slate-700 text-xs uppercase">{String(item.name ?? '')}</span> },
                            { key: 'qty', label: isPartial ? 'Ordenado' : 'Cant.', render: (item: Record<string, unknown>) => <span className="block text-center text-xs font-black text-slate-600">{String(item.qty ?? '')}</span> },
                            ...(isPartial ? [
                                {
                                    key: 'quantity_received',
                                    label: 'Recibido',
                                    render: (item: Record<string, unknown>) => {
                                        const qty = Number(item.qty) || 0;
                                        const received = Number(item.quantity_received || 0);
                                        const isComplete = received >= qty;
                                        return (
                                            <span className={`block text-center text-xs font-black ${isComplete ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {String(received)}
                                            </span>
                                        );
                                    },
                                },
                                {
                                    key: 'faltante',
                                    label: 'Falta',
                                    render: (item: Record<string, unknown>) => {
                                        const faltante = Number(item.qty) - Number(item.quantity_received || 0);
                                        if (faltante > 0) {
                                            return (
                                                <span className="block text-center text-xs font-black text-red-600">
                                                    Faltan {faltante}
                                                </span>
                                            );
                                        }
                                        return (
                                            <span className="block text-center text-xs font-black text-emerald-600">
                                                ✓
                                            </span>
                                        );
                                    },
                                },
                            ] : []),
                            { key: 'expected_cost', label: 'P. Unit', render: (item: Record<string, unknown>) => <span className="block text-center text-xs font-bold text-slate-400">${Number(item.expected_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span> },
                            { key: 'project_name', label: 'Proyecto', render: (item: Record<string, unknown>) => <span className="block text-right text-[10px] font-black text-rose-600 uppercase">{String(item.project_name || 'GENERAL')}</span> },
                            { key: 'subtotal', label: 'Importe', render: (item: Record<string, unknown>) => <span className="block text-right text-xs font-black text-slate-800">${Number(item.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span> },
                        ];
                        return (
                            <div key={idx} className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-l-4 animate-in fade-in duration-300 ${isPartial ? 'border-l-amber-500' : 'border-l-rose-500'}`}>
                                <div className={`p-6 border-b border-slate-100 flex justify-between items-center ${isPartial ? 'bg-amber-50/30' : 'bg-rose-50/30'}`}>
                                    <div className="flex items-center gap-5"><div className={`p-3 rounded-2xl shadow-inner ${isPartial ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}><FileText size={24} /></div><div><h3 className="text-xl font-black text-slate-800 uppercase leading-none">{order.provider_name}</h3><p className={`text-[9px] font-black uppercase text-slate-400 mt-1 tracking-widest ${isPartial ? 'text-amber-600' : 'text-rose-600'}`}>FOLIO: {order.folio}</p>{['DIRECTOR', 'MANAGER', 'ADMIN'].includes(role) && (<div className="mt-1.5 flex items-center gap-1.5">{editingOverheadId === order.id ? (<Input autoFocus value={overheadDraft} onChange={e => setOverheadDraft(e.target.value)} onBlur={() => handleSaveOverhead(order.id)} onKeyDown={e => { if (e.key === 'Enter') handleSaveOverhead(order.id); if (e.key === 'Escape') setEditingOverheadId(null); }} className="text-[10px] font-black uppercase border-b border-slate-400 bg-transparent outline-none px-0 py-0 w-36 text-slate-600" />) : (<span className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1">{order.overhead_category || '—'}<button onClick={() => { setOverheadDraft(order.overhead_category || ''); setEditingOverheadId(order.id); }} className="text-slate-300 hover:text-slate-500 ml-1"><Pencil size={10} /></button></span>)}</div>)}</div></div>
                                </div>
                                <VTable
                                    columns={columns}
                                    data={(order.items || []) as Record<string, unknown>[]}
                                    actions={(item) => {
                                        if (item.is_cancelled) return [];
                                        const actions = [];
                                        if (['DIRECTOR', 'MANAGER', 'ADMIN'].includes(role)) {
                                            actions.push(
                                                { label: 'Editar', icon: <Pencil size={14} />, onClick: () => handleOpenEditItem(order.id, item) },
                                                { label: 'Cancelar', icon: <XCircle size={14} />, variant: 'danger' as const, onClick: () => { setCancelItemReason(''); setCancelItemModal({ open: true, orderId: order.id, item }); } },
                                            );
                                        }
                                        actions.push({ label: 'Quitar', icon: <Trash2 size={16} />, variant: 'danger' as const, onClick: () => handleRemoveItemFromOrder(order.id, Number(item.id), String(item.sku)) });
                                        return actions;
                                    }}
                                    className="border-0 shadow-none rounded-none"
                                />
                                <div className="p-8 bg-white flex justify-between items-end border-t border-slate-50">
                                    {!isPartial && (
                                    <div className="flex gap-3">
                                        {canAuthorize && <Button onClick={() => handleAuthorizeOrder(order.id, order.folio)} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200 font-black uppercase text-xs h-12 px-10 shadow-lg">Autorizar Firma</Button>}
                                        <Button onClick={() => handleRejectOrder(order.id, order.folio)} variant="outline" className="text-slate-400 font-black uppercase text-[10px] px-6 h-12 border-slate-200">Rechazar</Button>
                                    </div>
                                    )}
                                    {isPartial && <div />}
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
        
        const canDispatch = ['DIRECTOR', 'MANAGER', 'ADMIN', 'ADMINISTRACION', 'COMPRAS'].includes(role);
        const canRevoke = ['DIRECTOR', 'MANAGER', 'ADMINISTRACION', 'ADMIN', 'COMPRAS'].includes(role);

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
                                <VTable
                                    columns={[
                                        { key: 'sku', label: 'SKU', render: (item) => <span className="font-black text-indigo-600 text-[11px] uppercase">{String(item.sku ?? '')}</span> },
                                        { key: 'name', label: 'Descripción', render: (item) => <span className="font-bold text-slate-700 text-xs uppercase">{String(item.name ?? '')}</span> },
                                        { key: 'qty', label: 'Cant.', render: (item) => <span className="block text-center text-xs font-black text-slate-600">{String(item.qty ?? '')}</span> },
                                        { key: 'expected_cost', label: 'P. Unit', render: (item) => <span className="block text-center text-xs font-bold text-slate-400">${Number(item.expected_cost || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span> },
                                        { key: 'project_name', label: 'Proyecto', render: (item) => <span className="block text-right text-[10px] font-black text-rose-600 uppercase">{String(item.project_name || 'GENERAL')}</span> },
                                        { key: 'subtotal', label: 'Importe', render: (item) => <span className="block text-right text-xs font-black text-slate-800">${Number(item.subtotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span> },
                                    ]}
                                    data={(order.items || []) as Record<string, unknown>[]}
                                    className="border-0 shadow-none rounded-none"
                                />
                                <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t border-slate-100">
                                    <div className="flex gap-4">
                                        {canDispatch && (
                                            <div className="flex flex-col gap-2">
                                                <Button
  onClick={() => setEmailModal({
      open: true,
      orderId: order.id,
      folio: order.folio,
      providerEmail: order.provider_email || ''
  })}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs h-12 px-10 shadow-lg"
                                                >
                                                    <Send size={16} className="mr-3" /> Enviar por Correo
                                                </Button>
                                                <button
                                                    onClick={() => handleDispatchOrder(order.id, order.folio)}
                                                    className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest underline underline-offset-2"
                                                >
                                                    Marcar como enviado (sin correo)
                                                </button>
                                            </div>
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
        { id: 'CREATION', title: 'A. GENERAR OC', icon: <Search />, color: 'indigo', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', activeBorder: 'border-l-indigo-600', count: suggestedOrders.length, desc: 'Desde solicitudes o directa' },
        { id: 'BRAKE', title: 'B. POR AUTORIZAR', icon: <Ban />, color: 'rose', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', activeBorder: 'border-l-rose-600', count: brakeOrders.filter(o => safeStatus(o.status) === 'DRAFT').length, desc: 'Pendientes de autorización' },
        { id: 'SENDING', title: 'C. AUTORIZADAS', icon: <Send />, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', activeBorder: 'border-l-emerald-600', count: brakeOrders.filter(o => safeStatus(o.status) === 'AUTORIZADA').length, desc: 'Listas para enviar' },
        { id: 'PARTIAL', title: 'D. EN RECEPCIÓN', icon: <Truck />, color: 'amber', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', activeBorder: 'border-l-amber-600', count: brakeOrders.filter(o => safeStatus(o.status) === 'RECIBIDA_PARCIAL').length, desc: 'Recepción parcial' },
        { id: 'ALL_ORDERS', title: 'E. TODAS LAS OCs', icon: <Search />, color: 'slate', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100', activeBorder: 'border-l-slate-600', count: 0, desc: 'Consulta y corrección' },
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
                            ) : activeSubSection === 'SENDING' ? (
                                <><Send size={28} className="text-emerald-600"/> Centro de Despacho</>
                            ) : activeSubSection === 'PARTIAL' ? (
                                <><Truck size={28} className="text-amber-600"/> En Recepción</>
                            ) : activeSubSection === 'ALL_ORDERS' ? (
                                <div className="flex flex-col">
                                    <span className="flex items-center gap-3"><Search size={28} className="text-slate-600"/> Todas las Órdenes de Compra</span>
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Consulta y corrección</span>
                                </div>
                            ) : (
                                null
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleForceRefresh} variant="outline" className="border-slate-300 rounded-full px-4 py-2" title="Forzar Sincronización">
                                <RefreshCw size={16} className="text-slate-500" />
                            </Button>
                            <Button onClick={() => {
                                if (activeSubSection === 'ALL_ORDERS' && allOrdersDetailOpen) {
                                    setAllOrdersCloseSignal(s => s + 1);
                                    return;
                                }
                                if (onExternalBack) {
                                    onExternalBack();
                                } else {
                                    setAllOrdersDetailOpen(false);
                                    setActiveSubSection(null);
                                }
                            }} variant="outline" className="font-black uppercase text-[10px] tracking-widest border-slate-300 rounded-full px-6 py-2"><ArrowLeft size={16} className="mr-2"/> Regresar</Button>
                        </div>
                    </div>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 h-full text-slate-300"><Loader2 className="animate-spin mb-4" size={40} /><p className="font-black uppercase tracking-widest text-[10px] text-slate-400">Sincronizando Sistema...</p></div>
                    ) : (
                        activeSubSection === 'CREATION' ? renderPlanningTable()
                        : activeSubSection === 'BRAKE' ? renderBrakeTable()
                        : activeSubSection === 'SENDING' ? renderSendingTable()
                        : activeSubSection === 'PARTIAL' ? renderBrakeTable('RECIBIDA_PARCIAL')
                        : activeSubSection === 'ALL_ORDERS' ? (
                            <AllPurchaseOrdersModule
                                onDetailChange={setAllOrdersDetailOpen}
                                closeSignal={allOrdersCloseSignal}
                            />
                        )
                        : null
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
                                    <Input
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
                                <SearchableSelect
                                    items={OVERHEAD_CATEGORIES}
                                    value={manualOrderForm.overhead_category}
                                    onChange={(value) => setManualOrderForm({
                                        ...manualOrderForm,
                                        overhead_category: value,
                                    })}
                                    getLabel={(c) => c}
                                    getValue={(c) => c}
                                    placeholder="— Seleccionar categoría —"
                                    className={`flex-1 ${!manualOrderForm.overhead_category ? 'ring-1 ring-red-300' : ''}`}
                                />
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-x-auto overflow-y-visible relative bg-white pb-6">
                            <VTable
                                columns={[
                                    {
                                        key: 'sku',
                                        label: 'SKU',
                                        width: '192px',
                                        render: (row) => {
                                            const rowIndex = Number(row.rowIndex);
                                            const item = manualOrderForm.items[rowIndex];
                                            if (!item) return null;
                                            return (
                                                <div id={`oc-row-${rowIndex}`} className="align-middle relative">
                                                    <Input
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
                                                                <li
                                                                    onClick={() => {
                                                                        setNewMatModal({ open: true, rowIndex: rowIndex });
                                                                        setNewMatForm(f => ({ ...f, sku: item.sku, name: item.material_name }));
                                                                        setActiveDropdown({ type: null, index: null });
                                                                    }}
                                                                    className="px-4 py-3 text-xs font-black text-emerald-600 uppercase cursor-pointer hover:bg-emerald-50 flex items-center gap-2"
                                                                >
                                                                    <Plus size={12} strokeWidth={3} /> Dar de alta este material
                                                                </li>
                                                            )}
                                                        </ul>
                                                    )}
                                                </div>
                                            );
                                        },
                                    },
                                    {
                                        key: 'material_name',
                                        label: 'DESCRIPCIÓN',
                                        render: (row) => {
                                            const rowIndex = Number(row.rowIndex);
                                            const item = manualOrderForm.items[rowIndex];
                                            if (!item) return null;
                                            return (
                                                <div className="align-middle relative">
                                                    <Input
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
                                                                <li
                                                                    onClick={() => {
                                                                        setNewMatModal({ open: true, rowIndex: rowIndex });
                                                                        setNewMatForm(f => ({ ...f, sku: item.sku, name: item.material_name }));
                                                                        setActiveDropdown({ type: null, index: null });
                                                                    }}
                                                                    className="px-4 py-3 text-xs font-black text-emerald-600 uppercase cursor-pointer hover:bg-emerald-50 flex items-center gap-2"
                                                                >
                                                                    <Plus size={12} strokeWidth={3} /> Dar de alta este material
                                                                </li>
                                                            )}
                                                        </ul>
                                                    )}
                                                </div>
                                            );
                                        },
                                    },
                                    {
                                        key: 'qty',
                                        label: 'CANT.',
                                        width: '96px',
                                        render: (row) => {
                                            const rowIndex = Number(row.rowIndex);
                                            const item = manualOrderForm.items[rowIndex];
                                            if (!item) return null;
                                            return (
                                                <Input
                                                    type="number" min="1"
                                                    value={item.qty}
                                                    onChange={(e) => handleItemChange(rowIndex, 'qty', Number(e.target.value))}
                                                    className="w-16 mx-auto bg-transparent text-center font-black text-slate-800 border-b border-dashed border-slate-300 focus:border-emerald-500 hover:border-emerald-300 outline-none py-1 text-xs"
                                                />
                                            );
                                        },
                                    },
                                    {
                                        key: 'expected_cost',
                                        label: 'P. UNIT',
                                        width: '128px',
                                        render: (row) => {
                                            const rowIndex = Number(row.rowIndex);
                                            const item = manualOrderForm.items[rowIndex];
                                            if (!item) return null;
                                            return (
                                                <div className="flex items-center justify-center border-b border-dashed border-slate-300 focus-within:border-emerald-500 hover:border-emerald-300 transition-colors w-24 mx-auto">
                                                    <span className="text-xs font-bold text-slate-500 mr-1">$</span>
                                                    <Input
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
                                            );
                                        },
                                    },
                                    {
                                        key: 'project',
                                        label: 'PROYECTO',
                                        width: '112px',
                                        render: () => (
                                            <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">GENERAL</span>
                                        ),
                                    },
                                    {
                                        key: 'importe',
                                        label: 'IMPORTE',
                                        width: '144px',
                                        render: (row) => {
                                            const rowIndex = Number(row.rowIndex);
                                            const item = manualOrderForm.items[rowIndex];
                                            if (!item) return null;
                                            return (
                                                <span className="block text-right text-xs font-black text-slate-800">
                                                    ${(item.qty * (parseFloat(item.expected_cost as string) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                </span>
                                            );
                                        },
                                    },
                                ]}
                                data={manualOrderForm.items.map((item, rowIndex) => ({ ...item, rowIndex })) as Record<string, unknown>[]}
                                actions={(row) => [{
                                    label: 'Quitar',
                                    icon: <Trash2 size={16} />,
                                    variant: 'danger' as const,
                                    hidden: manualOrderForm.items.length === 1,
                                    onClick: () => handleRemoveRow(Number(row.rowIndex)),
                                }]}
                                className="border-0 shadow-none rounded-none min-w-[800px]"
                            />
                            
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
                                <Input
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
                                <Input
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

            {/* Mini-modal: Alta rápida de material */}
            {newMatModal.open && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border-t-4 border-t-emerald-500 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600"><Plus size={20} strokeWidth={2.5} /></div>
                                <div>
                                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Nuevo Material</p>
                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Alta Rápida al Catálogo</p>
                                </div>
                            </div>
                            <button onClick={() => setNewMatModal({ open: false, rowIndex: null })} className="text-slate-400 hover:text-slate-600"><XCircle size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">SKU *</label>
                                <Input
                                    value={newMatForm.sku}
                                    onChange={e => setNewMatForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                                    placeholder="Ej: MAT-001"
                                    className={`w-full border rounded-lg px-3 py-2 text-sm font-black text-indigo-600 uppercase outline-none ${skuYaExiste ? 'border-amber-400 bg-amber-50' : 'border-slate-200 focus:border-emerald-400'}`}
                                />
                                {skuYaExiste && skuMatchMaterial && (
                                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-2">
                                        <p className="text-[11px] font-bold text-amber-700 flex items-start gap-1 leading-snug">
                                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                            <span>Este SKU ya existe: <span className="font-black">{skuMatchMaterial.name}</span>. No es necesario crearlo de nuevo.</span>
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (newMatModal.rowIndex !== null) {
                                                    handleSelectMaterial(newMatModal.rowIndex, skuMatchMaterial);
                                                }
                                                setNewMatModal({ open: false, rowIndex: null });
                                                setNewMatForm({
                                                    sku: '', name: '', category: '',
                                                    purchase_unit: '', usage_unit: '',
                                                    conversion_factor: 1,
                                                    current_cost: '0.00',
                                                    min_stock: 0, max_stock: 0,
                                                });
                                            }}
                                            className="self-start px-4 py-1.5 text-[11px] font-black text-white uppercase bg-amber-500 hover:bg-amber-600 rounded-lg shadow-sm flex items-center gap-1.5"
                                        >
                                            <CheckCircle2 size={13} strokeWidth={3} /> Usar este material
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Nombre / Descripción *</label>
                                <Input
                                    value={newMatForm.name}
                                    onChange={e => setNewMatForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                                    placeholder="Ej: TORNILLO HEXAGONAL 1/2"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 uppercase outline-none focus:border-emerald-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Categoría</label>
                                <Input
                                    list="oc-categorias"
                                    value={newMatForm.category}
                                    onChange={e => setNewMatForm(f => ({ ...f, category: e.target.value }))}
                                    placeholder="Ej: TORNILLERÍA"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
                                />
                                <datalist id="oc-categorias">
                                    {existingCategories.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Unidad de Compra</label>
                                    <Input
                                        list="oc-unidades-compra"
                                        value={newMatForm.purchase_unit}
                                        onChange={e => setNewMatForm(f => ({ ...f, purchase_unit: e.target.value.toUpperCase() }))}
                                        placeholder="Ej: CAJA, ROLLO, BULTO"
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 uppercase outline-none focus:border-emerald-400"
                                    />
                                    <datalist id="oc-unidades-compra">
                                        {existingPurchaseUnits.map(u => <option key={u} value={u} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Unidad de Uso</label>
                                    <Input
                                        list="oc-unidades-uso"
                                        value={newMatForm.usage_unit}
                                        onChange={e => setNewMatForm(f => ({ ...f, usage_unit: e.target.value.toUpperCase() }))}
                                        placeholder="Ej: PZA, MT, KG"
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 uppercase outline-none focus:border-emerald-400"
                                    />
                                    <datalist id="oc-unidades-uso">
                                        {existingUsageUnits.map(u => <option key={u} value={u} />)}
                                    </datalist>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Factor de Conversión</label>
                                    <Input
                                        type="number" min="0" step="0.01"
                                        value={newMatForm.conversion_factor}
                                        onChange={e => setNewMatForm(f => ({ ...f, conversion_factor: parseFloat(e.target.value) }))}
                                        placeholder="1"
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-indigo-700 outline-none focus:border-emerald-400"
                                    />
                                    <p className="text-[9px] text-slate-400 mt-1 leading-tight">Cuántas unidades de uso contiene una unidad de compra (ej. 1 caja = 100 piezas → 100).</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Costo Unitario</label>
                                    <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 focus-within:border-emerald-400">
                                        <span className="text-xs font-bold text-slate-400 mr-1">$</span>
                                        <Input
                                            type="number" min="0" step="0.01"
                                            value={newMatForm.current_cost}
                                            onChange={e => setNewMatForm(f => ({ ...f, current_cost: e.target.value }))}
                                            className="w-full text-sm font-bold text-slate-700 outline-none bg-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setNewMatModal({ open: false, rowIndex: null })}
                                className="px-5 py-2 text-xs font-black text-slate-500 uppercase border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveNewMaterial}
                                disabled={newMatLoading || skuYaExiste}
                                title={skuYaExiste ? 'Este SKU ya existe. Usa "Usar este material" para evitar duplicados.' : undefined}
                                className="px-6 py-2 text-xs font-black text-white uppercase bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {newMatLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={3} />}
                                Guardar y Agregar
                            </button>
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
                                <Input
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
                                    <Input
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
        {editItemModal.open && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-t-indigo-500 animate-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Editar Partida</h3>
                        <button onClick={() => setEditItemModal({ open: false, orderId: null, item: null })} className="text-slate-400 hover:text-slate-600">
                            <XCircle size={22} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Cantidad ordenada</label>
                            <Input
                                type="number" min="0" step="0.01"
                                value={editItemForm.quantity_ordered}
                                onChange={e => setEditItemForm(f => ({ ...f, quantity_ordered: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Costo unitario esperado</label>
                            <Input
                                type="number" min="0" step="0.01"
                                value={editItemForm.expected_unit_cost}
                                onChange={e => setEditItemForm(f => ({ ...f, expected_unit_cost: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                            />
                        </div>
                        <div className="relative">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Descripción personalizada</label>
                            <Input
                                type="text"
                                value={editItemForm.custom_description}
                                onChange={e => handleDescriptionChange(e.target.value)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                onFocus={() => {
                                    if (editItemForm.custom_description.length >= 2) {
                                        handleDescriptionChange(editItemForm.custom_description);
                                    }
                                }}
                                autoComplete="off"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                            />
                            {showSuggestions && materialSuggestions.length > 0 && (
                                <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                                    {materialSuggestions.map((material, idx) => (
                                        <div
                                            key={material.id ?? idx}
                                            onClick={() => handleSelectSuggestion(material)}
                                            className="px-3 py-2 cursor-pointer hover:bg-indigo-50"
                                        >
                                            <span className="text-xs text-slate-400">{material.sku}</span>
                                            <span className="text-sm text-slate-700 ml-2">{material.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setEditItemModal({ open: false, orderId: null, item: null })} className="border-slate-200 text-slate-500 font-black uppercase text-[10px] px-5">
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveEditItem} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] px-6 shadow-md">
                            Guardar cambios
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {cancelItemModal.open && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-t-rose-500 animate-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Cancelar Partida</h3>
                        <button onClick={() => setCancelItemModal({ open: false, orderId: null, item: null })} className="text-slate-400 hover:text-slate-600">
                            <XCircle size={22} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-sm font-bold text-slate-700">Esta acción no se puede deshacer. La partida quedará cancelada con trazabilidad.</p>
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-bold">
                            Si todos los ítems de la OC quedan cancelados, la OC se cancelará automáticamente.
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Motivo de cancelación *</label>
                            <Input
                                type="text"
                                autoFocus
                                placeholder="Describe el motivo..."
                                value={cancelItemReason}
                                onChange={e => setCancelItemReason(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-rose-400"
                            />
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setCancelItemModal({ open: false, orderId: null, item: null })} className="border-slate-200 text-slate-500 font-black uppercase text-[10px] px-5">
                            Volver
                        </Button>
                        <Button onClick={handleCancelItem} className="bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-[10px] px-6 shadow-md">
                            Confirmar cancelación
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {emailModal.open && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-t-emerald-500 animate-in zoom-in-95 duration-200">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <Send size={20} className="text-emerald-600" />
                                Enviar OC por Correo
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 font-bold uppercase">
                                Folio: {emailModal.folio}
                            </p>
                        </div>
                        <button
                            onClick={() => setEmailModal({ open: false, orderId: null, folio: '', providerEmail: '' })}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            <XCircle size={22} />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                                Correo del Proveedor
                            </label>
                            <Input
                                type="email"
                                placeholder="proveedor@empresa.com"
                                value={emailModal.providerEmail}
                                onChange={(e) => setEmailModal(m => ({ ...m, providerEmail: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-emerald-400"
                                autoFocus
                            />
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                                ✅ Se adjuntará el PDF oficial de la OC
                            </p>
                            <p className="text-[10px] text-emerald-600 mt-1">
                                La orden quedará marcada como ENVIADA automáticamente.
                            </p>
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setEmailModal({ open: false, orderId: null, folio: '', providerEmail: '' })}
                            className="border-slate-200 text-slate-500 font-black uppercase text-[10px] px-5"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSendByEmail}
                            disabled={sendingEmail || !emailModal.providerEmail.includes('@')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] px-6 shadow-md"
                        >
                            {sendingEmail
                                ? <><Loader2 size={14} className="animate-spin mr-2" /> Enviando...</>
                                : <><Send size={14} className="mr-2" /> Enviar OC</>
                            }
                        </Button>
                    </div>
                </div>
            </div>
        )}
        {(() => {
            const confirmProps = getConfirmDialogProps();
            if (!confirmProps) return null;
            return (
                <VConfirmDialog
                    isOpen={pendingConfirm !== null}
                    title={confirmProps.title}
                    message={confirmProps.message}
                    consequence={confirmProps.consequence}
                    variant={confirmProps.variant}
                    confirmLabel={confirmProps.confirmLabel}
                    cancelLabel={confirmProps.cancelLabel}
                    onConfirm={executePendingConfirm}
                    onCancel={handleConfirmDialogCancel}
                />
            );
        })()}
        </div>
    );
};