import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Package, PenLine, ShoppingCart } from 'lucide-react';
import { SalesOrder } from '../../../types/sales';
import { salesService } from '../../../api/sales-service';
import { designService } from '../../../api/design-service';
import axiosClient from '../../../api/axios-client';
import { useFoundations } from '../../foundations/hooks/useFoundations';

interface AddItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: SalesOrder;
    onSuccess: () => void;
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

export const AddItemsModal: React.FC<AddItemsModalProps> = ({ isOpen, onClose, order, onSuccess }) => {
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
    const [isLoading, setIsLoading] = useState(false);
    const [priceManual, setPriceManual] = useState(false);

    const [lineItem, setLineItem] = useState({
        master_id: 0,
        version_id: 0,
        quantity: 1,
        unit_price: 0,
        manual_name: '',
        frozen_cost: 0,
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

    const marginPercent = Number(order.applied_margin_percent) || 0;

    useEffect(() => {
        if (!isOpen) return;
        setStaging([]);
        setAddMode('CATALOG');
        setSelectedCategory('');
        setSelectedResaleSku('');
        setResaleSearch('');
        setLineItem({ master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0 });
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
            } catch (error) {
                console.error('Error cargando catálogo', error);
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

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);

    const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedVersionId = Number(e.target.value);
        const master = masters.find((m) => m.id === lineItem.master_id);
        const version = master?.versions?.find((v: any) => v.id === selectedVersionId);
        const estimatedCost = version ? Number(version.estimated_cost ?? version.total_cost ?? version.cost ?? 0) : 0;
        const materialCost = version ? Number(version.material_cost ?? 0) : 0;

        if (!version || estimatedCost <= 0) {
            setPriceManual(true);
            setLineItem({
                ...lineItem,
                version_id: selectedVersionId,
                unit_price: 0,
                frozen_cost: estimatedCost,
            });
            return;
        }

        const taxRate = selectedTaxRate ? Number(selectedTaxRate.rate) : 0;
        const costoParaPrecio = calcCostoParaPrecio(estimatedCost, materialCost, taxRate);
        const margin = marginPercent;
        let marginMultiplier = 1;
        if (margin > 0 && margin <= 1) marginMultiplier = 1 + margin;
        else marginMultiplier = 1 + margin / 100;
        const commissionMultiplier = 1 + commissionRate;
        const salesPrice = costoParaPrecio * marginMultiplier * commissionMultiplier;

        setPriceManual(false);
        setLineItem({
            ...lineItem,
            version_id: selectedVersionId,
            unit_price: Number(salesPrice.toFixed(2)),
            frozen_cost: estimatedCost,
        });
    };

    const handleAddToStaging = () => {
        if (lineItem.quantity <= 0 || lineItem.unit_price <= 0) {
            alert('Captura cantidad y precio unitario válidos.');
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
                alert('Selecciona un accesorio de reventa.');
                return;
            }
            const mat = resaleList.find((m) => m.sku === selectedResaleSku);
            productName = mat?.name || '';
        }

        if (!productName) {
            alert('Indica el nombre del producto.');
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
        };

        setStaging((prev) => [...prev, newItem]);
        setLineItem({ master_id: 0, version_id: 0, quantity: 1, unit_price: 0, manual_name: '', frozen_cost: 0 });
        setSelectedCategory('');
        setSelectedResaleSku('');
        setResaleSearch('');
        setAddMode('CATALOG');
        setPriceManual(false);
    };

    const handleRemoveFromStaging = (tempId: number) => {
        setStaging((prev) => prev.filter((i) => i.tempId !== tempId));
    };

    const handleSubmit = async () => {
        if (!order.id || staging.length === 0) return;
        setIsLoading(true);
        try {
            const payload = staging.map(({ tempId: _tempId, ...item }) => item);
            await salesService.addItemsToOrder(order.id, payload);
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error al ampliar la orden:', error);
            alert(error.response?.data?.detail || 'No se pudieron agregar las partidas.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-lg font-black text-slate-800">Ampliar Orden de Venta</h2>
                        <p className="text-xs text-slate-500 font-medium">
                            {order.project_name} · OV #{order.id}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
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
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                        value={selectedCategory}
                                        onChange={(e) => {
                                            setSelectedCategory(e.target.value);
                                            setLineItem({ ...lineItem, master_id: 0, version_id: 0, unit_price: 0, frozen_cost: 0 });
                                            setPriceManual(false);
                                        }}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {availableCategories.map((cat) => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase">Producto</label>
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                        value={lineItem.master_id}
                                        disabled={!selectedCategory}
                                        onChange={(e) => {
                                            setLineItem({ ...lineItem, master_id: Number(e.target.value), version_id: 0, unit_price: 0, frozen_cost: 0 });
                                            setPriceManual(false);
                                        }}
                                    >
                                        <option value={0}>-- Seleccionar --</option>
                                        {filteredMasters.map((m) => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase">Versión</label>
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                        disabled={!lineItem.master_id}
                                        value={lineItem.version_id}
                                        onChange={handleVersionChange}
                                    >
                                        <option value={0}>-- Seleccionar --</option>
                                        {availableVersions.map((v: any) => (
                                            <option key={v.id} value={v.id}>{v.version_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        {addMode === 'MANUAL' && (
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Nombre del producto</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-bold"
                                    placeholder="Descripción de la partida"
                                    value={lineItem.manual_name}
                                    onChange={(e) => setLineItem({ ...lineItem, manual_name: e.target.value })}
                                />
                            </div>
                        )}

                        {addMode === 'RESALE' && (
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Buscar accesorio</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 mb-2"
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
                                                    const costo = Number(m.current_cost) || 0;
                                                    const override = Number(m.sale_price) || 0;
                                                    let precio = override;
                                                    if (precio <= 0) {
                                                        const mg = Number(order.applied_margin_percent) || 0;
                                                        const mult = mg > 0 && mg <= 1 ? 1 + mg : 1 + (mg / 100);
                                                        precio = Number((costo * mult).toFixed(2));
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Cantidad</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-bold"
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
                                <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-black text-right"
                                    value={lineItem.unit_price === 0 ? '' : lineItem.unit_price}
                                    disabled={addMode === 'CATALOG' && !priceManual && lineItem.version_id > 0}
                                    onChange={(e) => setLineItem({ ...lineItem, unit_price: Number(e.target.value) })}
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleAddToStaging}
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

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isLoading || staging.length === 0}
                        className="px-6 py-2 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                    >
                        {isLoading ? 'Agregando…' : 'Agregar a la Orden'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddItemsModal;
