import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Package, PenLine, ShoppingCart } from 'lucide-react';
import { SalesOrder } from '../../../types/sales';
import type { ChangeOrderLine } from '../../../types/quotations';
import { designService } from '../../../api/design-service';
import Modal from '@/components/ui/Modal';
import { markupAsPercent, priceFromMarkup } from '../utils/margins';
import axiosClient from '../../../api/axios-client';
import { useFoundations } from '../../foundations/hooks/useFoundations';
import { toast } from '@/components/ui/VToast';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatMoney } from '@/utils/format';
import { canSeeCosts } from '@/utils/costVisibility';
import { quotationService, type PriceSuggestionItem } from '../../../api/quotation-service';

interface AddItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: SalesOrder;
    /** New lines for the change order; nothing is saved until the change order is applied. */
    onAdd: (lines: ChangeOrderLine[]) => void;
}

interface StagedItem {
    tempId: number;
    product_name: string;
    origin_version_id: number | null;
    quantity: number;
    unit_price: number;
    frozen_unit_cost: number;
    is_resale?: boolean;
    resale_sku?: string | null;
    commercial_description?: string | null;
}

const calcCostoParaPrecio = (estimatedCost: number, materialCost: number, taxRate: number) => {
    if (taxRate === 0) {
        const mat = Number(materialCost) || 0;
        const est = Number(estimatedCost) || 0;
        const noMat = Math.max(est - mat, 0);
        return (mat * (1 + 0.16)) + noMat;
    }
    return Number(estimatedCost) || 0;
};

