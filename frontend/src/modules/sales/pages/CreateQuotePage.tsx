import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { 
    Save, Plus, Trash2, Edit, 
    ArrowLeft, X, Pencil, RefreshCw, Loader,
    CheckCircle2, TrendingUp, Lock, Wallet, Percent, ShieldAlert,
    Search
} from 'lucide-react';

import { useClients } from '../../foundations/hooks/useClients';
import { useFoundations } from '../../foundations/hooks/useFoundations';
import { designService } from '../../../api/design-service';
import { quotationService, formatQuotationFolio, EDITABLE_QUOTATION_STATUSES } from '../../../api/quotation-service';
import client from '../../../api/axios-client'; 

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { Card } from '@/components/ui/Card';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import { salesService } from '../../../api/sales-service';
import {
    DEFAULT_MIN_MARKUP, formatPercent, isBelowMinimum, markupAsPercent, markupPercent, netMarginPercent, priceFromMarkup,
} from '../utils/margins';
import { SalesOrderItem } from '../../../types/sales';
import { QuotationStatus } from '../../../types/quotations';

// --- HELPERS DE FORMATO ---
const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '$ 0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD', 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
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
    const location = useLocation();
    const readOnly = location.state?.readOnly || false;
    // Complementary OV: /quotations/new?parent=<sales order id>
    const parentParam = Number(new URLSearchParams(location.search).get('parent')) || null;

    return <CreateQuoteContent key={id || `new-${parentParam ?? ''}`} id={id} navigate={navigate} readOnly={readOnly} parentOrderId={parentParam} />;
};

