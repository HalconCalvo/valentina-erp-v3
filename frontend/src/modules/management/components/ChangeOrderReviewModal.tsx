import React, { useEffect, useMemo, useRef, useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/components/ui/VToast';
import { changeOrderService, CHANGE_TYPE_LABELS, DISPOSITION_LABELS } from '../../../api/change-order-service';
import { salesService } from '../../../api/sales-service';
import { getErrorMessage } from '../../../hooks/useQuotations';
import type { SalesOrder } from '../../../types/sales';
import type { ChangeOrderLine, Quotation } from '../../../types/quotations';
import { QuotationActionDialogs, type PendingQuotationAction } from '../../sales/components/QuotationActions';

interface ChangeOrderReviewModalProps {
    changeId: number | null;
    onClose: () => void;
    onDone: () => void | Promise<void>;
}

const IN_PRODUCTION = ['IN_PRODUCTION', 'READY'];
const DISPOSITIONS = Object.entries(DISPOSITION_LABELS).map(([value, label]) => ({ value, label }));
const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

/** Director's review of a change order (CAM): final prices, advance and what happens to units already in production. */
export const ChangeOrderReviewModal: React.FC<ChangeOrderReviewModalProps> = ({ changeId, onClose, onDone }) => {
    const [change, setChange] = useState<Quotation | null>(null);
    const [order, setOrder] = useState<SalesOrder | null>(null);
    const [lines, setLines] = useState<ChangeOrderLine[]>([]);
    const [advancePercent, setAdvancePercent] = useState(60);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingQuotationAction | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!changeId) return;
        const load = async () => {
            try {
                const loaded = await changeOrderService.get(changeId);
                setChange(loaded);
                setOrder(await salesService.getOrderDetail(loaded.parent_sales_order_id as number));
                setLines(loaded.items.map((row) => ({
                    change_type: row.change_type!, target_order_item_id: row.target_order_item_id,
                    product_name: row.product_name, origin_version_id: row.origin_version_id, quantity: Number(row.quantity),
                    unit_price: Number(row.unit_price), frozen_unit_cost: Number(row.frozen_unit_cost || 0),
                    is_resale: row.is_resale, resale_sku: row.resale_sku, commercial_description: row.commercial_description,
                    cancel_instance_ids: row.cancel_instance_ids ?? [], reversal_dispositions: row.reversal_dispositions ?? {},
                    change_reason: row.change_reason,
                })));
                setAdvancePercent(Number(loaded.advance_percent ?? 60));
                setNotes('');
            } catch (error) {
                toast.error(getErrorMessage(error, 'No se pudo cargar la orden de cambio.'));
                onCloseRef.current();
            }
        };
        void load();
    }, [changeId]);

    const itemsById = useMemo(() => new Map((order?.items ?? []).map((i) => [i.id as number, i])), [order]);

    const unitsToCancel = (line: ChangeOrderLine) => {
        const item = itemsById.get(line.target_order_item_id as number);
        const units = (item?.instances ?? []).filter((u: any) => !u.is_cancelled);
        if (line.change_type === 'CANCEL_LINE') return units;
        if (line.change_type === 'QUANTITY_DOWN') return units.filter((u: any) => (line.cancel_instance_ids ?? []).includes(u.id));
        return [];
    };

    const lineDelta = (line: ChangeOrderLine) => {
        const item = itemsById.get(line.target_order_item_id as number);
        const price = Number(item?.unit_price ?? 0);
        const qty = Number(item?.quantity ?? 0);
        switch (line.change_type) {
            case 'ADD': return line.quantity * line.unit_price;
            case 'QUANTITY_UP': return line.quantity * price;
            case 'QUANTITY_DOWN': return -line.quantity * price;
            case 'PRICE': return qty * (line.unit_price - price);
            default: return -qty * price;
        }
    };

    const delta = lines.reduce((sum, line) => sum + lineDelta(line), 0);
    const taxRatio = Number(order?.subtotal) > 0 ? Number(order?.tax_amount || 0) / Number(order?.subtotal) : 0.16;
    const newTotal = (Number(order?.subtotal || 0) + delta) * (1 + taxRatio);

    const patchLine = (index: number, patch: Partial<ChangeOrderLine>) =>
        setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

    const setDisposition = (index: number, unitId: number, value: string) =>
        patchLine(index, { reversal_dispositions: { ...(lines[index].reversal_dispositions ?? {}), [String(unitId)]: value } });

    const missingDisposition = lines.some((line, index) => unitsToCancel(line).some(
        (u: any) => IN_PRODUCTION.includes(u.production_status) && !lines[index].reversal_dispositions?.[String(u.id)]));

    const authorize = async () => {
        if (!change) return;
        setSaving(true);
        try {
            await changeOrderService.authorize(change.id, { lines, advance_percent: advancePercent, director_notes: notes.trim() || null });
            toast.success(`${change.folio} autorizada. Ya se puede aplicar a la OV.`);
            await onDone();
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error, 'No se pudo autorizar la orden de cambio.'));
        } finally {
            setSaving(false);
        }
    };

    if (!changeId) return null;
    const editable = change?.status === 'PENDING_AUTH';

    return (
        <>
            <Modal isOpen={Boolean(changeId) && !pendingAction} onClose={() => !saving && onClose()} size="xl" overlayZIndex={70}
                title={change ? `Revisión ${change.folio} · ${order?.project_name ?? ''}` : 'Cargando orden de cambio...'}>
                {change && order && (
                    <div className="flex flex-col max-h-[75vh]">
                        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                <span className="font-bold">Motivo:</span> {change.change_reason}
                            </div>
                            {lines.map((line, index) => {
                                const item = itemsById.get(line.target_order_item_id as number);
                                const priceEditable = editable && (line.change_type === 'ADD' || line.change_type === 'PRICE');
                                const cost = Number(line.frozen_unit_cost || item?.frozen_unit_cost || 0);
                                const margin = line.unit_price > 0 && cost > 0 ? (1 - cost / line.unit_price) * 100 : null;
                                return (
                                    <div key={`${line.change_type}-${index}`} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black uppercase text-indigo-600">{CHANGE_TYPE_LABELS[line.change_type]}</p>
                                                <p className="text-sm font-black text-slate-700 truncate">{line.product_name ?? item?.product_name}</p>
                                                <p className="text-[11px] text-slate-500">
                                                    {item ? `Actual: ${item.quantity} × ${money(Number(item.unit_price))} · ` : ''}
                                                    Cantidad {line.quantity}{line.change_reason ? ` · ${line.change_reason}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {priceEditable ? (
                                                    <Input type="number" step="0.01" min={0} className="w-36 text-right" value={line.unit_price}
                                                        onChange={(e) => patchLine(index, { unit_price: Number(e.target.value) })} />
                                                ) : (
                                                    <span className="text-sm text-slate-600">{money(line.unit_price)}</span>
                                                )}
                                                {margin !== null && (line.change_type === 'ADD' || line.change_type === 'PRICE') && (
                                                    <span className={`text-xs font-bold ${margin < 20 ? 'text-rose-600' : 'text-emerald-700'}`}>Margen {margin.toFixed(1)}%</span>
                                                )}
                                                <span className={`text-sm font-black ${lineDelta(line) < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(lineDelta(line))}</span>
                                            </div>
                                        </div>
                                        {unitsToCancel(line).filter((u: any) => IN_PRODUCTION.includes(u.production_status)).map((unit: any) => (
                                            <div key={unit.id} className="flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                                                <span className="text-xs font-bold text-amber-800 flex-1">{unit.custom_name} ya está en producción: ¿qué pasa con su material?</span>
                                                <div className="w-48">
                                                    <SearchableSelect items={DISPOSITIONS} getLabel={(d) => d.label} getValue={(d) => d.value}
                                                        value={line.reversal_dispositions?.[String(unit.id)] ?? ''} disabled={!editable}
                                                        onChange={(v) => setDisposition(index, unit.id, v)} placeholder="Elegir destino" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Anticipo %</label>
                                    <Input type="number" min={0} max={100} className="text-right" value={advancePercent} disabled={!editable}
                                        onChange={(e) => setAdvancePercent(Number(e.target.value))} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas de Dirección</label>
                                    <Input value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                                <div><p className="text-[10px] font-bold text-slate-400 uppercase">Total actual</p><p className="font-black">{money(Number(order.total_price || 0))}</p></div>
                                <div><p className="text-[10px] font-bold text-slate-400 uppercase">Cambio (sin IVA)</p><p className={`font-black ${delta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(delta)}</p></div>
                                <div><p className="text-[10px] font-bold text-slate-400 uppercase">Total nuevo</p><p className="font-black text-indigo-700">{money(newTotal)}</p></div>
                            </div>
                        </div>
                        {editable && (
                            <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between gap-3">
                                <button type="button" disabled={saving} onClick={() => setPendingAction({ kind: 'REQUEST_CHANGES', quotation: change })}
                                    className="px-4 py-2 text-sm font-bold text-orange-700 border border-orange-200 hover:bg-orange-50 rounded-lg disabled:opacity-50">
                                    Regresar para cambios
                                </button>
                                <button type="button" disabled={saving || missingDisposition} onClick={() => void authorize()}
                                    title={missingDisposition ? 'Elige el destino del material de las unidades en producción' : 'Autorizar'}
                                    className="px-5 py-2 text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                                    {saving ? 'Autorizando...' : 'Autorizar orden de cambio'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
            <QuotationActionDialogs pending={pendingAction} onClose={() => setPendingAction(null)}
                onDone={async () => { await onDone(); onClose(); }} />
        </>
    );
};

export default ChangeOrderReviewModal;
