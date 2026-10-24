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

/** A calendar date with no time: YYYY-MM-DD, or a naive midnight (date-only fields imported as 00:00:00, e.g. invoice dates). */
const CALENDAR_DATE = /^(\d{4}-\d{2}-\d{2})(?:[T ]00:00:00(?:\.0+)?)?$/;

/** The backend stores naive UTC timestamps; a calendar date is shown as is (never shifted a day by the time zone). */
const toDate = (value: string | Date): Date | null => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const calendar = CALENDAR_DATE.exec(value);
    const text = calendar ? `${calendar[1]}T12:00:00Z`
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

/** YYYY-MM-DD of the Mérida calendar day (to compare with date filters); '' without a date. */
export const toBusinessYmd = (value: string | Date | null | undefined): string => {
    const date = value ? toDate(value) : null;
    if (!date) return '';
    const p = parts(date, false);
    return `${p.year}-${p.month}-${p.day}`;
};

/** Today's YYYY-MM-DD in Mérida (default of date inputs; never the UTC day, which is tomorrow after 18:00). */
export const businessToday = (): string => toBusinessYmd(new Date());

/** YYYY-MM-DD of the Mérida day `days` after today (negative = before). */
export const businessDaysFromToday = (days: number): string => {
    const [year, month, day] = businessToday().split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

/** DD/MM/AAAA HH:MM (24 h) in Mérida time. */
export const formatDateTime = (value: string | Date | null | undefined): string => {
    const date = value ? toDate(value) : null;
    if (!date) return '—';
    const p = parts(date, true);
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
    ADVANCE: 'Anticipo',
    PROGRESS: 'Avance',
    FULL: '100% Contrato',
    SETTLEMENT: 'Finiquito',
};

/** Customer invoice type in Spanish (H8: never "ADVANCE"). */
export const formatInvoiceType = (type: string | null | undefined): string => {
    const key = String(type ?? '').toUpperCase();
    return INVOICE_TYPE_LABELS[key] ?? (type || '—');
};
