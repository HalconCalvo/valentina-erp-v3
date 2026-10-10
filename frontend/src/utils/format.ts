/** Single display formats for the whole system (docs/GUIA_PANTALLAS.md §7). */

const MONEY = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const AMOUNT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const BUSINESS_TZ = 'America/Merida';

const isNumber = (value: number | null | undefined): value is number =>
    value !== null && value !== undefined && Number.isFinite(value);

/** $1,234.56 and -$60.00 (never $-60.00). */
export const formatMoney = (value: number | null | undefined): string => MONEY.format(isNumber(value) ? value : 0);

/** 1,234.56 without the currency sign (columns whose header already says $). */
export const formatAmount = (value: number | null | undefined): string => AMOUNT.format(isNumber(value) ? value : 0);

/** Quantities: up to 4 decimals, no trailing zeros. */
export const formatQty = (value: number | null | undefined): string => QTY.format(isNumber(value) ? value : 0);

export { formatPercent } from '@/modules/sales/utils/margins';

/** The backend stores naive UTC timestamps; a plain YYYY-MM-DD is a calendar date. */
const toDate = (value: string | Date): Date | null => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z`
        : /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
};

const parts = (date: Date, withTime: boolean) => new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
}).formatToParts(date).reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});

/** DD/MM/AAAA in Mérida time. */
export const formatDate = (value: string | Date | null | undefined): string => {
    const date = value ? toDate(value) : null;
    if (!date) return '—';
    const p = parts(date, false);
    return `${p.day}/${p.month}/${p.year}`;
};

/** DD/MM/AAAA HH:MM (24 h) in Mérida time. */
export const formatDateTime = (value: string | Date | null | undefined): string => {
    const date = value ? toDate(value) : null;
    if (!date) return '—';
    const p = parts(date, true);
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};
