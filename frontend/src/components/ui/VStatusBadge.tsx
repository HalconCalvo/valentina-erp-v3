import React from 'react';
import { cn } from '@/lib/utils';

type VStatusBadgeEntity = 'invoice' | 'order' | 'requisition' | 'oc' | 'payment';

type BadgeTone =
  | 'amber'
  | 'emerald'
  | 'slate'
  | 'blue'
  | 'indigo'
  | 'red'
  | 'purple'
  | 'teal';

interface VStatusBadgeProps {
  status: string;
  entity: VStatusBadgeEntity;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  slate: 'bg-slate-100 text-slate-500 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
};

const statusMaps: Record<VStatusBadgeEntity, Record<string, BadgeTone>> = {
  invoice: {
    PENDING: 'amber',
    PAID: 'emerald',
    CANCELLED: 'slate',
  },
  oc: {
    DRAFT: 'slate',
    AUTORIZADA: 'blue',
    ENVIADA: 'indigo',
    RECIBIDA_PARCIAL: 'amber',
    RECIBIDA_TOTAL: 'emerald',
    CANCELADA: 'red',
  },
  requisition: {
    PENDIENTE: 'amber',
    APLAZADA: 'slate',
    PROCESADA: 'emerald',
    CANCELADA: 'red',
  },
  order: {
    DRAFT: 'slate',
    ACCEPTED: 'blue',
    WAITING_ADVANCE: 'amber',
    SOLD: 'indigo',
    IN_PRODUCTION: 'purple',
    FINISHED: 'teal',
    COMPLETED: 'emerald',
    CANCELLED: 'red',
  },
  payment: {
    PENDING: 'amber',
    APPROVED: 'blue',
    EXECUTED: 'emerald',
    REJECTED: 'red',
    CANCELLED: 'slate',
  },
};

export const VStatusBadge: React.FC<VStatusBadgeProps> = ({
  status,
  entity,
  className,
}) => {
  const normalizedStatus = status.trim().toUpperCase();
  const tone = statusMaps[entity][normalizedStatus] ?? 'slate';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
        toneClasses[tone],
        className,
      )}
    >
      {status}
    </span>
  );
};
