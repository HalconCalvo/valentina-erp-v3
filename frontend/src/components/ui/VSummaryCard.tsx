import React from 'react';

/** KPI card (docs/GUIA_PANTALLAS.md §2). Tones carry meaning: neutral, in favor, attention, against, info, total. */
export type VSummaryTone = 'slate' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'orange' | 'total';

const TONES: Record<VSummaryTone, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    orange: 'border-orange-200 bg-orange-50 text-orange-900',
    total: 'border-slate-300 bg-slate-800 text-white',
};

interface VSummaryCardProps {
    label: string;
    value: React.ReactNode;
    tone?: VSummaryTone;
    hint?: React.ReactNode;
}

export const VSummaryCard: React.FC<VSummaryCardProps> = ({ label, value, tone = 'slate', hint }) => (
    <div className={`rounded-2xl border p-5 ${TONES[tone]}`}>
        <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs opacity-80">{hint}</p>}
    </div>
);

export default VSummaryCard;
