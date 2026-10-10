import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Input } from '@/components/ui/Input';

export type UnlinkedInstanceRow = {
    id: number;
    label: string;
    custom_name?: string;
    production_status: string;
};

export type UnlinkedHouseGroup = {
    street: string;
    lot: string;
    key: string;
    instances: UnlinkedInstanceRow[];
};

/** Full-payment invoices cover any instance; the rest only installed (closed or signed) ones. */
export function isInstanceSelectableForAbono(status: string, paymentType?: string): boolean {
    if (paymentType === 'FULL') return true;
    const s = String(status || '').toUpperCase();
    return s === 'CLOSED' || s === 'SIGNED';
}

const houseLabel = (house: UnlinkedHouseGroup) =>
    house.key === '__unassigned__' ? 'Sin asignar' : [house.street, house.lot].filter(Boolean).join(' ') || 'Sin asignar';

const CheckboxInput: React.FC<React.ComponentProps<typeof Input> & { indeterminate?: boolean }> = ({ indeterminate, id, ...props }) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    useEffect(() => {
        const el = document.getElementById(inputId) as HTMLInputElement | null;
        if (el) el.indeterminate = !!indeterminate;
    }, [indeterminate, inputId]);
    return <Input {...props} id={inputId} type="checkbox" />;
};

interface HouseInstancePickerProps {
    houses: UnlinkedHouseGroup[];
    paymentType?: string;
    selectedIds: number[];
    onChange: (ids: number[]) => void;
}

/** Instances an installment covers, grouped by house (street and lot), with select-all per house. */
export const HouseInstancePicker: React.FC<HouseInstancePickerProps> = ({ houses, paymentType, selectedIds, onChange }) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const toggleExpanded = (key: string) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
    });
    const toggleInstance = (id: number) =>
        onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    const toggleHouse = (selectableIds: number[], allSelected: boolean) =>
        onChange(allSelected ? selectedIds.filter((id) => !selectableIds.includes(id)) : [...new Set([...selectedIds, ...selectableIds])]);

    return (
        <div className="max-h-56 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
            {houses.map((house) => {
                const selectableIds = house.instances
                    .filter((inst) => isInstanceSelectableForAbono(inst.production_status, paymentType))
                    .map((inst) => inst.id);
                const selectedCount = selectableIds.filter((id) => selectedIds.includes(id)).length;
                const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length;
                const isExpanded = expanded.has(house.key);
                return (
                    <div key={house.key} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2">
                            <button type="button" onClick={() => toggleExpanded(house.key)}
                                className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0"
                                title={isExpanded ? 'Contraer casa' : 'Expandir casa'} aria-label={isExpanded ? 'Contraer casa' : 'Expandir casa'}>
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                <CheckboxInput className="w-4 h-4 rounded border-slate-300 shrink-0" checked={allSelected}
                                    indeterminate={selectedCount > 0 && !allSelected} disabled={selectableIds.length === 0}
                                    onChange={() => toggleHouse(selectableIds, allSelected)} />
                                <span className="text-sm font-bold text-slate-700 truncate">{houseLabel(house)}</span>
                            </label>
                        </div>
                        {isExpanded && (
                            <div className="border-t border-slate-100 px-3 py-2 space-y-1.5 bg-slate-50/80">
                                {house.instances.map((inst) => {
                                    const selectable = isInstanceSelectableForAbono(inst.production_status, paymentType);
                                    return (
                                        <label key={inst.id} title={selectable ? undefined : 'No está instalada'}
                                            className={`flex items-start gap-2 text-sm ${selectable ? 'text-slate-700 cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
                                            <Input type="checkbox" className="mt-0.5 w-4 h-4 rounded border-slate-300 shrink-0"
                                                checked={selectedIds.includes(inst.id)} disabled={!selectable}
                                                onChange={() => { if (selectable) toggleInstance(inst.id); }} />
                                            <span className={!selectable ? 'opacity-70' : ''}>{inst.custom_name || inst.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
