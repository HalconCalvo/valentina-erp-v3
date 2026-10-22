/** Figures of a reception with one supplier invoice for several POs (Gabriel 22/10). Same rules as the server:
 *  IVA once over everything received, minus the advances already paid of those POs. */

export type ReceptionLine = { po: any; item: any; qty: string; price: string };

export const linePending = (item: any): number =>
    Math.max(Number(item.qty || 0) - Number(item.quantity_received || 0), 0);

export const lineIsOpen = (item: any): boolean =>
    !item.is_cancelled && !item.is_fulfilled && linePending(item) > 0;

export const linePrice = (item: any): number => Number(item.unit_price || item.expected_cost || item.price || 0);

const cents = (value: number): number => Math.round(value * 100) / 100;

export function invoiceSummary(lines: ReceptionLine[], taxRate: number, orders: any[], invoiceTotal: number) {
    const subtotal = cents(lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
    const total = cents(subtotal * (1 + taxRate));
    const advances = cents(orders.reduce((sum, po) => sum + Number(po.advance_paid || 0), 0));
    const balance = cents(total - advances);
    const tolerance = Math.max(total * 0.005, 1);
    return {
        subtotal,
        tax: cents(total - subtotal),
        total,
        advances,
        toPay: Math.max(balance, 0),
        inFavor: Math.max(-balance, 0),
        mismatch: invoiceTotal > 0 && total > 0 && Math.abs(total - invoiceTotal) > tolerance,
    };
}
