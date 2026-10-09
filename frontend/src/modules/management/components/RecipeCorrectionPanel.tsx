import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';

export type CatalogMaterial = {
    id: number;
    sku: string;
    name: string;
    current_cost: number;
    conversion_factor: number;
    purchase_unit?: string;
    usage_unit?: string;
};

export type RecipeLine = { material_id: number; quantity: number };

type Row = {
    material_id: number;
    name: string;
    sku: string;
    quantity: number;
    purchaseCost: number;
    usageCost: number;
    purchaseUnit: string;
    usageUnit: string;
    factor: number;
    priceChanged: boolean;
};

interface RecipeCorrectionPanelProps {
    lines: RecipeLine[];
    catalog: Map<number, CatalogMaterial>;
    /** Edited purchase prices by material id. */
    prices: Record<number, number>;
    reason: string;
    corrected: boolean;
    onLinesChange: (lines: RecipeLine[]) => void;
    onPriceChange: (materialId: number, purchaseCost: number) => void;
    onReasonChange: (reason: string) => void;
}

const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

/** Director's recipe correction inside the quotation review: quantities, purchase prices, add or remove materials. */
export const RecipeCorrectionPanel: React.FC<RecipeCorrectionPanelProps> = ({
    lines, catalog, prices, reason, corrected, onLinesChange, onPriceChange, onReasonChange,
}) => {
    const [adding, setAdding] = useState('');

    const rows: Row[] = useMemo(() => lines.map((line) => {
        const material = catalog.get(line.material_id);
        const factor = Number(material?.conversion_factor) > 0 ? Number(material?.conversion_factor) : 1;
        const purchaseCost = prices[line.material_id] ?? Number(material?.current_cost ?? 0);
        return {
            material_id: line.material_id,
            name: material?.name ?? `Material ${line.material_id}`,
            sku: material?.sku ?? '',
            quantity: line.quantity,
            purchaseCost,
            usageCost: purchaseCost / factor,
            purchaseUnit: material?.purchase_unit ?? '',
            usageUnit: material?.usage_unit ?? '',
            factor,
            priceChanged: prices[line.material_id] !== undefined,
        };
    }), [lines, catalog, prices]);

    const setQuantity = (materialId: number, quantity: number) =>
        onLinesChange(lines.map((l) => (l.material_id === materialId ? { ...l, quantity } : l)));

    const available = useMemo(
        () => Array.from(catalog.values()).filter((m) => !lines.some((l) => l.material_id === m.id)),
        [catalog, lines],
    );

    const columns: VTableColumn<Row>[] = [
        { key: 'name', label: 'Material', render: (r) => <span className="text-slate-700 font-medium">{r.name} <span className="text-slate-400">{r.sku}</span></span> },
        {
            key: 'quantity', label: 'Cant. (uso)', render: (r) => (
                <Input type="number" step="0.0001" min={0} className="w-24 text-right h-7 text-xs" value={r.quantity}
                    onChange={(e) => setQuantity(r.material_id, Number(e.target.value))} />
            ),
        },
        {
            key: 'purchaseCost', label: 'Precio por unidad de compra', render: (r) => (
                <div className="flex items-center gap-2">
                    <Input type="number" step="0.01" min={0} className={`w-28 text-right h-7 text-xs ${r.priceChanged ? 'border-amber-400 bg-amber-50' : ''}`}
                        value={r.purchaseCost} onChange={(e) => onPriceChange(r.material_id, Number(e.target.value))} />
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {r.purchaseUnit}{r.factor !== 1 ? ` = ${money(r.usageCost)} / ${r.usageUnit}` : ''}
                    </span>
                </div>
            ),
        },
        { key: 'importe', label: 'Importe', render: (r) => <span className="font-mono font-bold text-slate-700">{money(r.quantity * r.usageCost)}</span> },
        {
            key: 'remove', label: '', render: (r) => (
                <button type="button" title="Quitar material de la receta" aria-label="Quitar material de la receta"
                    onClick={() => onLinesChange(lines.filter((l) => l.material_id !== r.material_id))}
                    className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
            ),
        },
    ];

    const total = rows.reduce((sum, r) => sum + r.quantity * r.usageCost, 0);

    return (
        <div className="space-y-2">
            <VTable columns={columns} data={rows} className="border-0 shadow-none rounded-none text-xs" />
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-72">
                    <SearchableSelect items={available} value={adding} getLabel={(m) => `${m.sku} · ${m.name}`} getValue={(m) => String(m.id)}
                        placeholder="Agregar material..." onChange={(v) => {
                            if (!v) return;
                            onLinesChange([...lines, { material_id: Number(v), quantity: 1 }]);
                            setAdding('');
                        }} />
                </div>
                <span className="ml-auto text-xs font-bold text-slate-600">Costo de receta: {money(total)}</span>
            </div>
            {corrected && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-1">
                    <p className="text-[11px] text-amber-800">
                        Al autorizar se crea una versión nueva de la receta (la actual queda obsoleta) y los precios cambiados se
                        actualizan en el catálogo. El precio de venta no cambia.
                    </p>
                    <Input value={reason} onChange={(e) => onReasonChange(e.target.value)} placeholder="Motivo de la corrección (obligatorio)" className="h-8 text-xs" />
                </div>
            )}
        </div>
    );
};

export default RecipeCorrectionPanel;
