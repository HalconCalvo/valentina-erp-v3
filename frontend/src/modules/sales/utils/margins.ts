/**
 * The two margin figures used across the system (same rules as backend margin_service).
 * The seller earns commission = c × sale price without tax (same as the commission really paid).
 * - Price = cost × (1 + markup) ÷ (1 − c); price without commission = price × (1 − c).
 * - Sobreprecio % (sets the price) = (price × (1 − c) − cost) / cost.
 * - Margen neto % sobre venta (analysis, after commission) = (price without tax − cost − commission) / price without tax.
 * Percent values; prices never include tax; commission rate accepted as 0.05 or 5.
 */
export const DEFAULT_MIN_MARKUP = 25;

export const normalizeRate = (rate?: number | null): number => {
    const value = Number(rate) || 0;
    return value > 1 ? value / 100 : value;
};

/** Sobreprecio %, or null when there is no cost. */
export function markupPercent(salesWithoutTax: number, cost: number, commissionRate?: number | null): number | null {
    if (!(cost > 0)) return null;
    const withoutCommission = salesWithoutTax * (1 - normalizeRate(commissionRate));
    return ((withoutCommission - cost) / cost) * 100;
}

/** Seller commission: c × sale price without tax. */
export const includedCommission = (salesWithoutTax: number, commissionRate?: number | null): number =>
    salesWithoutTax * normalizeRate(commissionRate);

/** Margen neto % sobre venta (después de comisión), or null without sales. */
export function netMarginPercent(salesWithoutTax: number, cost: number, commission: number): number | null {
    if (!(salesWithoutTax > 0)) return null;
    return ((salesWithoutTax - cost - commission) / salesWithoutTax) * 100;
}

/** Price that gives a markup (in percent) once the commission (c × price) is paid: cost × (1 + markup) ÷ (1 − c). */
export const priceFromMarkup = (cost: number, markup: number, commissionRate?: number | null): number =>
    (cost * (1 + (Number(markup) || 0) / 100)) / (1 - normalizeRate(commissionRate));

/** Markup stored as 0.45 or 45 → 45. Config (target_profit_margin) is a fraction. */
export const markupAsPercent = (value?: number | null): number => {
    const v = Number(value) || 0;
    return v > 0 && v <= 1 ? v * 100 : v;
};

export const isBelowMinimum = (markup: number | null | undefined, minimum: number = DEFAULT_MIN_MARKUP): boolean =>
    markup !== null && markup !== undefined && markup < minimum;

export const formatPercent = (value: number | null | undefined): string =>
    value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}%`;