/** Line picker (catalog, manual or resale) for the ADD operations of a change order. */
export const AddItemsModal: React.FC<AddItemsModalProps> = ({ isOpen, onClose, order, onAdd }) => {
    const foundationHook = useFoundations();
    const taxRates = foundationHook?.taxRates || [];

    const [masters, setMasters] = useState<any[]>([]);
    const [loadingCatalog, setLoadingCatalog] = useState(false);
    const [addMode, setAddMode] = useState<'CATALOG' | 'MANUAL' | 'RESALE'>('CATALOG');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [resaleList, setResaleList] = useState<any[]>([]);
    const [selectedResaleSku, setSelectedResaleSku] = useState('');
    const [resaleSearch, setResaleSearch] = useState('');
    const [staging, setStaging] = useState<StagedItem[]>([]);
    const [priceManual, setPriceManual] = useState(false);
    const [pricing, setPricing] = useState(false);
    const showCosts = canSeeCosts();

    const [lineItem, setLineItem] = useState({
        master_id: 0,
        version_id: 0,
        quantity: 1,
        unit_price: 0,
        manual_name: '',
        frozen_cost: 0,
        description: '',
    });

    const selectedTaxRate = useMemo(
        () => taxRates.find((t) => t.id === order.tax_rate_id),
        [taxRates, order.tax_rate_id]
    );

    const commissionRate = useMemo(() => {
        let rate = Number(order.applied_commission_percent) || 0;
        if (rate > 1) rate = rate / 100;
        return rate;
    }, [order.applied_commission_percent]);

    const marginPercent = markupAsPercent(order.applied_margin_percent);

    useEffect(() => {
        if (!isOpen) return;
        setStaging([]);
        setAddMode('CATALOG');
        setSelectedCategory('');
        setSelectedResaleSku('');
        setResaleSearch('');
        setLineItem({ master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0, description: '' });
        setPriceManual(false);

        const loadCatalog = async () => {
            setLoadingCatalog(true);
            try {
                const [filteredMasters, resaleRes] = await Promise.all([
                    designService.getMasters(undefined, true),
                    axiosClient.get('/foundations/materials', { params: { is_resale: true } }),
                ]);
                setMasters(filteredMasters || []);
                setResaleList(Array.isArray(resaleRes.data) ? resaleRes.data : []);
            } catch {
                toast.error('Error al cargar el catálogo.');
            } finally {
                setLoadingCatalog(false);
            }
        };
        void loadCatalog();
    }, [isOpen]);

    const mastersOfClient = useMemo(
        () => (order.client_id ? masters.filter((m) => m.client_id === Number(order.client_id)) : []),
        [masters, order.client_id]
    );
    const availableCategories = useMemo(
        () => Array.from(new Set(mastersOfClient.map((m) => m.category))),
        [mastersOfClient]
    );
    const filteredMasters = useMemo(
        () => (selectedCategory ? mastersOfClient.filter((m) => m.category === selectedCategory) : []),
        [mastersOfClient, selectedCategory]
    );

    const availableVersions = useMemo(() => {
        if (!lineItem.master_id) return [];
        const m = masters.find((x) => x.id === Number(lineItem.master_id));
        return m && Array.isArray(m.versions) ? m.versions : [];
    }, [masters, lineItem.master_id]);

    const stagingSubtotal = useMemo(
        () => staging.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
        [staging]
    );

    const formatCurrency = (value: number) => formatMoney(value);

    /** D13: the seller gets the suggested price from the server, never the cost. */
    const setServerPrice = async (item: PriceSuggestionItem, changes: Partial<typeof lineItem>) => {
        setPriceManual(false);
        setLineItem((prev) => ({ ...prev, ...changes, unit_price: 0, frozen_cost: 0 }));
        setPricing(true);
        try {
            const [price] = await quotationService.suggestPrices([item], order.tax_rate_id, commissionRate);
            setLineItem((prev) => ({ ...prev, unit_price: price }));
            if (!(price > 0)) setPriceManual(true);
        } catch {
            toast.error('No se pudo calcular el precio sugerido.');
        } finally {
            setPricing(false);
        }
    };

    const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedVersionId = Number(e.target.value);
        const master = masters.find((m) => m.id === lineItem.master_id);
        const version = master?.versions?.find((v: any) => v.id === selectedVersionId);
        if (!showCosts) {
            void setServerPrice({ origin_version_id: selectedVersionId },
                { version_id: selectedVersionId, description: version?.commercial_description || '' });
            return;
        }
        const estimatedCost = version ? Number(version.estimated_cost ?? version.total_cost ?? version.cost ?? 0) : 0;
        const materialCost = version ? Number(version.material_cost ?? 0) : 0;

        if (!version || estimatedCost <= 0) {
            setPriceManual(true);
            setLineItem({
                ...lineItem,
                version_id: selectedVersionId,
                unit_price: 0,
                frozen_cost: estimatedCost,
                description: version?.commercial_description || '',
            });
            return;
        }

        const taxRate = selectedTaxRate ? Number(selectedTaxRate.rate) : 0;
        const costoParaPrecio = calcCostoParaPrecio(estimatedCost, materialCost, taxRate);
        // precio = costo × (1 + sobreprecio de la OV) × (1 + comisión); el sobreprecio guardado ya no incluye comisión
        const salesPrice = priceFromMarkup(costoParaPrecio, marginPercent, commissionRate);

        setPriceManual(false);
        setLineItem({
            ...lineItem,
            version_id: selectedVersionId,
            unit_price: Number(salesPrice.toFixed(2)),
            frozen_cost: estimatedCost,
            description: version.commercial_description || '',
        });
    };

    const handleAddToStaging = () => {
        if (lineItem.quantity <= 0 || lineItem.unit_price <= 0) {
            toast.warning('Captura cantidad y precio unitario válidos.');
            return;
        }

        let productName = lineItem.manual_name.trim();
        if (addMode === 'CATALOG') {
            let foundMaster = masters.find((m) => m.id === Number(lineItem.master_id));
            if (!foundMaster && selectedCategory) {
                foundMaster = masters.find(
                    (m) => m.category === selectedCategory && m.id === Number(lineItem.master_id)
                );
            }
            const v = foundMaster?.versions?.find((x: any) => x.id === Number(lineItem.version_id));
            if (v) productName = `${foundMaster?.name} - ${v.version_name}`;
            else productName = 'Producto de Catálogo';
        } else if (addMode === 'RESALE') {
            if (!selectedResaleSku) {
                toast.warning('Selecciona un accesorio de reventa.');
                return;
            }
            const mat = resaleList.find((m) => m.sku === selectedResaleSku);
            productName = mat?.name || '';
        }

        if (!productName) {
            toast.warning('Indica el nombre del producto.');
            return;
        }

        const newItem: StagedItem = {
            tempId: -Date.now(),
            product_name: productName,
            origin_version_id: addMode === 'CATALOG' ? Number(lineItem.version_id) || null : null,
            quantity: Number(lineItem.quantity),
            unit_price: Number(lineItem.unit_price),
            frozen_unit_cost: addMode === 'CATALOG' ? lineItem.frozen_cost : (addMode === 'RESALE' ? lineItem.frozen_cost : 0),
            is_resale: addMode === 'RESALE',
            resale_sku: addMode === 'RESALE' ? selectedResaleSku : null,
            commercial_description: lineItem.description.trim() || null,
        };

        setStaging((prev) => [...prev, newItem]);
        setLineItem({ master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0, description: '' });
        setSelectedCategory('');
        setSelectedResaleSku('');
        setResaleSearch('');
        setAddMode('CATALOG');
        setPriceManual(false);
    };

    const handleRemoveFromStaging = (tempId: number) => {
        setStaging((prev) => prev.filter((i) => i.tempId !== tempId));
    };

    const handleSubmit = () => {
        if (staging.length === 0) return;
        onAdd(staging.map(({ tempId: _tempId, ...item }) => ({ change_type: 'ADD', ...item })));
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Agregar partidas · ${order.project_name}`} size="xl" overlayZIndex={80}>
            <div className="flex flex-col max-h-[75vh]">
                <div className="overflow-y-auto flex-1 space-y-6 pr-1">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => { setAddMode('CATALOG'); setPriceManual(false); }}
                            className={`flex-1 px-3 py-2 text-sm font-bold rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                                addMode === 'CATALOG'
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <Package size={16} /> Catálogo
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAddMode('MANUAL'); setPriceManual(true); }}
                            className={`flex-1 px-3 py-2 text-sm font-bold rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                                addMode === 'MANUAL'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <PenLine size={16} /> Manual
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAddMode('RESALE'); setPriceManual(false); setSelectedResaleSku(''); setResaleSearch(''); }}
                            className={`flex-1 px-3 py-2 text-sm font-bold rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                                addMode === 'RESALE'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <ShoppingCart size={16} /> Reventa
                        </button>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                        {loadingCatalog && (
                            <p className="text-xs text-slate-500 italic">Cargando catálogo…</p>
                        )}

                        {addMode === 'CATALOG' && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase">Categoría</label>
                                    <SearchableSelect
                                        items={(availableCategories ?? []).map((cat) => ({ value: cat, label: cat }))}
                                        value={selectedCategory}
                                        onChange={(v) => {
                                            setSelectedCategory(v);
                                            setLineItem({ ...lineItem, master_id: 0, version_id: 0, unit_price: 0, frozen_cost: 0 });
                                            setPriceManual(false);
                                        }}
                                        getLabel={(i) => i.label}
                                        getValue={(i) => i.value}
                                        placeholder="-- Seleccionar --"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase">Producto</label>
                                    <SearchableSelect
                                        items={filteredMasters ?? []}
                                        value={lineItem.master_id ? String(lineItem.master_id) : ''}
                                        disabled={!selectedCategory}
                                        onChange={(v) => {
                                            setLineItem({ ...lineItem, master_id: Number(v), version_id: 0, unit_price: 0, frozen_cost: 0 });
                                            setPriceManual(false);
                                        }}
                                        getLabel={(m) => m.name}
                                        getValue={(m) => String(m.id)}
                                        placeholder="-- Seleccionar --"
                                        className="text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase">Versión</label>
                                    <SearchableSelect
                                        items={availableVersions ?? []}
                                        value={lineItem.version_id ? String(lineItem.version_id) : ''}
                                        disabled={!lineItem.master_id}
                                        onChange={(v) => handleVersionChange({ target: { value: v } } as React.ChangeEvent<HTMLSelectElement>)}
                                        getLabel={(v: any) => v.version_name}
                                        getValue={(v: any) => String(v.id)}
                                        placeholder="-- Seleccionar --"
                                        className="text-sm"
                                    />
                                </div>
                            </>
                        )}

                        {addMode === 'MANUAL' && (
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Nombre del producto</label>
                                <Input
                                    type="text"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-bold h-auto"
                                    placeholder="Descripción de la partida"
                                    value={lineItem.manual_name}
                                    onChange={(e) => setLineItem({ ...lineItem, manual_name: e.target.value })}
                                />
                            </div>
                        )}

                        {addMode === 'RESALE' && (
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Buscar accesorio</label>
                                <Input
                                    type="text"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 mb-2 h-auto"
                                    placeholder="Escribe para filtrar (ej. Tarja)..."
                                    value={resaleSearch}
                                    onChange={(e) => setResaleSearch(e.target.value)}
                                />
                                <div className="w-full max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
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
                                                    if (!showCosts) {
                                                        void setServerPrice({ resale_sku: m.sku }, { manual_name: m.name });
                                                        return;
                                                    }
                                                    const costo = Number(m.current_cost) || 0;
                                                    // sale_price del catálogo es el precio antes de comisión: se suma la comisión del vendedor
                                                    const override = priceFromMarkup(Number(m.sale_price) || 0, 0, commissionRate);
                                                    let precio = override;
                                                    if (precio <= 0) {
                                                        // Reventa: misma regla que producción (incluye comisión)
                                                        precio = Number(priceFromMarkup(costo, marginPercent, commissionRate).toFixed(2));
                                                    }
                                                    setLineItem({
                                                        ...lineItem,
                                                        manual_name: m.name,
                                                        unit_price: precio,
                                                        frozen_cost: costo,
                                                    });
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
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
                                        <p className="px-3 py-4 text-xs text-slate-400 italic text-center">Sin coincidencias</p>
                                    )}
                                </div>
                                {selectedResaleSku && (() => {
                                    const sel = resaleList.find((m) => m.sku === selectedResaleSku);
                                    if (!sel) return null;
                                    return (
                                        <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
                                            <span className="font-bold text-emerald-700">Seleccionado: </span>
                                            <span className="text-slate-700">{sel.name} — {sel.sku}</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Descripción comercial (opcional)</label>
                            <Input
                                type="text"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm h-auto"
                                placeholder="Se imprime bajo el nombre del producto"
                                value={lineItem.description}
                                onChange={(e) => setLineItem({ ...lineItem, description: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Cantidad</label>
                                <Input
                                    type="number"
                                    min={1}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-bold h-auto"
                                    value={lineItem.quantity}
                                    onChange={(e) => setLineItem({ ...lineItem, quantity: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">
                                    Precio unitario MXN
                                    {priceManual && addMode === 'CATALOG' && (
                                        <span className="text-amber-600 normal-case ml-1">(editable)</span>
                                    )}
                                </label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-black text-right h-auto"
                                    value={lineItem.unit_price === 0 ? '' : lineItem.unit_price}
                                    disabled={addMode === 'CATALOG' && !priceManual && lineItem.version_id > 0}
                                    onChange={(e) => setLineItem({ ...lineItem, unit_price: Number(e.target.value) })}
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleAddToStaging}
                            disabled={pricing}
                            className="w-full px-4 py-2 text-sm font-black text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Agregar a la lista
                        </button>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            Partidas por agregar ({staging.length})
                        </h3>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                            {staging.length === 0 ? (
                                <p className="p-4 text-sm text-slate-500 text-center italic">
                                    Aún no hay partidas en la lista.
                                </p>
                            ) : (
                                staging.map((item) => (
                                    <div key={item.tempId} className="flex items-center gap-3 p-3 hover:bg-white transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-700 truncate">{item.product_name}</p>
                                            <p className="text-xs text-slate-500">
                                                {item.quantity} × {formatCurrency(item.unit_price)}
                                            </p>
                                        </div>
                                        <p className="text-sm font-black text-slate-600 shrink-0">
                                            {formatCurrency(item.quantity * item.unit_price)}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFromStaging(item.tempId)}
                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                                            title="Quitar"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        {staging.length > 0 && (
                            <div className="flex justify-between items-center px-2 text-sm">
                                <span className="font-bold text-slate-500 uppercase text-xs">Subtotal a agregar</span>
                                <span className="font-black text-indigo-700 text-lg">{formatCurrency(stagingSubtotal)}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={staging.length === 0}
                        className="px-6 py-2 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                    >
                        Agregar a la orden de cambio
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AddItemsModal;
