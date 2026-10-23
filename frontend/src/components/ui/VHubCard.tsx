import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';

/** Accent of a hub card: border, side column and icon share it (guide v2 §12; Compras hub, tanda 1). */
export type VHubCardTone = 'indigo' | 'emerald' | 'red' | 'amber' | 'slate' | 'violet' | 'blue';

const TONES: Record<VHubCardTone, { border: string; side: string; text: string; icon: string }> = {
    indigo: { border: 'border-l-indigo-500', side: 'bg-indigo-50 text-indigo-700 border-indigo-100 group-hover:bg-indigo-100', text: 'text-indigo-600', icon: 'text-indigo-500' },
    emerald: { border: 'border-l-emerald-500', side: 'bg-emerald-50 text-emerald-700 border-emerald-100 group-hover:bg-emerald-100', text: 'text-emerald-600', icon: 'text-emerald-500' },
    red: { border: 'border-l-red-500', side: 'bg-red-50 text-red-700 border-red-100 group-hover:bg-red-100', text: 'text-red-600', icon: 'text-red-500' },
    amber: { border: 'border-l-amber-500', side: 'bg-amber-50 text-amber-700 border-amber-100 group-hover:bg-amber-100', text: 'text-amber-600', icon: 'text-amber-500' },
    slate: { border: 'border-l-slate-400', side: 'bg-slate-50 text-slate-600 border-slate-200 group-hover:bg-slate-100', text: 'text-slate-700', icon: 'text-slate-500' },
    violet: { border: 'border-l-violet-500', side: 'bg-violet-50 text-violet-700 border-violet-100 group-hover:bg-violet-100', text: 'text-violet-600', icon: 'text-violet-500' },
    blue: { border: 'border-l-blue-500', side: 'bg-blue-50 text-blue-700 border-blue-100 group-hover:bg-blue-100', text: 'text-blue-600', icon: 'text-blue-500' },
};

interface VHubCardProps {
    /** Small label on top, e.g. "3. Cuentas por cobrar" (hub numbers stay, Gabriel 23/10). */
    label: string;
    /** Big title: what the card opens. */
    title: string;
    /** Bottom line: the figure or a short description. */
    footer: React.ReactNode;
    icon: LucideIcon;
    /** Side column: a count, or an icon when there is no count. */
    side: React.ReactNode;
    tone: VHubCardTone;
    onClick: () => void;
    /** Ring that calls attention (e.g. pending tasks). */
    highlight?: boolean;
}

/** Navigation card of a hub: label, title and figure below (same format as Comisiones / Compras). */
export const VHubCard: React.FC<VHubCardProps> = ({ label, title, footer, icon: Icon, side, tone, onClick, highlight = false }) => {
    const t = TONES[tone];
    const sideText = typeof side === 'number' ? (String(side).length > 3 ? 'text-xl' : String(side).length === 3 ? 'text-2xl' : 'text-3xl') : '';
    return (
        <div className="w-full relative h-40">
            <Card
                onClick={onClick}
                className={`p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 ${t.border} transform hover:-translate-y-1 h-full bg-white overflow-hidden group ${highlight ? 'ring-2 ring-amber-100' : ''}`}
            >
                <div className={`absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black transition-colors ${t.side} ${sideText}`}>
                    {side}
                </div>
                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                    <div className="flex justify-between items-start gap-2">
                        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest truncate">{label}</p>
                        <Icon size={16} className={`${t.icon} shrink-0`} />
                    </div>
                    <div className="flex justify-end">
                        <div className={`text-2xl font-black tracking-tight leading-none truncate ${t.text}`}>{title}</div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase truncate tabular-nums">{footer}</p>
                    </div>
                </div>
            </Card>
        </div>
    );
};
