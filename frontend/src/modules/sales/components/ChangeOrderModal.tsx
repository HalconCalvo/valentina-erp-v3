import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/components/ui/VToast';
import { changeOrderService, CHANGE_TYPE_LABELS } from '../../../api/change-order-service';
import { quotationService } from '../../../api/quotation-service';
import { getErrorMessage } from '../../../hooks/useQuotations';
import type { SalesOrder, SalesOrderItem } from '../../../types/sales';
import type { ChangeOrderLine, ChangeType, Quotation } from '../../../types/quotations';
import { AddItemsModal } from './AddItemsModal';

type LineOp = 'NONE' | Exclude<ChangeType, 'ADD'>;

interface ItemOp {
    type: LineOp;
    quantity: number;
    unitPrice: number;
    cancelIds: number[];
    reason: string;
}

interface ChangeOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: SalesOrder;
    /** Existing change order to edit (draft or returned for changes). */
    change?: Quotation | null;
    onSaved: () => void | Promise<void>;
}

const LOCKED_UNIT_STATUSES = ['CARGADO', 'INSTALLED', 'CLOSED', 'WARRANTY'];
const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pendiente', IN_PRODUCTION: 'En producción', READY: 'Lista', CARGADO: 'Cargada',
    INSTALLED: 'Instalada', CLOSED: 'Firmada', WARRANTY: 'Garantía',
};
const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

/** Money summary of a change order. Line amounts are without tax; totals and advance include tax. */
export const ChangeTotals: React.FC<{ order: SalesOrder; delta: number; advancePercent?: number }> = ({ order, delta, advancePercent }) => {
    const subtotal = Number(order.subtotal || 0);
    const taxRatio = subtotal > 0 ? Number(order.tax_amount || 0) / subtotal : 0;
    const deltaTax = delta * taxRatio;
    const newTotal = (subtotal + delta) * (1 + taxRatio);
    const cell = (label: string, value: number, tone = 'text-slate-700') => (
        <div><p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p><p className={`font-black ${tone}`}>{money(value)}</p></div>
    );
    const signTone = delta < 0 ? 'text-rose-600' : 'text-emerald-700';
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {cell('Cambio sin IVA', delta, signTone)}
            {cell('IVA del cambio', deltaTax, signTone)}
            {cell('Cambio con IVA', delta + deltaTax, signTone)}
            {cell('Total actual con IVA', Number(order.total_price || 0))}
            {cell('Total nuevo con IVA', newTotal, 'text-indigo-700')}
            {advancePercent !== undefined && cell(`Anticipo requerido ${advancePercent}% con IVA`, newTotal * advancePercent / 100)}
        </div>
    );
};

const activeUnits = (item: SalesOrderItem) => (item.instances ?? []).filter((u: any) => !u.is_cancelled);
const isInvoiced = (unit: any) => Boolean(unit.customer_payment_id);
const isCancellable = (unit: any) => !isInvoiced(unit) && !LOCKED_UNIT_STATUSES.includes(unit.production_status);
/** Quantity operations carry the NEW quantity of the line (production cancellations derive it from the units). */
const defaultQuantity = (item: SalesOrderItem, type: LineOp) => {
    const qty = Number(item.quantity) || 0;
    if (type === 'QUANTITY_UP') return qty + 1;
    if (type === 'QUANTITY_DOWN') return Math.max(qty - 1, 0);
    return qty;
};
const emptyOp = (item: SalesOrderItem, type: LineOp = 'NONE'): ItemOp => ({
    type, quantity: defaultQuantity(item, type), unitPrice: Number(item.unit_price) || 0, cancelIds: [], reason: '',
});

/** New quantity of the line after the operation. */
function finalQuantity(item: SalesOrderItem, op: ItemOp): number {
    const qty = Number(item.quantity) || 0;
    if (op.type === 'QUANTITY_UP' || (op.type === 'QUANTITY_DOWN' && item.is_resale)) return op.quantity;
    if (op.type === 'QUANTITY_DOWN') return qty - op.cancelIds.length;
    if (op.type === 'CANCEL_LINE') return 0;
    return qty;
}

/** Money delta of one operation, without tax (same rule as the backend). */
function lineDelta(item: SalesOrderItem, op: ItemOp): number {
    const price = Number(item.unit_price) || 0;
    const qty = Number(item.quantity) || 0;
    if (op.type === 'PRICE') return qty * (op.unitPrice - price);
    return (finalQuantity(item, op) - qty) * price;
}

function opFromLine(item: SalesOrderItem, line: Quotation['items'][number]): ItemOp {
    return {
        type: line.change_type as LineOp,
        quantity: Number(line.quantity) || 1,
        unitPrice: line.change_type === 'PRICE' ? Number(line.unit_price) : Number(item.unit_price) || 0,
        cancelIds: line.cancel_instance_ids ?? [],
        reason: line.change_reason ?? '',
    };
}

