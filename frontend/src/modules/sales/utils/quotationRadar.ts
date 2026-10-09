import type { Quotation } from '../../../types/quotations';

export const RADAR_DAYS = 15;
const OPEN_STATUSES = ['DRAFT', 'CHANGES_REQUESTED', 'PENDING_AUTH', 'AUTHORIZED'];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Radar de Vigencia: a valid open quotation whose validity ends between today and the next RADAR_DAYS days.
 *  Already expired ones are not counted (they live in Historial with "Renovar"). */
export function isExpiringQuotation(q: Pick<Quotation, 'status' | 'valid_until'>, today: Date = new Date(), days = RADAR_DAYS): boolean {
    if (!q.valid_until || !OPEN_STATUSES.includes(q.status)) return false;
    const start = startOfDay(today);
    const limit = new Date(start);
    limit.setDate(limit.getDate() + days + 1);
    const validUntil = new Date(q.valid_until);
    return validUntil >= start && validUntil < limit;
}
