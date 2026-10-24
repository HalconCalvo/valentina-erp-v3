import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    businessDaysFromToday, businessToday, formatAmount, formatDate, formatDateTime, formatMoney, formatQty, toBusinessYmd,
} from '@/utils/format';

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
    it('toBusinessYmd gives the Mérida calendar day of a UTC timestamp', () => {
        expect(toBusinessYmd('2026-10-09T03:12:00')).toBe('2026-10-08');
        expect(toBusinessYmd('2026-10-09T18:12:00')).toBe('2026-10-09');
        expect(toBusinessYmd(null)).toBe('');
    });

    it('a calendar date is never shown a day earlier (invoice 231 of ZENARA, imported at midnight)', () => {
        expect(formatDate('2025-04-21')).toBe('21/04/2025');
        expect(formatDate('2025-04-21T00:00:00')).toBe('21/04/2025');
        expect(toBusinessYmd('2025-04-21T00:00:00')).toBe('2025-04-21');
        expect(formatDate('2025-04-21T00:00:00.123456')).toBe('20/04/2025'); // a real timestamp keeps its time zone
    });

    describe('today in Mérida', () => {
        afterEach(() => vi.useRealTimers());

        it('at 18:30 Mérida (00:30 UTC of the next day) the suggested date is still today', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-10-24T00:30:00Z'));
            expect(businessToday()).toBe('2026-10-23');
            expect(businessDaysFromToday(15)).toBe('2026-11-07');
            expect(businessDaysFromToday(-1)).toBe('2026-10-22');
        });

        it('in the morning it is the same day as UTC', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-10-23T14:00:00Z'));
            expect(businessToday()).toBe('2026-10-23');
        });
    });
});
