import type { SalesOrder } from '../../../types/sales';

export interface ChangeOrderTotals {
    delta: number;
    deltaTax: number;
    deltaWithTax: number;
    currentTotal: number;
    newTotal: number;
    advance: number | null;
}

/** Figures of a change order. The tax rate is the order's own rate (never deduced from its amounts:
 *  an order whose lines were all cancelled has subtotal 0 but still its 16%). */
export function computeChangeOrderTotals(
    order: Pick<SalesOrder, 'subtotal' | 'total_price' | 'tax_rate_value'>,
    delta: number,
    advancePercent?: number,
): ChangeOrderTotals {
    const rate = Number(order.tax_rate_value ?? 0);
    const deltaTax = delta * rate;
    const newTotal = (Number(order.subtotal || 0) + delta) * (1 + rate);
    return {
        delta,
        deltaTax,
        deltaWithTax: delta + deltaTax,
        currentTotal: Number(order.total_price || 0),
        newTotal,
        advance: advancePercent === undefined ? null : (newTotal * advancePercent) / 100,
    };
}
