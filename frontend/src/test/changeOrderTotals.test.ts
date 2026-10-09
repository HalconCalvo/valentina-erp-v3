import { describe, expect, it } from 'vitest';
import { computeChangeOrderTotals } from '../modules/sales/utils/changeOrderTotals';

describe('computeChangeOrderTotals', () => {
    it('uses the order tax rate even when every line was cancelled (subtotal 0)', () => {
        const totals = computeChangeOrderTotals({ subtotal: 0, total_price: 0, tax_rate_value: 0.16 }, 10000, 60);
        expect(totals.deltaTax).toBeCloseTo(1600);
        expect(totals.deltaWithTax).toBeCloseTo(11600);
        expect(totals.newTotal).toBeCloseTo(11600);
        expect(totals.advance).toBeCloseTo(6960);
    });

    it('zero-rate orders have no tax on the change', () => {
        const totals = computeChangeOrderTotals({ subtotal: 15000, total_price: 15000, tax_rate_value: 0 }, 15000);
        expect(totals.deltaTax).toBe(0);
        expect(totals.newTotal).toBe(30000);
        expect(totals.advance).toBeNull();
    });

    it('negative changes keep their sign with tax', () => {
        const totals = computeChangeOrderTotals({ subtotal: 20000, total_price: 23200, tax_rate_value: 0.16 }, -5000);
        expect(totals.deltaWithTax).toBeCloseTo(-5800);
        expect(totals.newTotal).toBeCloseTo(17400);
    });
});
