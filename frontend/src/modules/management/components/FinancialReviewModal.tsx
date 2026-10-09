import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
    X, XCircle, Calculator, 
    AlertTriangle, ChevronDown, ChevronRight, Layers, DollarSign, RefreshCcw, FileCheck, Lock, Percent, User 
} from 'lucide-react';

import { salesService } from '../../../api/sales-service';
import { quotationService, QUOTATION_STATUS_LABELS } from '../../../api/quotation-service';
import { SalesOrder } from '../../../types/sales';
import type { Quotation } from '../../../types/quotations';
import { QuotationActionDialogs, canAuthorizeQuotations } from '../../sales/components/QuotationActions';
import { useFoundations } from '../../foundations/hooks/useFoundations';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import axiosClient from '../../../api/axios-client';
import { RecipeCorrectionPanel, type CatalogMaterial, type RecipeLine } from './RecipeCorrectionPanel';
import {
    DEFAULT_MIN_MARKUP, formatPercent, includedCommission, isBelowMinimum, markupPercent, netMarginPercent, priceFromMarkup,
} from '../../sales/utils/margins';

interface FinancialReviewModalProps {
    /** Sales order: always read-only (prices are decided when the quotation is authorized). */
    orderId?: number | null;
    /** Quotation under review: the Director authorizes it or returns it with a reason. */
    quotationId?: number | null;
    onClose: () => void;
    onOrderUpdated?: () => void;
    readOnly?: boolean; // <-- NUEVO: Forzar modo solo lectura desde afuera
}

interface CostIngredient {
    material_id?: number;
    name: string;
    qty_recipe: number;
    frozen_unit_cost: number;
}

const snapshotLines = (item: any): RecipeLine[] =>
    ((item?.cost_snapshot?.ingredients ?? []) as CostIngredient[])
        .filter((ing) => ing.material_id)
        .map((ing) => ({ material_id: Number(ing.material_id), quantity: Number(ing.qty_recipe) || 0 }));

