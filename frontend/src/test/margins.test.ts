import { describe, expect, it } from 'vitest';
import {
    includedCommission, isBelowMinimum, markupAsPercent, markupPercent, netMarginPercent, priceFromMarkup,
} from '../modules/sales/utils/margins';

describe('margins', () => {
    it('sobreprecio removes the commission before comparing with cost', () => {
        const price = priceFromMarkup(1000, 45, 5); // 1000 × 1.45 × 1.05
        expect(price).toBeCloseTo(1522.5);
        expect(markupPercent(price, 1000, 0.05)).toBeCloseTo(45);
        expect(markupPercent(100, 0, 0.05)).toBeNull();
    });

    it('margen neto sobre venta is after commission and without tax', () => {
        const sales = 1522.5;
        const commission = includedCommission(sales, 0.05);
        expect(commission).toBeCloseTo(72.5);
        expect(netMarginPercent(sales, 1000, commission)).toBeCloseTo(((1522.5 - 1000 - 72.5) / 1522.5) * 100);
        expect(netMarginPercent(0, 10, 0)).toBeNull();
    });

    it('minimum markup and stored values', () => {
        expect(isBelowMinimum(24.99, 25)).toBe(true);
        expect(isBelowMinimum(25, 25)).toBe(false);
        expect(isBelowMinimum(null, 25)).toBe(false);
        expect(markupAsPercent(0.45)).toBe(45);
        expect(markupAsPercent(45)).toBe(45);
    });
});