/** Change order (CAM) of a sales order: add lines, change quantities or prices, cancel lines. The Director authorizes it. */
export const ChangeOrderModal: React.FC<ChangeOrderModalProps> = ({ isOpen, onClose, order, change, onSaved }) => {
    const items = useMemo(() => (order.items ?? []).filter((i) => !i.is_cancelled && i.id), [order.items]);
    const [ops, setOps] = useState<Record<number, ItemOp>>({});
    const [addLines, setAddLines] = useState<ChangeOrderLine[]>([]);
    const [reason, setReason] = useState('');
    const [advancePercent, setAdvancePercent] = useState<number>(Number(order.advance_percent ?? 60));
    const [showPicker, setShowPicker] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const next: Record<number, ItemOp> = {};
        items.forEach((item) => { next[item.id as number] = emptyOp(item); });
        const added: ChangeOrderLine[] = [];
        (change?.items ?? []).forEach((line) => {
            if (line.change_type === 'ADD') {
                added.push({ ...line, change_type: 'ADD', quantity: Number(line.quantity), unit_price: Number(line.unit_price) } as ChangeOrderLine);
                return;
            }
            const item = items.find((i) => i.id === line.target_order_item_id);
            if (item) next[item.id as number] = opFromLine(item, line);
        });
        setOps(next);
        setAddLines(added);
        setReason(change?.change_reason ?? '');
        setAdvancePercent(Number(change?.advance_percent ?? order.advance_percent ?? 60));
    }, [isOpen, change, items, order.advance_percent]);

    const delta = useMemo(() => {
        const onLines = items.reduce((sum, item) => sum + lineDelta(item, ops[item.id as number] ?? emptyOp(item)), 0);
        return onLines + addLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
    }, [items, ops, addLines]);

    const setOp = (itemId: number, patch: Partial<ItemOp>) =>
        setOps((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));

    const toggleUnit = (itemId: number, unitId: number) => {
        const current = ops[itemId]?.cancelIds ?? [];
        setOp(itemId, { cancelIds: current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId] });
    };

    const buildLines = (): ChangeOrderLine[] => {
        const lines: ChangeOrderLine[] = items.flatMap((item) => {
            const op = ops[item.id as number];
            if (!op || op.type === 'NONE') return [];
            return [{
                change_type: op.type, target_order_item_id: item.id, quantity: finalQuantity(item, op),
                unit_price: op.type === 'PRICE' ? op.unitPrice : Number(item.unit_price) || 0,
                cancel_instance_ids: op.type === 'QUANTITY_DOWN' && !item.is_resale ? op.cancelIds : [],
                change_reason: op.reason.trim() || null,
            }];
        });
        return [...lines, ...addLines];
    };

    const save = async (requestAuth: boolean) => {
        const lines = buildLines();
        if (!reason.trim()) { toast.warning('Indica el motivo de la orden de cambio.'); return; }
        if (lines.length === 0) { toast.warning('Agrega al menos un cambio.'); return; }
        setSaving(true);
        try {
            const payload = { change_reason: reason.trim(), lines, advance_percent: advancePercent };
            const saved = change
                ? await changeOrderService.update(change.id, payload)
                : await changeOrderService.create({ sales_order_id: order.id as number, ...payload });
            if (requestAuth) await quotationService.requestAuthorization(saved.id);
            toast.success(requestAuth ? `${saved.folio} enviada a Dirección.` : `${saved.folio} guardada como borrador.`);
            await onSaved();
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error, 'No se pudo guardar la orden de cambio.'));
        } finally {
            setSaving(false);
        }
    };

    const opOptions = (item: SalesOrderItem) => {
        const priceLocked = activeUnits(item).some(isInvoiced);
        return (['NONE', 'QUANTITY_UP', 'QUANTITY_DOWN', 'PRICE', 'CANCEL_LINE'] as LineOp[])
            .filter((t) => !(t === 'PRICE' && priceLocked))
            .map((t) => ({ value: t, label: t === 'NONE' ? 'Sin cambio' : CHANGE_TYPE_LABELS[t] }));
    };

    const quantityChange = (item: SalesOrderItem, op: ItemOp, editable: boolean) => {
        const current = Number(item.quantity) || 0;
        const final = finalQuantity(item, op);
        const diff = final - current;
        return (
            <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                <span>Cantidad actual {current} →</span>
                {editable ? (
                    <Input type="number" min={0} className="w-24 text-right" value={op.quantity}
                        onChange={(e) => setOp(item.id as number, { quantity: Number(e.target.value) })} />
                ) : (
                    <span className="text-slate-800">{final}</span>
                )}
                <span className={diff < 0 ? 'text-rose-600' : 'text-emerald-700'}>({diff > 0 ? '+' : ''}{diff})</span>
            </div>
        );
    };

    const renderOpFields = (item: SalesOrderItem, op: ItemOp) => {
        const itemId = item.id as number;
        if (op.type === 'QUANTITY_UP' || (op.type === 'QUANTITY_DOWN' && item.is_resale)) {
            return quantityChange(item, op, true);
        }
        if (op.type === 'PRICE') {
            return (
                <Input type="number" step="0.01" min={0} className="w-36 text-right" value={op.unitPrice}
                    onChange={(e) => setOp(itemId, { unitPrice: Number(e.target.value) })} />
            );
        }
        if (op.type === 'QUANTITY_DOWN') {
            return (
                <div className="space-y-1.5">
                {quantityChange(item, op, false)}
                <div className="flex flex-wrap gap-1.5">
                    {activeUnits(item).map((unit: any) => {
                        const selected = op.cancelIds.includes(unit.id);
                        const allowed = isCancellable(unit);
                        return (
                            <button key={unit.id} type="button" disabled={!allowed} onClick={() => toggleUnit(itemId, unit.id)}
                                title={allowed ? 'Cancelar esta unidad' : 'Cargada, instalada o facturada: no se puede cancelar'}
                                className={`px-2 py-1 rounded border text-[11px] font-bold transition-colors disabled:opacity-40 ${selected ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-rose-50'}`}>
                                {unit.custom_name} · {STATUS_LABELS[unit.production_status] ?? unit.production_status}
                            </button>
                        );
                    })}
                </div>
                </div>
            );
        }
        return null;
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={() => !saving && onClose()} size="xl" overlayZIndex={70}
                title={`${change ? `Editar ${change.folio}` : 'Nueva orden de cambio'} · OV-${String(order.id).padStart(4, '0')}`}>
                <div className="flex flex-col max-h-[75vh]">
                    <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Todo cambio de dinero de la OV pasa por Dirección. Nada se aplica hasta que la orden de cambio esté autorizada y se aplique.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo (lo que pidió el cliente)</label>
                                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo obligatorio..." />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Anticipo %</label>
                                <Input type="number" min={0} max={100} className="text-right" value={advancePercent}
                                    onChange={(e) => setAdvancePercent(Number(e.target.value))} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            {items.map((item) => {
                                const itemId = item.id as number;
                                const op = ops[itemId] ?? emptyOp(item);
                                const itemDelta = lineDelta(item, op);
                                return (
                                    <div key={itemId} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-slate-700 truncate">{item.product_name}{item.is_resale ? ' (reventa)' : ''}</p>
                                                <p className="text-[11px] text-slate-500">{item.quantity} × {money(Number(item.unit_price))} = {money(Number(item.quantity) * Number(item.unit_price))} sin IVA</p>
                                            </div>
                                            <div className="w-48">
                                                <SearchableSelect items={opOptions(item)} value={op.type} getLabel={(o) => o.label} getValue={(o) => o.value}
                                                    onChange={(v) => setOp(itemId, emptyOp(item, (v || 'NONE') as LineOp))} />
                                            </div>
                                        </div>
                                        {op.type !== 'NONE' && (
                                            <div className="flex flex-wrap items-center gap-3">
                                                {renderOpFields(item, op)}
                                                <Input className="flex-1 min-w-[12rem]" value={op.reason} placeholder="Motivo de esta partida (opcional)"
                                                    onChange={(e) => setOp(itemId, { reason: e.target.value })} />
                                                <span className={`text-sm font-black ${itemDelta < 0 ? 'text-rose-600' : 'text-emerald-700'}`} title="Cambio sin IVA">{money(itemDelta)} <span className="text-[10px] font-bold text-slate-400">sin IVA</span></span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Partidas nuevas ({addLines.length})</h3>
                                <button type="button" onClick={() => setShowPicker(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">
                                    <Plus size={14} /> Agregar partidas
                                </button>
                            </div>
                            {addLines.map((line, index) => (
                                <div key={`${line.product_name}-${index}`} className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-700 truncate">{line.product_name}</p>
                                        <p className="text-xs text-slate-500">{line.quantity} × {money(line.unit_price)}{line.commercial_description ? ` · ${line.commercial_description}` : ''}</p>
                                    </div>
                                    <span className="text-sm font-black text-emerald-700">{money(line.quantity * line.unit_price)} <span className="text-[10px] font-bold text-slate-400">sin IVA</span></span>
                                    <button type="button" title="Quitar de la orden de cambio" onClick={() => setAddLines((prev) => prev.filter((_, i) => i !== index))}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={15} /></button>
                                </div>
                            ))}
                        </div>

                        <ChangeTotals order={order} delta={delta} advancePercent={advancePercent} />
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50">Cerrar</button>
                        <button type="button" onClick={() => void save(false)} disabled={saving}
                            className="px-4 py-2 text-sm font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg disabled:opacity-50">
                            {saving ? 'Guardando...' : 'Guardar borrador'}
                        </button>
                        <button type="button" onClick={() => void save(true)} disabled={saving}
                            className="px-5 py-2 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
                            {saving ? 'Guardando...' : 'Guardar y solicitar autorización'}
                        </button>
                    </div>
                </div>
            </Modal>
            <AddItemsModal isOpen={showPicker} onClose={() => setShowPicker(false)} order={order}
                onAdd={(lines) => setAddLines((prev) => [...prev, ...lines])} />
        </>
    );
};

export default ChangeOrderModal;
