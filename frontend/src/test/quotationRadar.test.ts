import { describe, expect, it } from 'vitest';
import { isExpiringQuotation } from '../modules/sales/utils/quotationRadar';

const today = new Date(2026, 9, 9, 10, 0, 0);
const inDays = (days: number) => new Date(2026, 9, 9 + days, 12, 0, 0).toISOString();

describe('Radar de Vigencia', () => {
    it('counts open quotations that expire today or within the next 15 days', () => {
        expect(isExpiringQuotation({ status: 'AUTHORIZED', valid_until: inDays(0) }, today)).toBe(true);
        expect(isExpiringQuotation({ status: 'DRAFT', valid_until: inDays(15) }, today)).toBe(true);
        expect(isExpiringQuotation({ status: 'PENDING_AUTH', valid_until: inDays(7) }, today)).toBe(true);
    });

    it('does not count expired, already past, far or closed quotations', () => {
        expect(isExpiringQuotation({ status: 'EXPIRED', valid_until: inDays(3) }, today)).toBe(false);
        expect(isExpiringQuotation({ status: 'DRAFT', valid_until: inDays(-30) }, today)).toBe(false);
        expect(isExpiringQuotation({ status: 'AUTHORIZED', valid_until: inDays(16) }, today)).toBe(false);
        expect(isExpiringQuotation({ status: 'CONVERTED', valid_until: inDays(2) }, today)).toBe(false);
        expect(isExpiringQuotation({ status: 'LOST', valid_until: inDays(2) }, today)).toBe(false);
    });
});
