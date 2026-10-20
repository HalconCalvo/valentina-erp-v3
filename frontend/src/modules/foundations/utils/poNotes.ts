import { formatDate, formatDateTime } from '@/utils/format';

/** Who and when of an OC (Gabriel 20/10): "Creada el DD/MM/AAAA por X" and "Autorizada por X el DD/MM/AAAA HH:MM". */
type PoDates = {
    created_at?: string | null;
    created_by_name?: string | null;
    authorized_at?: string | null;
    authorized_by_name?: string | null;
    authorized_by?: string | null;
};

export function poCreatedNote(po: PoDates): string | undefined {
    if (!po.created_at) return undefined;
    return `Creada el ${formatDate(po.created_at)}${po.created_by_name ? ` por ${po.created_by_name}` : ''}`;
}

/** Only the name when an old OC has no authorization date. */
export function poAuthorizedNote(po: PoDates): string | undefined {
    const name = po.authorized_by_name || po.authorized_by;
    if (!name) return undefined;
    return `Autorizada por ${name}${po.authorized_at ? ` el ${formatDateTime(po.authorized_at)}` : ''}`;
}