const CreateQuoteContent: React.FC<{id?: string, navigate: any, readOnly?: boolean, parentOrderId?: number | null}> = ({ id, navigate, readOnly = false, parentOrderId = null }) => {
    const isEditMode = Boolean(id);
    const [parentId, setParentId] = useState<number | null>(parentOrderId);
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
    
    const isDirector = ['ADMIN', 'ADMINISTRADOR', 'DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);

    const clientHook = useClients();
    const foundationHook = useFoundations();

    const clients = clientHook?.clients || [];
    const taxRates = foundationHook?.taxRates || [];
    const config = foundationHook?.config || null;
    
    const [masters, setMasters] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(isEditMode); 
    const [saving, setSaving] = useState(false); 

    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [currentStatus, setCurrentStatus] = useState<QuotationStatus | null>(null);

    const [hasAdvanceInvoice, setHasAdvanceInvoice] = useState(false);
    const [isUserSelectedTax, setIsUserSelectedTax] = useState(false);

    const [commissionRate, setCommissionRate] = useState<number>(0);
    const [loadingCommission, setLoadingCommission] = useState(false);


    const INITIAL_HEADER = {
        created_at: new Date().toISOString().split('T')[0],
        client_id: 0,
        project_name: '',
        tax_rate_id: 0,
        valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        applied_margin_percent: 0, 
        advance_percent: 60, 
        notes: '',      
        conditions: ''  
    };

    const [header, setHeader] = useState(INITIAL_HEADER);
    const [items, setItems] = useState<SalesOrderItem[]>([]);
    // Lines whose recipe the Director corrected after they were quoted (item id → replacing version)
    const [obsoleteRecipes, setObsoleteRecipes] = useState<Record<number, { id: number; name: string }>>({});
    
    const [lineItem, setLineItem] = useState({
        master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0,
        commercial_description: ''
    });
    
    const [loadingCost, setLoadingCost] = useState<boolean>(false);
    const [addMode, setAddMode] = useState<'CATALOG' | 'MANUAL' | 'RESALE'>('CATALOG');
    const [resaleList, setResaleList] = useState<any[]>([]);
    const [selectedResaleSku, setSelectedResaleSku] = useState('');
    const [resaleSearch, setResaleSearch] = useState('');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);

    useEffect(() => {
        const loadCatalogs = async () => {
            try {
                if (clientHook?.fetchClients) clientHook.fetchClients();
                if (foundationHook?.fetchTaxRates) foundationHook.fetchTaxRates();
                if (foundationHook?.fetchConfig) foundationHook.fetchConfig();
                
                const [filteredMasters, resaleRes] = await Promise.all([
                    designService.getMasters(undefined, true),
                    client.get('/foundations/materials', { params: { is_resale: true } }),
                ]);
                setMasters(filteredMasters || []);
                setResaleList(Array.isArray(resaleRes.data) ? resaleRes.data : []);

                if (!isEditMode) fetchUserCommission();
            } catch {
                toast.error('Error al cargar catálogos.');
            }
        };
        loadCatalogs();
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
        } catch {
            toast.error('Error al cargar la comisión del usuario.');
        } 
        finally { setLoadingCommission(false); }
    };

    useEffect(() => {
        if (!isEditMode && config && !isUserSelectedTax) {
            const defaultMargin = markupAsPercent(config.target_profit_margin);
            if (header.applied_margin_percent === 0 && defaultMargin > 0) {
                setHeader(prev => ({ ...prev, applied_margin_percent: defaultMargin }));
            }
            if (taxRates.length > 0 && header.tax_rate_id === 0) {
                const defaultTaxId = config.default_tax_rate_id || taxRates[0].id;
                setHeader(prev => ({ ...prev, tax_rate_id: Number(defaultTaxId) }));
            }
        }
    }, [config, taxRates, isEditMode, isUserSelectedTax, header.tax_rate_id]);

    useEffect(() => {
        // Complementary OV inherits client and project from the original order (both editable).
        if (isEditMode || !parentOrderId) return;
        salesService.getOrderDetail(parentOrderId)
            .then((parent) => setHeader((prev) => ({
                ...prev,
                client_id: parent.client_id || prev.client_id,
                project_name: prev.project_name || `${parent.project_name} (adicional)`,
            })))
            .catch(() => toast.error('No se pudo cargar la OV original.'));
    }, [isEditMode, parentOrderId]);

    useEffect(() => {
        if (isEditMode && id) {
            setLoadingData(true);
            const loadOrder = async () => {
                try {
                    const data = await quotationService.getQuotation(Number(id));

                    if (data) {
                        setHeader({
                            created_at: safeDate(data.created_at),
                            client_id: data.client_id || 0,
                            project_name: data.project_name || '',
                            tax_rate_id: data.tax_rate_id || 0,
                            valid_until: safeDate(data.valid_until),
                            applied_margin_percent: Number(data.applied_margin_percent) || 0, 
                            advance_percent: Number(data.advance_percent) || 60,
                            notes: data.notes || '',
                            conditions: data.conditions || '' 
                        });
                        setItems(
                            (Array.isArray(data.items) ? data.items : []).map((item, idx) => ({
                                id: item.id ?? -idx,
                                product_name: item.product_name,
                                origin_version_id: item.origin_version_id ?? null,
                                quantity: item.quantity,
                                unit_price: item.unit_price,
                                frozen_unit_cost: item.frozen_unit_cost ?? 0,
                                is_resale: item.is_resale ?? false,
                                resale_sku: item.resale_sku ?? null,
                                commercial_description: item.commercial_description ?? '',
                                cost_snapshot: item.cost_snapshot ?? {},
                            })),
                        );
                        setObsoleteRecipes(Object.fromEntries((Array.isArray(data.items) ? data.items : [])
                            .map((item, idx) => [item.id ?? -idx, item] as const)
                            .filter(([, item]) => item.recipe_obsolete && item.replacement_version_id)
                            .map(([key, item]) => [key, { id: item.replacement_version_id as number, name: item.replacement_version_name ?? '' }])));
                        setCurrentStatus(data.status);
                        setParentId(data.parent_sales_order_id ?? null);
                        setIsUserSelectedTax(true);
                        
                        setHasAdvanceInvoice(Boolean(data.has_advance_invoice));
                        
                        let savedRate = 0;
                        if (data.applied_commission_percent !== undefined && data.applied_commission_percent !== null) {
                            savedRate = Number(data.applied_commission_percent);
                        }
                        if (savedRate > 1) savedRate = savedRate / 100;
                        setCommissionRate(savedRate);
                    }
                } catch {
                    toast.error('Error al cargar cotización.');
                    navigate('/sales');
                } finally { setLoadingData(false); }
            };
            loadOrder();
        }
    }, [id, isEditMode, navigate]);

    const itemsSum = useMemo(() => items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0), [items]);
    // El unit_price YA incluye la comisión (Costo × margen × comisión).
    // La comisión se extrae de forma informativa, NO se vuelve a sumar.
    const commissionAmount = itemsSum > 0 ? itemsSum - (itemsSum / (1 + commissionRate)) : 0;
    const finalSubtotal = itemsSum;
    const selectedTaxRate = taxRates.find(t => t.id === header.tax_rate_id);
    const taxAmount = selectedTaxRate ? finalSubtotal * selectedTaxRate.rate : 0;
    const total = finalSubtotal + taxAmount;

    const advanceAmount = total * (header.advance_percent / 100);

    const totalCost = useMemo(() => items.reduce((sum, i) => sum + ((i.frozen_unit_cost || 0) * i.quantity), 0), [items]);
    // La utilidad real = precio de venta - costo material - comisión (que ya está incluida en el precio)
    const totalRealCost = totalCost + commissionAmount;
    const grossProfit = finalSubtotal - totalRealCost;
    const marginPercent = netMarginPercent(finalSubtotal, totalCost, commissionAmount);
    const realMarkup = markupPercent(finalSubtotal, totalCost, commissionRate);
    const minMarkup = Number(config?.min_markup_percent ?? DEFAULT_MIN_MARKUP);
    const linesBelowMinimum = items.filter((item) => isBelowMinimum(markupPercent(item.unit_price, item.frozen_unit_cost || 0, commissionRate), minMarkup)).length;

    // Only drafts and quotations returned for changes are editable; prices are adjusted by the Director in the review.
    const isSalesStatusLocked = isEditMode && currentStatus !== null && !EDITABLE_QUOTATION_STATUSES.includes(currentStatus);

    const isFormLocked = readOnly || isSalesStatusLocked;
    const isAdvanceLocked = hasAdvanceInvoice || isFormLocked;

    // IVA tasa cero: absorbe el IVA de los materiales subiendo SOLO su costo para el precio.
    // El frozen_cost SIEMPRE queda sin IVA (= estimated_cost) para el semáforo.
    const calcCostoParaPrecio = (estimatedCost: number, materialCost: number, taxRate: number) => {
        if (taxRate === 0) {
            const mat = Number(materialCost) || 0;
            const est = Number(estimatedCost) || 0;
            const noMat = Math.max(est - mat, 0);
            return (mat * (1 + 0.16)) + noMat;
        }
        return Number(estimatedCost) || 0;
    };

    const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedVersionId = Number(e.target.value);
        const master = masters.find(m => m.id === lineItem.master_id);
        const version = master?.versions?.find((v: any) => v.id === selectedVersionId);
        // Calcular costo en tiempo real desde componentes con precios actuales
        // Replica la lógica del backend: SUM(quantity × current_cost / conversion_factor)
        // con Math.ceil al centavo por línea — igual que design.py
        let realtimeCost = 0;
        if (version?.components && version.components.length > 0) {
            for (const comp of version.components) {
                const qty = Number(comp.quantity) || 0;
                const cost = Number(comp.current_cost) || 0;
                const factor = Number(comp.conversion_factor) || 1;
                const unitCost = cost / factor;
                const costLine = Math.ceil(qty * unitCost * 100) / 100;
                realtimeCost += costLine;
                // material_cost solo incluye componentes de tipo MATERIAL
                // El backend marca esto con production_route === 'MATERIAL'
                // Como no tenemos ese campo en el frontend, usamos estimated_cost como referencia
            }
            realtimeCost = Math.round(realtimeCost * 100) / 100;
        }
        // Si no hay componentes con precios (versión sin datos), usar estimated_cost como respaldo
        const estimatedCost = realtimeCost > 0 ? realtimeCost : Number(version?.estimated_cost ?? version?.total_cost ?? version?.cost ?? 0);
        const materialCost = version ? Number(version.material_cost ?? 0) : 0;
        // Si el IVA aún no está seleccionado, buscar la tasa por defecto del config.
        // Evita que taxRate=0 active incorrectamente el ajuste de tasa cero.
        const defaultTaxRate = config?.default_tax_rate_id
            ? taxRates.find(t => t.id === config.default_tax_rate_id)
            : taxRates[0];
        const taxRate = selectedTaxRate
            ? Number(selectedTaxRate.rate)
            : defaultTaxRate ? Number(defaultTaxRate.rate) : 0.16;
        const costoParaPrecio = calcCostoParaPrecio(estimatedCost, materialCost, taxRate);
        // precio = costo × (1 + sobreprecio objetivo) × (1 + comisión)
        const salesPrice = priceFromMarkup(costoParaPrecio, markupAsPercent(header.applied_margin_percent), commissionRate);
        // frozen_cost = estimatedCost puro de la receta (sin ajustes de IVA)
        // Es el costo base que se muestra en el catálogo de Diseño.
        setLineItem({...lineItem, version_id: selectedVersionId, unit_price: Number(salesPrice.toFixed(2)), frozen_cost: estimatedCost,
            commercial_description: version?.commercial_description || ''});
    };

    const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setHeader({...header, client_id: Number(e.target.value)}); setSelectedCategory(''); setLineItem({...lineItem, master_id: 0, version_id: 0, unit_price: 0, frozen_cost: 0}); setEditingIndex(null); };
    
    const handleAddItem = () => {
        if (lineItem.quantity <= 0 || lineItem.unit_price <= 0) { toast.warning('Precio/Cantidad inválidos'); return; }
        let productName = lineItem.manual_name;
        if (addMode === 'CATALOG') {
            let foundMaster = masters.find(m => m.id === Number(lineItem.master_id));
            if (!foundMaster && selectedCategory) foundMaster = masters.find(m => m.category === selectedCategory && m.id === Number(lineItem.master_id));
            const v = (foundMaster && foundMaster.versions) ? foundMaster.versions.find((x:any) => x.id === Number(lineItem.version_id)) : null;
            if (v) productName = `${foundMaster?.name} - ${v.version_name}`;
            else productName = "Producto de Catálogo";
        } else if (addMode === 'RESALE') {
            if (!selectedResaleSku) {
                toast.warning('Selecciona un accesorio de reventa.');
                return;
            }
            const mat = resaleList.find((m) => m.sku === selectedResaleSku);
            productName = mat?.name || '';
        }
        const newItem: SalesOrderItem = {
            id: editingIndex !== null ? items[editingIndex].id : -Date.now(), 
            product_name: productName,
            origin_version_id: addMode === 'CATALOG' ? Number(lineItem.version_id) : null,
            quantity: Number(lineItem.quantity), unit_price: Number(lineItem.unit_price),
            frozen_unit_cost: addMode === 'CATALOG'
                ? lineItem.frozen_cost
                : (addMode === 'RESALE'
                    ? lineItem.frozen_cost
                    : (editingIndex !== null ? items[editingIndex].frozen_unit_cost : 0)),
            is_resale: addMode === 'RESALE',
            resale_sku: addMode === 'RESALE' ? selectedResaleSku : null,
            commercial_description: lineItem.commercial_description,
        };
        const updatedItems = [...items];
        if (editingIndex !== null) { updatedItems[editingIndex] = newItem; setEditingIndex(null); } else { updatedItems.push(newItem); }
        setItems(updatedItems);
        setLineItem({master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0, commercial_description: ''});
        setSelectedResaleSku('');
        setResaleSearch('');
        setAddMode('CATALOG');
    };

    /** Points the line to the corrected recipe; the price stays, the cost is recalculated when saving. */
    const handleRefreshRecipe = (itemId: number) => {
        const replacement = obsoleteRecipes[itemId];
        if (!replacement) return;
        const version = masters.flatMap((m: any) => m.versions ?? []).find((v: any) => v.id === replacement.id);
        setItems(items.map((item) => item.id === itemId
            ? { ...item, origin_version_id: replacement.id, frozen_unit_cost: version ? Number(version.estimated_cost) || item.frozen_unit_cost : item.frozen_unit_cost }
            : item));
        setObsoleteRecipes((prev) => { const next = { ...prev }; delete next[itemId]; return next; });
        toast.success('Receta actualizada. Guarda la cotización para recalcular el costo.');
    };

    const handleRemoveItem = (id?: number) => { setItems(items.filter(i => i.id !== id)); if (editingIndex !== null) handleCancelEdit(); };
    const handleCancelEdit = () => { setEditingIndex(null); setLineItem({master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0, commercial_description: ''}); setAddMode('CATALOG'); };
    
    const handleEditItem = (index: number) => {
        const item = items[index];
        setEditingIndex(index);
        const newItemState = { master_id: 0, version_id: 0, quantity: item.quantity, unit_price: item.unit_price, manual_name: item.product_name, frozen_cost: item.frozen_unit_cost || 0, commercial_description: item.commercial_description || '' };
        if (item.origin_version_id) { 
            setAddMode('CATALOG'); let found = false; 
            for (const m of masters) { 
                const v = m.versions?.find((ver:any) => ver.id === item.origin_version_id); 
                if (v) { setSelectedCategory(m.category); newItemState.master_id = m.id; newItemState.version_id = v.id; found = true; break; } 
            } 
            if (!found) setAddMode('MANUAL'); 
        } else { setAddMode('MANUAL'); }
        setLineItem(newItemState);
    };

    const handleRecalculatePrices = () => {
        // En tasa cero el precio incorpora el IVA de materiales, dato que las partidas ya
        // guardadas no tienen desglosado (solo frozen_unit_cost sin IVA). Recalcular desde ahí
        // borraría ese ajuste, así que no aplicamos el recálculo masivo.
        if (selectedTaxRate && Number(selectedTaxRate.rate) === 0) {
            toast.warning('En cotizaciones con IVA tasa cero, vuelve a seleccionar la versión del producto para recalcular su precio con el IVA de materiales. El recálculo masivo no aplica aquí.');
            return;
        }
        setShowRecalculateConfirm(true);
    };

    const executeRecalculatePrices = () => {
        const multiplier = priceFromMarkup(1, markupAsPercent(header.applied_margin_percent), commissionRate);
        const newItems = items.map(item => {
            if (item.frozen_unit_cost && item.frozen_unit_cost > 0) return { ...item, unit_price: Math.ceil(item.frozen_unit_cost * multiplier) };
            return item;
        });
        setItems(newItems);
        toast.success('Precios actualizados.');
    };

    const handleSubmit = async (requestAuthorization = false) => {
        const missingFields = [];
        if (!header.client_id) missingFields.push("Cliente");
        if (!header.project_name) missingFields.push("Nombre del Proyecto");
        if (!header.tax_rate_id) missingFields.push("Impuesto (IVA)");
        if (items.length === 0) missingFields.push("Al menos 1 Producto");

        if (missingFields.length > 0) {
            toast.warning(`No se puede guardar. Faltan: ${missingFields.join(', ')}`);
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
                cost_snapshot: item.cost_snapshot || {},
                is_resale: item.is_resale || false,
                resale_sku: item.resale_sku || null,
                commercial_description: item.commercial_description || null,
            }));
            const payload = {
                client_id: Number(header.client_id),
                project_name: header.project_name,
                tax_rate_id: Number(header.tax_rate_id),
                valid_until: header.valid_until
                    ? new Date(header.valid_until + 'T12:00:00').toISOString()
                    : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                applied_margin_percent: Number(header.applied_margin_percent), 
                advance_percent: Number(header.advance_percent),
                applied_commission_percent: commissionRate * 100, 
                currency: 'MXN',
                is_warranty: false,
                notes: header.notes,
                conditions: header.conditions,
                items: cleanItems,
                ...(isEditMode ? {} : { parent_sales_order_id: parentId }),
            };

            const saved = isEditMode && id
                ? await quotationService.updateQuotation(Number(id), payload)
                : await quotationService.createQuotation(payload);
            if (requestAuthorization) {
                await quotationService.requestAuthorization(saved.id);
                toast.success(`${saved.folio} enviada a Dirección para autorización.`);
            } else {
                toast.success(isEditMode ? 'Cotización actualizada.' : `Cotización ${saved.folio} creada.`);
            }
            navigate('/sales');
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al guardar la cotización.');
        } 
        finally { setSaving(false); }
    };

    const mastersOfClient = useMemo(() => header.client_id ? masters.filter(m => m.client_id === Number(header.client_id)) : [], [masters, header.client_id]);
    const availableCategories = useMemo(() => Array.from(new Set(mastersOfClient.map(m => m.category))), [mastersOfClient]);
    const filteredMasters = useMemo(() => selectedCategory ? mastersOfClient.filter(m => m.category === selectedCategory) : [], [mastersOfClient, selectedCategory]);

    const quoteItemColumns = useMemo((): VTableColumn<any>[] => {
        const cols: VTableColumn<any>[] = [
            {
                key: 'product_name',
                label: 'Producto',
                render: (item) => (
                    <>
                        <span className="font-bold text-slate-800 text-sm whitespace-normal">{item.product_name}</span>
                        {item.commercial_description && (
                            <p className="text-xs text-slate-500 mt-0.5 font-normal whitespace-normal">{item.commercial_description}</p>
                        )}
                    </>
                ),
            },
            {
                key: 'quantity',
                label: 'Cant.',
                render: (item) => <span className="font-bold text-slate-700 text-center block">{item.quantity}</span>,
            },
        ];
        if (isDirector) {
            cols.push({
                key: 'margin',
                label: 'Sobreprecio %',
                render: (item) => {
                    const markup = markupPercent(item.unit_price, item.frozen_unit_cost || 0, commissionRate);
                    return (
                        <span title="(precio sin comisión − costo) / costo"
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${isBelowMinimum(markup, minMarkup) ? 'text-red-700 bg-red-50 border-red-300' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                            {formatPercent(markup)}
                        </span>
                    );
                },
            });
            cols.push({
                key: 'frozen_unit_cost',
                label: 'Costo U.',
                render: (item) => (
                    <span className="font-mono text-slate-500 font-medium text-right block text-xs">{formatCurrency(item.frozen_unit_cost || 0)}</span>
                ),
            });
        }
        cols.push(
            {
                key: 'unit_price',
                label: 'P. Unitario',
                render: (item) => <span className="font-mono text-slate-700 text-right block">{formatCurrency(item.unit_price)}</span>,
            },
            {
                key: 'importe',
                label: 'Importe',
                render: (item) => (
                    <span className="font-bold font-mono text-slate-800 text-right block">{formatCurrency(item.quantity * item.unit_price)}</span>
                ),
            },
        );
        return cols;
    }, [isDirector]);
    
    let availableVersions: any[] = [];
    if (lineItem.master_id) {
        const m = masters.find(x => x.id === Number(lineItem.master_id));
        if (m && Array.isArray(m.versions)) availableVersions = m.versions;
    }

    if (loadingData) return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50"><Loader className="animate-spin text-indigo-600 mb-4" size={32}/><p className="text-slate-500 font-medium">Cargando cotización...</p></div>;

    const lockedInputClass = "bg-slate-100 text-slate-500 font-bold border-slate-200 cursor-not-allowed disabled:opacity-100";

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20 bg-slate-50 min-h-full">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        {isEditMode ? <Edit className="text-indigo-600"/> : <Plus className="text-emerald-600"/>}
                        {isEditMode ? `Editando Cotización ${formatQuotationFolio(Number(id))}` : 'Nueva Cotización'}
                    </h1>
                    {isDirector && <span className="text-xs font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded w-fit mt-1">Modo Director Activo</span>}
                </div>
                <Button variant="secondary" onClick={() => navigate('/sales')}><ArrowLeft size={18} className="mr-2"/> Regresar</Button>
            </div>

            {parentId && (
                <div className="bg-indigo-50 border-l-4 border-indigo-500 text-indigo-800 p-4 rounded shadow-sm">
                    <p className="font-bold">OV complementaria de OV-{String(parentId).padStart(4, '0')}</p>
                    <p className="text-sm">Al convertirse nace una OV propia (anticipo, facturas y saldo propios) ligada a la original.</p>
                </div>
            )}

            {linesBelowMinimum > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded shadow-sm text-sm font-bold">
                    {linesBelowMinimum} {linesBelowMinimum === 1 ? 'partida queda' : 'partidas quedan'} por debajo del sobreprecio mínimo ({minMarkup}%).
                </div>
            )}

            {Object.keys(obsoleteRecipes).length > 0 && (
                <div className="bg-amber-50 border-l-4 border-amber-500 text-amber-900 p-4 rounded shadow-sm space-y-2">
                    <p className="font-bold">Receta corregida — actualiza</p>
                    <p className="text-sm">Dirección corrigió la receta de estas partidas después de cotizarlas. Al actualizar se usa la receta nueva; el precio de venta se conserva y el costo se recalcula al guardar.</p>
                    {items.filter((item) => item.id !== undefined && obsoleteRecipes[item.id as number]).map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 bg-white/60 rounded px-3 py-2 text-sm">
                            <span><b>{item.product_name}</b> → {obsoleteRecipes[item.id as number].name}</span>
                            {!isFormLocked && (
                                <button type="button" onClick={() => handleRefreshRecipe(item.id as number)}
                                    className="px-3 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg">
                                    Actualizar receta
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {hasAdvanceInvoice && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded shadow-sm flex items-center gap-3">
                    <ShieldAlert className="shrink-0" />
                    <div><p className="font-bold">Factura de Anticipo Emitida (Candado Fiscal)</p><p className="text-sm">Por seguridad, el porcentaje de anticipo está bloqueado. Debe cancelar la factura para poder modificarlo.</p></div>
                </div>
            )}

            {/* === 1. NUEVO BLOQUE COMPRIMIDO DE DATOS GENERALES === */}
            <Card className="p-5 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    
                    {/* FILA 1: Identificación */}
                    <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">FECHA</label>
                        <Input disabled type="date" className={`w-full ${lockedInputClass}`} value={header.created_at} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">VIGENCIA</label>
                        <Input disabled={isFormLocked} type="date" className={`w-full ${isFormLocked ? lockedInputClass : 'bg-white border-slate-300 text-slate-900 font-bold'}`} value={header.valid_until} onChange={(e) => setHeader({...header, valid_until: e.target.value})} />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1">CLIENTE *</label>
                        <SearchableSelect
                            items={clients ?? []}
                            value={header.client_id ? String(header.client_id) : ''}
                            onChange={(v) => handleClientChange({ target: { value: v || '0' } } as React.ChangeEvent<HTMLSelectElement>)}
                            getLabel={(c) => c.full_name}
                            getValue={(c) => String(c.id)}
                            placeholder="-- Seleccionar --"
                            disabled={isFormLocked}
                            className={isFormLocked ? lockedInputClass : 'bg-slate-50 border-slate-300 text-slate-900 font-bold'}
                        />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1">PROYECTO *</label>
                        <Input disabled={isFormLocked} className={`w-full ${isFormLocked ? lockedInputClass : 'bg-white border-slate-300 text-slate-900 font-bold'}`} value={header.project_name} onChange={(e) => setHeader({...header, project_name: e.target.value})} />
                    </div>

                    {/* FILA 2: Finanzas */}
                    <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 mb-1 flex justify-between">
                            <span>IMPUESTO *</span>
                            {header.tax_rate_id === 0 && <span className="text-red-500 text-[9px] animate-pulse">REQUERIDO</span>}
                        </label>
                        <SearchableSelect
                            items={taxRates ?? []}
                            value={header.tax_rate_id ? String(header.tax_rate_id) : ''}
                            onChange={(v) => {
                                if (!v) return;
                                setIsUserSelectedTax(true);
                                setHeader((prev) => ({ ...prev, tax_rate_id: Number(v) }));
                            }}
                            getLabel={(t) => `${t.name} (${t.rate * 100}%)`}
                            getValue={(t) => String(t.id)}
                            placeholder="-- Seleccionar --"
                            disabled={isFormLocked}
                            className={`text-sm ${header.tax_rate_id === 0 ? 'border-red-300 bg-red-50' : (isFormLocked ? lockedInputClass : 'border-slate-300 text-slate-900 font-bold')}`}
                        />
                    </div>

                    <div className="col-span-12 md:col-span-4">
                        <div className="text-xs mb-1">&nbsp;</div> {/* Espaciador invisible para alinear alturas */}
                        <div className="bg-indigo-50 p-2 rounded-lg border border-indigo-100 flex items-center justify-between h-[38px]">
                            <label className="text-xs font-black text-indigo-800 uppercase tracking-wide flex items-center gap-1">
                                <Percent size={14}/> Anticipo
                            </label>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Input disabled={isAdvanceLocked} type="number" className={`w-16 text-right pr-4 font-black h-[28px] text-sm ${isAdvanceLocked ? 'bg-indigo-100/50 text-indigo-950 border-indigo-200 opacity-100 cursor-default disabled:opacity-100 disabled:text-indigo-950' : 'text-indigo-900 bg-white border-indigo-400 shadow-sm'}`} value={header.advance_percent} onChange={(e) => setHeader({...header, advance_percent: Number(e.target.value)})} />
                                    <span className="absolute right-1.5 top-1.5 font-bold text-indigo-900 text-[10px]">%</span>
                                </div>
                                <div className="text-right border-l border-indigo-200 pl-3 min-w-[80px]">
                                    <span className="text-sm font-mono font-black text-slate-800">{formatCurrency(advanceAmount)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {isDirector && (
                        <div className="col-span-12 md:col-span-4">
                            <div className="text-xs mb-1">&nbsp;</div> {/* Espaciador invisible */}
                            <div className="bg-amber-50 p-2 rounded-lg border border-amber-300 flex justify-between items-center shadow-sm h-[38px]">
                                <label className="text-[10px] font-black text-amber-900 uppercase flex items-center gap-1">
                                    <TrendingUp size={14}/> Sobreprecio objetivo %
                                </label>
                                <div className="relative">
                                    <Input 
                                        type="number" 
                                        min="1" 
                                        max="99"
                                        step="1"
                                        className="w-20 pr-5 text-right font-black h-[28px] text-sm bg-amber-100 text-amber-950 border-amber-400 opacity-100"
                                        value={Number(markupAsPercent(header.applied_margin_percent).toFixed(2))}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            if (val >= 1 && val <= 99) {
                                                setHeader(prev => ({ ...prev, applied_margin_percent: val }));
                                            }
                                        }}
                                    />
                                    <span className="absolute right-1.5 top-1.5 font-black text-amber-800 text-[10px]">%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* === 2. CAJAS DE TEXTO EXPANDIDAS === */}
            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">NOTAS ALCANCE</label>
                        <textarea 
                            disabled={isFormLocked} 
                            className={`w-full p-3 border rounded text-sm min-h-[160px] resize-y ${isFormLocked ? lockedInputClass : 'bg-white border-slate-300 shadow-inner'}`} 
                            value={header.notes} 
                            onChange={(e) => setHeader({...header, notes: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">CONDICIONES</label>
                        <textarea 
                            disabled={isFormLocked} 
                            className={`w-full p-3 border rounded text-sm min-h-[160px] resize-y ${isFormLocked ? lockedInputClass : 'bg-white border-slate-300 shadow-inner'}`} 
                            value={header.conditions} 
                            onChange={(e) => setHeader({...header, conditions: e.target.value})}
                        />
                    </div>
                </div>
            </Card>

            <div className="flex flex-col lg:flex-row gap-6">
                {!isFormLocked && (
                    <div className={`w-full lg:w-1/3 p-6 rounded-xl border ${editingIndex !== null ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                        <div className="space-y-4">
                            <div className="flex gap-2 mb-4">
                                <button type="button" onClick={() => { setAddMode('CATALOG'); }}
                                    className={`flex-1 px-3 py-2 text-xs font-bold rounded border ${addMode === 'CATALOG' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                    Catálogo
                                </button>
                                <button type="button" onClick={() => { setAddMode('MANUAL'); }}
                                    className={`flex-1 px-3 py-2 text-xs font-bold rounded border ${addMode === 'MANUAL' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                    Manual
                                </button>
                                <button type="button" onClick={() => { setAddMode('RESALE'); setSelectedResaleSku(''); setResaleSearch(''); }}
                                    className={`flex-1 px-3 py-2 text-xs font-bold rounded border ${addMode === 'RESALE' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                    Reventa
                                </button>
                            </div>

                            {addMode === 'CATALOG' && (
                                <>
                                    <div><label className="text-xs font-bold text-slate-500">CATEGORÍA</label><SearchableSelect items={(availableCategories ?? []).map(cat => ({ value: cat, label: cat }))} value={selectedCategory} onChange={(v) => { setSelectedCategory(v); setLineItem({...lineItem, master_id: 0, version_id: 0}); }} getLabel={(i) => i.label} getValue={(i) => i.value} placeholder="-- Seleccionar --" disabled={!header.client_id} className="text-sm" /></div>
                                    <div><label className="text-xs font-bold text-slate-500">PRODUCTO</label><SearchableSelect items={filteredMasters ?? []} value={lineItem.master_id ? String(lineItem.master_id) : ''} onChange={(v) => setLineItem({...lineItem, master_id: Number(v), version_id: 0})} getLabel={(m) => m.name} getValue={(m) => String(m.id)} placeholder="-- Seleccionar --" disabled={!selectedCategory} className="text-sm" /></div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500">VERSIÓN</label>
                                        <SearchableSelect
                                            items={availableVersions ?? []}
                                            value={lineItem.version_id ? String(lineItem.version_id) : ''}
                                            onChange={(v) => handleVersionChange({ target: { value: v } } as React.ChangeEvent<HTMLSelectElement>)}
                                            getLabel={(v: any) => v.version_name}
                                            getValue={(v: any) => String(v.id)}
                                            placeholder="-- Seleccionar --"
                                            disabled={!lineItem.master_id}
                                            className="text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500">DESCRIPCIÓN COMERCIAL</label>
                                        <p className="text-[10px] text-slate-400 mb-1">
                                            Se jala de la receta. Puedes modificarla para esta cotización.
                                        </p>
                                        <textarea
                                            value={lineItem.commercial_description}
                                            onChange={(e) => setLineItem({...lineItem, commercial_description: e.target.value})}
                                            disabled={lineItem.version_id === 0}
                                            placeholder="Descripción que verá el cliente en el PDF..."
                                            rows={3}
                                            className="w-full p-2 border rounded text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
                                        />
                                    </div>
                                </>
                            )}

                            {addMode === 'MANUAL' && (
                                <Input placeholder="Producto manual..." value={lineItem.manual_name} onChange={(e) => setLineItem({...lineItem, manual_name: e.target.value})}/>
                            )}

                            {addMode === 'RESALE' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-500">BUSCAR ACCESORIO</label>
                                    <Input
                                        type="text"
                                        className="w-full p-2 border rounded text-sm mb-2 h-auto"
                                        placeholder="Escribe para filtrar (ej. Tarja, Monomando)..."
                                        value={resaleSearch}
                                        onChange={(e) => setResaleSearch(e.target.value)}
                                    />
                                    <div className="w-full max-h-64 overflow-y-auto border rounded divide-y">
                                        {resaleList
                                            .filter((m) => {
                                                const q = resaleSearch.trim().toLowerCase();
                                                if (!q) return true;
                                                return (m.name || '').toLowerCase().includes(q)
                                                    || (m.sku || '').toLowerCase().includes(q);
                                            })
                                            .map((m) => (
                                                <button
                                                    key={m.sku}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedResaleSku(m.sku);
                                                        const costo = Number(m.current_cost) || 0;
                                                        // sale_price del catálogo es el precio antes de comisión: se suma la comisión del vendedor
                                                    const override = priceFromMarkup(Number(m.sale_price) || 0, 0, commissionRate);
                                                        let precio = override;
                                                        if (precio <= 0) {
                                                            // Reventa: misma regla que producción (incluye comisión)
                                                            precio = Number(priceFromMarkup(costo, markupAsPercent(header.applied_margin_percent), commissionRate).toFixed(2));
                                                        }
                                                        setLineItem({ ...lineItem, manual_name: m.name, unit_price: precio, frozen_cost: costo });
                                                    }}
                                                    className={`w-full text-left p-2 text-sm transition-colors ${
                                                        selectedResaleSku === m.sku
                                                            ? 'bg-emerald-100 text-emerald-800 font-bold'
                                                            : 'bg-white text-slate-700 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {m.name} — {m.sku}
                                                </button>
                                            ))}
                                        {resaleList.filter((m) => {
                                            const q = resaleSearch.trim().toLowerCase();
                                            if (!q) return true;
                                            return (m.name || '').toLowerCase().includes(q) || (m.sku || '').toLowerCase().includes(q);
                                        }).length === 0 && (
                                            <p className="p-4 text-xs text-slate-400 italic text-center">Sin coincidencias</p>
                                        )}
                                    </div>
                                    {selectedResaleSku && (() => {
                                        const sel = resaleList.find((m) => m.sku === selectedResaleSku);
                                        if (!sel) return null;
                                        return (
                                            <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs">
                                                <span className="font-bold text-emerald-700">Seleccionado: </span>
                                                <span className="text-slate-700">{sel.name} — {sel.sku}</span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <Input type="number" placeholder="Cant" value={lineItem.quantity} onChange={(e) => setLineItem({...lineItem, quantity: Number(e.target.value)})}/>
                                <div className="relative">
                                    {(addMode === 'CATALOG' && !isDirector) ? (
                                        <div className="w-full px-3 py-2 border border-slate-200 rounded-md bg-slate-100 font-mono text-right font-bold text-slate-700 flex items-center justify-end cursor-not-allowed h-[38px]">{formatCurrency(lineItem.unit_price)}</div>
                                    ) : (
                                        <div className="relative mb-4">
                                            <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                                            <Input type="number" step="0.01" className="pl-7 font-mono text-right font-bold" value={lineItem.unit_price === 0 ? '' : lineItem.unit_price} onChange={(e) => setLineItem({...lineItem, unit_price: Number(e.target.value)})}/>
                                            <div className="absolute -bottom-5 right-0 text-[11px] font-bold text-indigo-600 font-mono">{formatCurrency(lineItem.unit_price)}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button className="flex-1" onClick={handleAddItem}>{editingIndex !== null ? 'Actualizar' : 'Agregar'}</Button>
                                {editingIndex !== null && <Button variant="secondary" onClick={handleCancelEdit}><X size={16}/></Button>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-x-auto min-h-[300px] p-0">
                        <VTable
                            columns={quoteItemColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                            data={items as unknown as Record<string, unknown>[]}
                            emptyState={{ title: 'Sin partidas en la cotización.' }}
                            className="text-sm whitespace-nowrap"
                            actions={!isFormLocked ? (row) => {
                                const idx = items.indexOf(row as SalesOrderItem);
                                return [
                                    {
                                        label: '',
                                        icon: <Pencil size={14} />,
                                        onClick: () => handleEditItem(idx),
                                    },
                                    {
                                        label: '',
                                        icon: <Trash2 size={14} />,
                                        variant: 'danger' as const,
                                        onClick: () => handleRemoveItem((row as SalesOrderItem).id),
                                    },
                                ];
                            } : undefined}
                        />
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-200 text-right space-y-2">
                        {isDirector && (
                            <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4 text-xs shadow-sm">
                                <div className="font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center justify-end gap-2"><Lock size={10}/> Análisis de Rentabilidad Total (Privado)</div>
                                <div className="grid grid-cols-4 gap-4 text-right">
                                    <div><div className="text-slate-500">Costo</div><div className="font-mono font-bold text-slate-700">{formatCurrency(totalCost)}</div></div>
                                    <div><div className="text-slate-500">Sobreprecio real %</div><div className={`font-mono font-black ${isBelowMinimum(realMarkup, minMarkup) ? 'text-red-600' : 'text-emerald-600'}`}>{formatPercent(realMarkup)}</div></div>
                                    <div><div className="text-slate-500">Utilidad neta (después de comisión)</div><div className={`font-mono font-bold ${grossProfit > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(grossProfit)}</div></div>
                                    <div><div className="text-slate-500">Margen neto % sobre venta</div><div className="font-mono font-black text-slate-700">{formatPercent(marginPercent)}</div></div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-end gap-8 mt-2">
                            {/* IZQUIERDA: Comisión informativa (ya incluida en los precios) */}
                            <div className="flex-1">
                                {commissionRate === 0 ? (
                                    <div className="inline-flex items-center gap-2 text-sm p-2 rounded bg-red-50 text-red-700 animate-pulse">
                                        <span className="flex items-center gap-2 font-bold"><Wallet size={16}/> ⚠️ 0% (SIN COMISIÓN)</span>
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 text-sm p-2 rounded bg-green-50 text-emerald-700">
                                        <span className="flex items-center gap-2 font-bold"><Wallet size={16}/> Comisión Vendedor incluida ({(commissionRate * 100).toFixed(1)}%):</span>
                                        <span className="font-mono font-bold">{formatCurrency(commissionAmount)}</span>
                                    </div>
                                )}
                            </div>
                            {/* DERECHA: Subtotal → IVA → Total (esta es la única suma que cuenta) */}
                            <div className="min-w-[280px] space-y-1">
                                <div className="flex justify-end gap-12 text-sm text-slate-700 font-bold"><span>Subtotal:</span> <span className="font-mono">{formatCurrency(finalSubtotal)}</span></div>
                                <div className="flex justify-end gap-12 text-sm text-slate-500"><span>IVA:</span> <span className="font-mono">{formatCurrency(taxAmount)}</span></div>
                                <div className="flex justify-end gap-12 text-xl font-black text-slate-800 border-t pt-2"><span>Total:</span> <span className="font-mono">{formatCurrency(total)}</span></div>
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-4 mt-4">
                            {isDirector && !readOnly && (
                                <Button 
                                    variant="outline"
                                    className="border-amber-300 text-amber-700 hover:bg-amber-50 font-black text-xs"
                                    onClick={handleRecalculatePrices}
                                    disabled={saving || items.length === 0}
                                >
                                    <TrendingUp size={16} className="mr-2"/> Recalcular Precios
                                </Button>
                            )}
                            {!isFormLocked && (
                                <Button variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50" onClick={() => handleSubmit(true)} disabled={saving}><CheckCircle2 size={18} className="mr-2"/> Guardar y solicitar autorización</Button>
                            )}
                            {!isFormLocked && (
                                <Button className="w-48 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleSubmit()} disabled={saving}>{saving ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Guardar Borrador')} <Save size={18} className="ml-2"/></Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            <VConfirmDialog
                isOpen={showRecalculateConfirm}
                title="Recalcular precios"
                message={`¿Recalcular TODOS los precios usando un margen del ${header.applied_margin_percent}% y comisión del ${(commissionRate * 100).toFixed(1)}%?`}
                consequence="Esto sobrescribirá los precios manuales de todas las partidas con costo congelado."
                variant="default"
                confirmLabel="Sí, recalcular"
                onConfirm={() => {
                    executeRecalculatePrices();
                    setShowRecalculateConfirm(false);
                }}
                onCancel={() => setShowRecalculateConfirm(false)}
            />
        </div>
    );
};

export default CreateQuotePage;