import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate, formatDateTime, formatMoney, formatQty } from '@/utils/format';

describe('format', () => {
    it('money always has two decimals and the sign before $', () => {
        expect(formatMoney(1234.5)).toBe('$1,234.50');
        expect(formatMoney(-60)).toBe('-$60.00');
        expect(formatMoney(null)).toBe('$0.00');
        expect(formatAmount(15855.149)).toBe('15,855.15');
    });

    it('quantities keep up to 4 decimals', () => {
        expect(formatQty(0.5)).toBe('0.5');
        expect(formatQty(1234.56789)).toBe('1,234.5679');
    });

    it('dates are DD/MM/AAAA in Mérida time', () => {
        expect(formatDate('2026-10-01T05:59:59')).toBe('30/09/2026'); // naive UTC → cut of 30/09 23:59:59
        expect(formatDateTime('2026-10-01T05:59:59')).toBe('30/09/2026 23:59');
        expect(formatDate('2026-09-30')).toBe('30/09/2026');
        expect(formatDate(null)).toBe('—');
    });
});