export const FinancialReviewModal: React.FC<FinancialReviewModalProps> = ({ orderId, quotationId, onClose, onOrderUpdated, readOnly = false }) => {
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [order, setOrder] = useState<SalesOrder | null>(null);
    const [quotation, setQuotation] = useState<Quotation | null>(null);
    const [pendingConfirm, setPendingConfirm] = useState<'AUTHORIZE' | null>(null);
    const [returning, setReturning] = useState(false);

    // Catálogo de tasas de impuesto (misma fuente que CreateQuotePage) para leer la tasa REAL
    // de la cotización y respetar tasa cero (sin fallback hardcodeado a 0.16).
    const foundationHook = useFoundations();
    const taxRates = foundationHook?.taxRates || [];
    const minMarkup = Number(foundationHook?.config?.min_markup_percent ?? DEFAULT_MIN_MARKUP);

    // --- VARIABLES DE NEGOCIO ---
    const [globalMargin, setGlobalMargin] = useState<number>(0); 
    const [commissionPercent, setCommissionPercent] = useState<number>(0);
    const [itemMargins, setItemMargins] = useState<number[]>([]);
    // Precio exacto fijado por el usuario (override). Si no es null para un índice, ese precio
    // manda sobre el margen y NO se recalcula con Math.ceil.
    const [itemPriceOverrides, setItemPriceOverrides] = useState<(number | null)[]>([]);
    // Fuente de verdad del anticipo: el IMPORTE real. El % se DERIVA de él y del total.
    const [advanceAmount, setAdvanceAmount] = useState<number>(0);
    // Recuerda cómo ajustó el Director el anticipo por última vez:
    // 'amount' = fijó el importe (se respeta el importe si cambia el total)
    // 'percent' = fijó el %   (se respeta el % si cambia el total)
    const [advanceMode, setAdvanceMode] = useState<'amount' | 'percent'>('percent');
    // Guarda el % objetivo cuando el modo es 'percent', para reaplicarlo si cambia el total.
    const advanceTargetPercent = useRef<number>(60);

    // --- UI STATE ---
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
    // Edición temporal SOLO del campo de precio enfocado, para que el input no "pelee" con
    // el value recalculado (Math.ceil) mientras se escribe. itemMargins sigue siendo la
    // fuente de verdad; al hacer blur el precio vuelve al valor canónico del useMemo.
    const [editingPrice, setEditingPrice] = useState<{ index: number; value: string } | null>(null);

    // --- CORRECCIÓN DE RECETAS Y PRECIOS (solo Dirección, cotización en revisión) ---
    const [catalog, setCatalog] = useState<Map<number, CatalogMaterial>>(new Map());
    const [recipeEdits, setRecipeEdits] = useState<Record<number, RecipeLine[]>>({});
    const [recipeReasons, setRecipeReasons] = useState<Record<number, string>>({});
    const [priceEdits, setPriceEdits] = useState<Record<number, number>>({});
    const [manualCosts, setManualCosts] = useState<Record<number, number>>({});

    // --- MODO SOLO LECTURA ---
    // Será true si se forzó desde afuera (readOnly === true) O si el estatus de la orden ya no es borrador/pendiente.
    const isReadOnly = useMemo(() => {
        if (readOnly) return true; // Forzado externamente
        if (!quotation) return true; // Sales orders are only audited here
        return quotation.status !== 'PENDING_AUTH' || !canAuthorizeQuotations();
    }, [quotation, readOnly]);

    useEffect(() => {
        if (isReadOnly) return;
        axiosClient.get('/foundations/materials')
            .then((res) => setCatalog(new Map((Array.isArray(res.data) ? res.data : []).map((m: CatalogMaterial) => [m.id, m]))))
            .catch(() => toast.error('No se pudo cargar el catálogo de materiales.'));
    }, [isReadOnly]);

    const linesOf = (item: any): RecipeLine[] => recipeEdits[item.origin_version_id] ?? snapshotLines(item);
    const isTouched = (item: any): boolean => Boolean(item?.origin_version_id) && (
        recipeEdits[item.origin_version_id] !== undefined || linesOf(item).some((l) => priceEdits[l.material_id] !== undefined));

    /** Cost per unit of a line: frozen cost, or recomputed with the Director's corrections (single rule: exact). */
    const costOf = (item: any, index: number): number => {
        if (!item?.origin_version_id) return manualCosts[index] ?? (Number(item?.frozen_unit_cost) || 0);
        if (!isTouched(item)) return Number(item.frozen_unit_cost) || 0;
        return linesOf(item).reduce((sum, l) => {
            const material = catalog.get(l.material_id);
            const factor = Number(material?.conversion_factor) > 0 ? Number(material?.conversion_factor) : 1;
            const purchase = priceEdits[l.material_id] ?? Number(material?.current_cost ?? 0);
            return sum + l.quantity * (purchase / factor);
        }, 0);
    };

    // Extraer el nombre del asesor
    const sellerName = useMemo(() => {
        if (!order) return 'Sin Asignar';
        const oAny = order as any;
        return oAny.user?.full_name || oAny.user?.username || (order.user_id ? `Asesor #${order.user_id}` : 'Sin Asignar');
    }, [order]);

    useEffect(() => {
        if (quotationId) void loadOrderData(quotationId, true);
        else if (orderId) void loadOrderData(orderId, false);
    }, [orderId, quotationId]);

    const loadOrderData = async (id: number, isQuotation: boolean) => {
        setLoading(true);
        try {
            let data: SalesOrder;
            if (isQuotation) {
                const q = await quotationService.getQuotation(id);
                setQuotation(q);
                // Same shape for the simulation (items, commission, tax rate, advance).
                data = q as unknown as SalesOrder;
            } else {
                data = await salesService.getOrderDetail(id);
            }
            setOrder(data);
            
            // Saneamiento de números para evitar que la UI se congele
            let loadedCommission = Number(data.applied_commission_percent) || 0;
            if (loadedCommission > 0 && loadedCommission < 1) {
                loadedCommission = loadedCommission * 100;
            }
            
            setCommissionPercent(Number(loadedCommission.toFixed(2)));
            // El importe del anticipo se inicializa vía useEffect cuando simulation esté listo.

            const itemsSeguros = data.items || [];
            
            const calculatedMargins = itemsSeguros.map(item => {
                const cost = Number(item.frozen_unit_cost) || 0;
                const price = Number(item.unit_price) || 0;

                if (cost === 0 || price === 0) return 40; 
                // El unit_price guardado YA incluye la comisión. Para obtener el margen REAL
                // primero le quitamos la comisión, luego derivamos el margen sobre el costo.
                // Así el slider de margen arranca en el margen puro (ej. 40%), no mezclado (54%).
                const commFraction = loadedCommission / 100; // loadedCommission ya está en %
                const priceSinComision = price * (1 - commFraction);
                const impliedMargin = cost > 0 ? ((priceSinComision / cost) - 1) * 100 : 40;
                return Number(impliedMargin.toFixed(2)) || 0;
            });

            setItemMargins(calculatedMargins);
            setItemPriceOverrides(itemsSeguros.map(item => Number(item.unit_price) || null));

            let totalCost = 0;
            let totalBasePrice = 0;
            
            itemsSeguros.forEach((item, i) => {
                const qty = Number(item.quantity) || 1;
                const cost = Number(item.frozen_unit_cost) || 0;
                const margin = Number(calculatedMargins[i]) || 0;
                const price = cost * (1 + (margin / 100));

                totalCost += (cost * qty);
                totalBasePrice += (price * qty);
            });

            const initialWeightedMargin = totalCost > 0 
                ? ((totalBasePrice - totalCost) / totalCost) * 100
                : 0;

            setGlobalMargin(Number(initialWeightedMargin.toFixed(2)) || 0);

        } catch {
            toast.error('No se pudo cargar la información.');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLERS GLOBALES (Protegidos contra NaN) ---
    const handleGlobalMarginChange = (val: number) => {
        if (isReadOnly) return;
        const safeVal = isNaN(val) ? 0 : val;
        setGlobalMargin(safeVal);
        
        if (order && order.items) {
            const newMargins = new Array(order.items.length).fill(safeVal);
            setItemMargins(newMargins);
            // Limpiar overrides para que los precios se recalculen desde el nuevo margen
            setItemPriceOverrides(new Array(order.items.length).fill(null));
        }
    };

    const handleItemMarginChange = (index: number, val: number) => {
        if (isReadOnly || !order || !order.items) return;
        const safeVal = isNaN(val) ? 0 : val;
        const newMargins = [...itemMargins];
        newMargins[index] = safeVal;
        setItemMargins(newMargins);

        // Al editar el margen, el margen vuelve a dominar: limpiamos el override de precio
        // de ese índice para que el precio se recalcule desde el margen.
        const clearedOverrides = [...itemPriceOverrides];
        clearedOverrides[index] = null;
        setItemPriceOverrides(clearedOverrides);

        let totalCost = 0;
        let totalBasePrice = 0;

        order.items.forEach((item, i) => {
            const qty = Number(item.quantity) || 1;
            const cost = costOf(item, i);
            const margin = Number(newMargins[i]) || 0; 
            const price = cost * (1 + (margin / 100));

            totalCost += (cost * qty);
            totalBasePrice += (price * qty);
        });

        const weightedAvg = totalCost > 0 ? ((totalBasePrice - totalCost) / totalCost) * 100 : 0;
        setGlobalMargin(Number(weightedAvg.toFixed(2)) || 0);
    };

    // Editar el PRECIO DE VENTA (con comisión incluida) de una instancia: se traduce a
    // MARGEN y se guarda en itemMargins[] (única fuente de verdad). Se le quita la comisión
    // antes de derivar el margen, para no duplicarla (la simulación la vuelve a aplicar).
    const handleItemPriceChange = (index: number, val: number) => {
        if (isReadOnly || !order || !order.items) return;
        const precio = isNaN(val) ? 0 : val;
        const item = order.items[index];
        const cost = costOf(item, index);
        const commPercent = Number(commissionPercent) || 0;
        const precioSinComision = precio * (1 - commPercent / 100);
        const nuevoMargen = cost > 0 ? ((precioSinComision / cost) - 1) * 100 : 0;

        const newMargins = [...itemMargins];
        newMargins[index] = Number(nuevoMargen.toFixed(2));
        setItemMargins(newMargins);

        // Recalcular el margen global ponderado (igual que en handleItemMarginChange).
        let totalCost = 0;
        let totalBasePrice = 0;

        order.items.forEach((it, i) => {
            const qty = Number(it.quantity) || 1;
            const c = costOf(it, i);
            const margin = Number(newMargins[i]) || 0;
            const price = c * (1 + (margin / 100));

            totalCost += (c * qty);
            totalBasePrice += (price * qty);
        });

        const weightedAvg = totalCost > 0 ? ((totalBasePrice - totalCost) / totalCost) * 100 : 0;
        setGlobalMargin(Number(weightedAvg.toFixed(2)) || 0);

        // El precio domina: guardamos el precio exacto fijado por el usuario para que la
        // simulación lo respete al centavo (sin recalcular desde el margen con Math.ceil).
        const newOverrides = [...itemPriceOverrides];
        newOverrides[index] = precio;
        setItemPriceOverrides(newOverrides);
    };

    // --- MOTOR DE SIMULACIÓN (Protegido contra cálculos corruptos) ---
    const simulation = useMemo(() => {
        if (!order) return null;

        let totalBaseCost = 0;   
        let sumOfItems = 0;    
        
        const itemsToSimulate = order.items || [];

        const simulatedItems = itemsToSimulate.map((item, index) => {
            const qty = Number(item.quantity) || 1;
            const cost = costOf(item, index);
            totalBaseCost += (cost * qty);
            
            const specificMargin = Number(itemMargins[index]) || 0;
            const commPercent = Number(commissionPercent) || 0;

            const marginMultiplier = 1 + (specificMargin / 100);

            // Precio base (sin comisión) solo como referencia visual.
            const baseUnitPrice = cost * marginMultiplier;
            // Si el usuario fijó un precio exacto (override), ese precio manda al centavo.
            // Si no, se calcula desde el margen con Math.ceil (idéntico a CreateQuotePage).
            const override = itemPriceOverrides[index];
            const finalUnitPrice = (override != null && !isNaN(override))
                ? override
                : Number(priceFromMarkup(cost, specificMargin, commPercent).toFixed(2));

            // El subtotal suma el precio CON comisión incluida (no se vuelve a sumar aparte).
            sumOfItems += (finalUnitPrice * qty);

            return {
                ...item,
                effectiveCost: cost,
                usedMargin: specificMargin,
                baseUnitPrice: baseUnitPrice, 
                newUnitPrice: finalUnitPrice,
            };
        });

        // Regla de negocio: precio = costo × (1 + sobreprecio) ÷ (1 − c); el vendedor cobra c × venta sin IVA.
        // La comisión va DENTRO del precio; aquí solo se muestra (no se vuelve a sumar).
        const commPercent = Number(commissionPercent) || 0;
        const commissionAmount = includedCommission(sumOfItems, commPercent);
        const subtotal = sumOfItems; // la comisión NO se vuelve a sumar
        
        // Tasa REAL de la cotización desde el catálogo (rate es fracción: 0.16, 0, etc.).
        // Sin fallback a 0.16: si no se resuelve la tasa, es 0 (tasa cero → IVA $0).
        const selectedTaxRate = taxRates.find(t => t.id === order.tax_rate_id);
        const taxRate = selectedTaxRate ? Number(selectedTaxRate.rate) : 0;

        const taxAmount = subtotal * taxRate;
        const total = subtotal + taxAmount;

        const netUtility = subtotal - commissionAmount - totalBaseCost;
        // Sobreprecio real (sin comisión) con el costo actual y margen neto sobre venta (después de comisión)
        const realWeightedMargin = markupPercent(sumOfItems, totalBaseCost, commPercent) ?? 0;
        const netMargin = netMarginPercent(subtotal, totalBaseCost, commissionAmount);

        return {
            totalBaseCost, sumOfItems, commissionAmount, subtotal,
            taxAmount, total, netUtility, realWeightedMargin, netMargin, simulatedItems
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order, itemMargins, itemPriceOverrides, commissionPercent, taxRates, recipeEdits, priceEdits, manualCosts, catalog]);

    // --- ANTICIPO: el IMPORTE es la fuente de verdad; el % se DERIVA de él y del total ---
    const advanceTotal = simulation?.total ?? 0;
    const advancePercentDerived = advanceTotal > 0
        ? (advanceAmount / advanceTotal) * 100
        : 0;

    // El Director escribe el IMPORTE → modo 'amount' (el importe manda).
    const handleAdvanceAmountChange = (valorTexto: string) => {
        if (isReadOnly) return;
        setAdvanceMode('amount');
        const nuevo = Number(valorTexto);
        if (isNaN(nuevo)) { setAdvanceAmount(0); return; }
        const max = advanceTotal > 0 ? advanceTotal : nuevo;
        const clamped = Math.max(0, Math.min(nuevo, max));
        setAdvanceAmount(clamped);
        // mantener el target % coherente por si luego el usuario cambia a modo percent
        advanceTargetPercent.current = advanceTotal > 0 ? (clamped / advanceTotal) * 100 : 0;
    };

    // El Director mueve el % (slider o input) → modo 'percent' (el % manda).
    const handleAdvancePercentChange = (nuevoPercent: number) => {
        if (isReadOnly) return;
        setAdvanceMode('percent');
        const p = Math.max(0, Math.min(100, Number(nuevoPercent) || 0));
        advanceTargetPercent.current = p;
        setAdvanceAmount(Number(((advanceTotal * p) / 100).toFixed(2)));
    };

    // Hidratación del importe inicial una sola vez, cuando simulation ya tenga total.
    const advanceInitialized = useRef(false);
    useEffect(() => {
        if (!order || !simulation) return;
        if (advanceInitialized.current) return;
        const savedAmount = Number(order.advance_invoice_amount);
        if (!isNaN(savedAmount) && savedAmount > 0) {
            setAdvanceAmount(Number(savedAmount.toFixed(2)));
            advanceTargetPercent.current = simulation.total > 0
                ? (savedAmount / simulation.total) * 100 : 0;
            setAdvanceMode('amount'); // había un importe guardado explícito
        } else {
            const savedPercent = Number(order.advance_percent) || 60;
            advanceTargetPercent.current = savedPercent;
            setAdvanceAmount(Number(((simulation.total * savedPercent) / 100).toFixed(2)));
            setAdvanceMode('percent'); // por defecto, anclado al %
        }
        advanceInitialized.current = true;
    }, [order, simulation]);

    // Cuando cambia el total (por precios/márgenes/comisión), reajusta el anticipo
    // según la última intención del Director:
    //  - modo 'percent': recalcula el importe para mantener el % objetivo.
    //  - modo 'amount' : deja el importe fijo, pero lo limita al nuevo total (clamp).
    useEffect(() => {
        if (!simulation) return;
        if (!advanceInitialized.current) return; // no interferir con la hidratación inicial
        if (advanceMode === 'percent') {
            const p = advanceTargetPercent.current;
            setAdvanceAmount(Number(((advanceTotal * p) / 100).toFixed(2)));
        } else {
            // modo amount: mantener importe, pero no exceder el nuevo total
            setAdvanceAmount(prev => Math.min(prev, advanceTotal > 0 ? advanceTotal : prev));
        }
        // Depende SOLO del total; no incluir advanceMode ni el target para no
        // disparar en cambios de modo (esos ya los maneja cada handler).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [advanceTotal]);


    // --- ACCIONES PRINCIPALES ---
    const toggleExpand = (index: number) => {
        // Permitimos expandir la receta incluso si es modo Solo Lectura
        const newSet = new Set(expandedItems);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setExpandedItems(newSet);
    };

    /** Margin shown for a line: the one implied by its price and current cost (price is kept when cost changes). */
    const displayMargin = (item: any, index: number): number => {
        const cost = Number(item.effectiveCost ?? costOf(item, index)) || 0;
        const price = Number(item.newUnitPrice) || 0;
        if (cost <= 0 || price <= 0) return Number(itemMargins[index]) || 0;
        return Number((markupPercent(price, cost, Number(commissionPercent) || 0) ?? 0).toFixed(2));
    };

    const handleAuthorize = async () => {
        if (!order || !simulation || isReadOnly) return;
        if (taxRates.length === 0) {
            toast.warning('Aún se está cargando la configuración de impuestos. Intenta de nuevo en un momento.');
            return;
        }
        setPendingConfirm('AUTHORIZE');
    };

    /** Corrections to send: recipes edited and purchase prices changed, each with the reason of its line. */
    const buildCorrections = (): { recipe_corrections: any[]; material_prices: any[] } | null => {
        const items = order?.items ?? [];
        const reasonForMaterial = (materialId: number) => {
            const item = items.find((it: any) => it.origin_version_id && linesOf(it).some((l) => l.material_id === materialId));
            return item ? (recipeReasons[item.origin_version_id as number] || '').trim() : '';
        };
        const recipe_corrections = Object.entries(recipeEdits).map(([versionId, lines]) => ({
            origin_version_id: Number(versionId),
            components: lines.filter((l) => l.quantity > 0),
            reason: (recipeReasons[Number(versionId)] || '').trim(),
        }));
        const material_prices = Object.entries(priceEdits)
            .filter(([materialId, cost]) => Number(catalog.get(Number(materialId))?.current_cost ?? -1) !== cost)
            .map(([materialId, cost]) => ({ material_id: Number(materialId), current_cost: cost, reason: reasonForMaterial(Number(materialId)) }));
        if ([...recipe_corrections, ...material_prices].some((c) => !c.reason)) return null;
        if (recipe_corrections.some((c) => c.components.length === 0)) return null;
        return { recipe_corrections, material_prices };
    };

    const executeAuthorize = async () => {
        if (!order || !quotation || !simulation || isReadOnly) return;
        const corrections = buildCorrections();
        if (!corrections) {
            toast.warning('Cada receta corregida o precio cambiado necesita motivo, y la receta al menos un material.');
            setPendingConfirm(null);
            return;
        }

        setProcessing(true);
        try {
            const updatedItems = simulation.simulatedItems.map(i => ({
                product_name: i.product_name,
                origin_version_id: i.origin_version_id,
                quantity: Number(i.quantity) || 1,
                unit_price: Number(i.newUnitPrice.toFixed(2)),
                frozen_unit_cost: Number(i.effectiveCost.toFixed(4)) || 0,
                cost_snapshot: i.cost_snapshot,
                // Keep line text and resale data: authorizing must not erase them.
                commercial_description: i.commercial_description,
                is_resale: Boolean(i.is_resale),
                resale_sku: i.resale_sku ?? null,
            }));

            await quotationService.authorize(quotation.id, {
                applied_margin_percent: Number(simulation.realWeightedMargin.toFixed(2)),
                applied_commission_percent: Number(commissionPercent) || 0,
                advance_percent: Number(advancePercentDerived.toFixed(2)),
                advance_invoice_amount: Number(advanceAmount.toFixed(2)),
                items: updatedItems.map((i) => ({ ...i, origin_version_id: i.origin_version_id ?? null })),
                ...corrections,
            });
            toast.success(`${quotation.folio} autorizada.`);

            if(onOrderUpdated) onOrderUpdated();
            onClose();
        } catch (error: any) {
            toast.error(error?.response?.data?.detail || 'Error al autorizar.');
        } finally {
            setProcessing(false);
            setPendingConfirm(null);
        }
    };

    const handleReject = () => {
        if (!quotation || isReadOnly) return;
        setReturning(true);
    };

    const formatCurrency = (amount: number) => {
        const safeAmount = Number(amount) || 0;
        return safeAmount.toLocaleString('es-MX', {
            style: 'currency', currency: 'MXN',
            minimumFractionDigits: 2, maximumFractionDigits: 2
        });
    };

    const ingredientColumns = useMemo((): VTableColumn<CostIngredient>[] => [
        {
            key: 'name',
            label: 'Concepto',
            width: '40%',
            render: (ing) => <span className="text-slate-600 font-medium">{ing.name}</span>,
        },
        {
            key: 'qty_recipe',
            label: 'Cant.',
            render: (ing) => <span className="text-center text-slate-500 block">{ing.qty_recipe}</span>,
        },
        {
            key: 'frozen_unit_cost',
            label: 'Costo Unit.',
            render: (ing) => <span className="text-right font-mono text-slate-400 block">{formatCurrency(ing.frozen_unit_cost)}</span>,
        },
        {
            key: 'importe',
            label: 'Importe',
            render: (ing) => (
                <span className="text-right font-mono font-bold text-slate-700 bg-slate-50 block">
                    {formatCurrency(ing.frozen_unit_cost * ing.qty_recipe)}
                </span>
            ),
        },
    ], []);

    if (!orderId && !quotationId) return null;

    if (loading || !order || !simulation || taxRates.length === 0) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-opacity">
                <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-600 font-bold tracking-tight">Cargando mesa financiera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-7xl h-[88vh] max-h-[88vh] flex flex-col overflow-hidden relative border border-slate-700">
                
                {/* HEADER */}
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Calculator size={20} className="text-emerald-400"/> 
                            Ingeniería Financiera
                            {isReadOnly && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded ml-2 flex items-center gap-1"><Lock size={10}/> SOLO LECTURA</span>}
                        </h2>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                            <span>Folio {quotation ? quotation.folio : `OV-${String(order?.id ?? '').padStart(4, '0')}`} • Proyecto: <span className="text-white font-medium">{order?.project_name}</span></span>
                            <span className="text-slate-500">|</span>
                            <span className="flex items-center gap-1"><User size={12} className="text-indigo-400"/> Asesor: <span className="text-indigo-300 font-medium">{sellerName}</span></span>
                        </p>
                    </div>
                    <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    
                    {/* COLUMNA IZQUIERDA: DETALLE TÉCNICO */}
                    <div className="flex-1 overflow-y-auto p-4 border-r border-slate-200 bg-white">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                <Layers size={14}/> Partidas ({order?.items?.length || 0})
                            </h3>
                        </div>
                        
                        <div className="space-y-3">
                            {simulation.simulatedItems.map((item, index) => (
                                <div key={index} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                    <div className={`flex items-center p-3 gap-2 ${expandedItems.has(index) ? 'bg-slate-50 border-b border-slate-200' : ''}`}>
                                        
                                        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                                            <button onClick={() => toggleExpand(index)} className="text-slate-400 hover:text-indigo-600">
                                                {expandedItems.has(index) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                            </button>
                                            <div>
                                                <div className="font-bold text-slate-700 text-sm truncate w-full max-w-[200px]" title={item.product_name}>
                                                    {item.product_name}
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                    Cant: {item.quantity}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center px-2 border-l border-slate-100">
                                            <label className="text-[9px] font-bold text-slate-400 mb-1" title="(precio sin comisión − costo) / costo">SOBREPRECIO %</label>
                                            <div className="relative w-20">
                                                <Input 
                                                    type="number" 
                                                    step="0.01" 
                                                    disabled={isReadOnly || processing}
                                                    value={displayMargin(item, index)}
                                                    onChange={(e) => handleItemMarginChange(index, parseFloat(e.target.value))}
                                                    className={`w-full text-center font-bold text-sm py-1 focus-visible:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 ${
                                                        isBelowMinimum(displayMargin(item, index), minMarkup) ? 'text-red-600 bg-red-50 border-red-300' : 'text-indigo-700 border-indigo-200'
                                                    }`}
                                                />
                                            </div>
                                        </div>

                                        <div className="w-24 text-center hidden md:block border-l border-r border-slate-100 mx-2">
                                            <div className="text-[9px] text-slate-400 uppercase">Costo Unit.</div>
                                            <div className="font-mono font-bold text-slate-800 text-sm">
                                                {formatCurrency(item.effectiveCost)}
                                                {item.effectiveCost !== Number(item.frozen_unit_cost) && (
                                                    <div className="text-[9px] text-amber-600 line-through">{formatCurrency(Number(item.frozen_unit_cost))}</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center px-2 border-l border-slate-100 w-28">
                                            <label className="text-[9px] font-bold text-slate-400 mb-1 uppercase">P. Venta</label>
                                            <div className="relative w-24">
                                                <Input
                                                    type="text"
                                                    disabled={isReadOnly || processing}
                                                    value={editingPrice?.index === index ? editingPrice.value : formatCurrency(item.newUnitPrice)}
                                                    onFocus={() => setEditingPrice({ index, value: String(item.newUnitPrice) })}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setEditingPrice({ index, value: raw });
                                                        const numeric = parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
                                                        handleItemPriceChange(index, numeric);
                                                    }}
                                                    onBlur={() => setEditingPrice(null)}
                                                    className="w-full text-center font-mono font-bold text-sm py-1 focus-visible:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 text-emerald-700 border-emerald-200"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {expandedItems.has(index) && (
                                        <div className="bg-slate-50 p-3 shadow-inner text-xs">
                                            {(item as any).recipe_obsolete && (
                                                <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                                                    Receta corregida después de cotizar{(item as any).replacement_version_name ? `: la reemplaza ${(item as any).replacement_version_name}` : ''}.
                                                </div>
                                            )}
                                            {!isReadOnly && item.origin_version_id ? (
                                                <RecipeCorrectionPanel
                                                    lines={linesOf(item)}
                                                    catalog={catalog}
                                                    prices={priceEdits}
                                                    reason={recipeReasons[item.origin_version_id] ?? ''}
                                                    corrected={isTouched(item)}
                                                    onLinesChange={(lines) => setRecipeEdits((prev) => ({ ...prev, [item.origin_version_id as number]: lines }))}
                                                    onPriceChange={(materialId, cost) => setPriceEdits((prev) => ({ ...prev, [materialId]: cost }))}
                                                    onReasonChange={(text) => setRecipeReasons((prev) => ({ ...prev, [item.origin_version_id as number]: text }))}
                                                />
                                            ) : !isReadOnly && !item.origin_version_id ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-500">Partida sin receta: costo capturado por unidad</span>
                                                    <Input type="number" step="0.01" min={0} className="w-32 h-7 text-xs text-right"
                                                        value={manualCosts[index] ?? (Number(item.frozen_unit_cost) || 0)}
                                                        onChange={(e) => setManualCosts((prev) => ({ ...prev, [index]: Number(e.target.value) }))} />
                                                </div>
                                            ) : item.cost_snapshot?.ingredients ? (
                                                <div className="max-h-40 overflow-y-auto">
                                                    <VTable
                                                        columns={ingredientColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                                                        data={(item.cost_snapshot.ingredients as CostIngredient[]) as unknown as Record<string, unknown>[]}
                                                        className="border-0 shadow-none rounded-none text-xs"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="text-amber-600 flex items-center gap-2"><AlertTriangle size={12}/> Sin receta vinculada.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COLUMNA DERECHA: VARIABLES GLOBALES Y TOTALES */}
                    <div className="w-full lg:w-[380px] bg-slate-50 p-6 flex flex-col border-l border-slate-200 shadow-xl relative z-10 min-h-0">

                        {/* ZONA SCROLLEABLE: controles y totales (los botones quedan fijos abajo) */}
                        <div className="flex-1 overflow-y-auto min-h-0 -mr-3 pr-3">

                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                                <DollarSign size={16} className="text-indigo-600"/> Control Maestro
                            </h3>

                            <div className="space-y-6">
                                <div className={isReadOnly ? 'opacity-60' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                            <RefreshCcw size={10} className="text-slate-400"/>
                                            Sobreprecio objetivo % (aplica a todo)
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            type="range" min="0" max="100" 
                                            step="0.01" 
                                            disabled={isReadOnly || processing}
                                            value={globalMargin}
                                            onChange={(e) => handleGlobalMarginChange(parseFloat(e.target.value))}
                                            className="flex-1 h-2 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                        <Input 
                                            type="number" 
                                            step="0.01" 
                                            disabled={isReadOnly || processing}
                                            value={globalMargin}
                                            onChange={(e) => handleGlobalMarginChange(parseFloat(e.target.value))}
                                            className="w-16 p-1 text-right text-xs font-bold border-indigo-200 text-indigo-700"
                                        />
                                    </div>
                                    <div className="mt-2 flex justify-between text-xs">
                                        <span className="text-slate-500">Sobreprecio real % (costo actual)</span>
                                        <span className={`font-mono font-black ${isBelowMinimum(simulation.realWeightedMargin, minMarkup) ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {formatPercent(simulation.realWeightedMargin)}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">Mínimo: {minMarkup}%. Sobreprecio = (precio sin comisión − costo) / costo.</p>
                                </div>

                                <div className={isReadOnly ? 'opacity-60' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600">Comisión vendedor (c × venta sin IVA, incluida en precio)</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            type="range" min="0" max="50" step="0.5"
                                            disabled={isReadOnly || processing}
                                            value={commissionPercent}
                                            onChange={(e) => {
                                                setCommissionPercent(Number(e.target.value));
                                                setItemPriceOverrides(prev => prev.map(() => null));
                                            }}
                                            className="flex-1 h-2 bg-amber-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                        <Input 
                                            type="number" step="0.1"
                                            disabled={isReadOnly || processing}
                                            value={commissionPercent}
                                            onChange={(e) => {
                                                setCommissionPercent(Number(e.target.value));
                                                setItemPriceOverrides(prev => prev.map(() => null));
                                            }}
                                            className="w-16 p-1 text-right text-xs font-bold border-amber-200 text-amber-700"
                                        />
                                    </div>
                                </div>
                                
                                <div className={isReadOnly ? 'opacity-60' : ''}>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                            <Percent size={12} className="text-blue-500"/>
                                            Anticipo a Solicitar
                                        </label>
                                        <div className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                            <span className="text-xs font-mono text-blue-600 font-bold">$</span>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                disabled={isReadOnly || processing}
                                                value={advanceAmount}
                                                onChange={(e) => handleAdvanceAmountChange(e.target.value)}
                                                className="w-24 text-right text-sm font-mono text-blue-600 font-bold bg-transparent border-0 shadow-none focus-visible:ring-0 disabled:text-slate-400"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            type="range" min="0" max="100" step="5"
                                            disabled={isReadOnly || processing}
                                            value={advancePercentDerived}
                                            onChange={(e) => handleAdvancePercentChange(Number(e.target.value))}
                                            className="flex-1 h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                        <Input 
                                            type="number" step="0.01"
                                            disabled={isReadOnly || processing}
                                            value={Number(advancePercentDerived.toFixed(2))}
                                            onChange={(e) => handleAdvancePercentChange(Number(e.target.value))}
                                            className="w-16 p-1 text-right text-sm font-bold border-blue-200 text-blue-700"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RESULTADOS GLOBALES */}
                        <div className="flex-1 space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                            {/* Comisión INFORMATIVA: ya incluida en los precios, NO se suma aparte */}
                            <div className="flex justify-between items-start text-emerald-700 bg-emerald-50/60 rounded px-2 py-1.5">
                                <span className="flex flex-col">
                                    <span className="flex items-center gap-1 text-sm font-medium">
                                        <Percent size={10}/> Comisión Vendedor incluida ({(commissionPercent).toFixed(1)}%):
                                    </span>
                                    <span className="text-[10px] text-emerald-600/80 italic">Ya está dentro de los precios; no se suma al subtotal.</span>
                                </span>
                                <span className="font-mono font-bold">{formatCurrency(simulation.commissionAmount)}</span>
                            </div>

                            <div className="flex justify-between text-sm border-t border-dashed border-slate-200 pt-2">
                                <span className="text-slate-700 font-bold">Subtotal:</span>
                                <span className="font-mono font-bold text-slate-800">{formatCurrency(simulation.subtotal)}</span>
                            </div>

                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">IVA:</span>
                                <span className="font-mono text-slate-500">{formatCurrency(simulation.taxAmount)}</span>
                            </div>

                            <div className="flex justify-between text-lg border-t-2 border-slate-800 pt-2 mt-1">
                                <span className="text-slate-900 font-black">TOTAL:</span>
                                <span className="font-mono font-black text-emerald-600">{formatCurrency(simulation.total)}</span>
                            </div>

                            <div className="mt-4 pt-2 border-t border-slate-100">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 uppercase font-bold" title="(precio sin IVA − costo − comisión) / precio sin IVA">Utilidad neta · Margen neto % sobre venta (después de comisión):</span>
                                    <span className={`font-mono font-bold ${simulation.netUtility > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {formatCurrency(simulation.netUtility)} · {formatPercent(simulation.netMargin)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        </div>
                        {/* fin ZONA SCROLLEABLE */}

                        {/* BOTONES E INDICADOR DE ESTADO (barra fija, fuera del scroll) */}
                        <div className="shrink-0 mt-4 pt-4 border-t border-slate-200 space-y-3">
                            {!isReadOnly ? (
                                <>
                                    <Button 
                                        onClick={handleAuthorize} 
                                        disabled={processing}
                                        className={`w-full py-3 shadow-md text-sm uppercase tracking-wide font-bold transition-all ${
                                            processing ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                                        }`}
                                    >
                                        <FileCheck size={18} className="mr-2"/> 
                                        {processing ? 'Procesando...' : 'AUTORIZAR COTIZACIÓN'}
                                    </Button>
                                    
                                    <Button 
                                        variant="secondary"
                                        onClick={handleReject} 
                                        disabled={processing}
                                        className="w-full bg-white border-red-200 text-red-600 hover:bg-red-50 text-xs"
                                    >
                                        <XCircle size={14} className="mr-2"/> Regresar para cambios
                                    </Button>
                                </>
                            ) : (
                                <div className="bg-slate-100 p-4 rounded-lg text-center text-slate-500 text-sm font-medium border border-slate-300 shadow-inner">
                                    <Lock size={20} className="mx-auto mb-2 text-slate-400"/>
                                    {quotation
                                        ? `Cotización ${QUOTATION_STATUS_LABELS[quotation.status].toLowerCase()}.`
                                        : 'Orden de venta: los precios se definieron al autorizar la cotización.'}
                                    <br/><span className="text-xs font-normal">Modo de Auditoría (Solo Lectura).</span>
                                </div>
                            )}
                        </div>

                    </div>
            </div>
        </div>

        {pendingConfirm && (
            <VConfirmDialog
                isOpen={pendingConfirm !== null}
                title="Autorizar cotización"
                message="¿Confirmar Autorización de Precios y Condiciones?"
                consequence="La cotización quedará autorizada con estos precios y podrá enviarse al cliente."
                variant="default"
                confirmLabel="Sí, autorizar"
                onConfirm={executeAuthorize}
                onCancel={() => setPendingConfirm(null)}
            />
        )}

        <QuotationActionDialogs
            pending={returning && quotation ? { kind: 'REQUEST_CHANGES', quotation } : null}
            onClose={() => setReturning(false)}
            onDone={() => {
                if (onOrderUpdated) onOrderUpdated();
                onClose();
            }}
        />
    </div>
    );
};