import { Ban, Eye, Pencil, XCircle } from 'lucide-react';

/** Íconos estándar para acciones en tablas (requieren contenedor con className `group`). */
export const TABLE_ACTION_ICON_SIZE = 15;

const editViewClass = 'text-slate-500 group-hover:text-indigo-600 shrink-0';
const cancelClass = 'text-rose-400 group-hover:text-rose-600 shrink-0';
const rejectClass = 'text-orange-400 group-hover:text-orange-600 shrink-0';

export function TableActionEditIcon() {
    return <Pencil size={TABLE_ACTION_ICON_SIZE} className={editViewClass} />;
}

export function TableActionViewIcon() {
    return <Eye size={TABLE_ACTION_ICON_SIZE} className={editViewClass} />;
}

export function TableActionCancelIcon() {
    return <XCircle size={TABLE_ACTION_ICON_SIZE} className={cancelClass} />;
}

export function TableActionRejectIcon() {
    return <Ban size={TABLE_ACTION_ICON_SIZE} className={rejectClass} />;
}
