import { describe, expect, it } from 'vitest';
import {
    includedCommission, isBelowMinimum, markupAsPercent, markupPercent, netMarginPercent, priceFromMarkup,
} from '../modules/sales/utils/margins';

describe('margins', () => {
    it('price = cost × (1 + markup) ÷ (1 − c) and sobreprecio uses price × (1 − c)', () => {
        const price = priceFromMarkup(1000, 45, 5); // 1450 / 0.95
        expect(price).toBeCloseTo(1526.3158, 3);
        expect(markupPercent(price, 1000, 0.05)).toBeCloseTo(45);
        expect(markupPercent(price, 1000, 5)).toBeCloseTo(45);
        expect(markupPercent(100, 0, 0.05)).toBeNull();
    });

    it('commission = c × sale without tax; margen neto after commission', () => {
        const sales = priceFromMarkup(1000, 45, 0.05);
        const commission = includedCommission(sales, 0.05);
        expect(commission).toBeCloseTo(sales * 0.05);
        expect(netMarginPercent(sales, 1000, commission)).toBeCloseTo(((sales - 1000 - commission) / sales) * 100);
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
