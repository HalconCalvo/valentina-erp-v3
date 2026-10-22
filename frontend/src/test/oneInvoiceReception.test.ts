import { describe, expect, it } from 'vitest';
import { invoiceSummary, lineIsOpen } from '@/modules/foundations/utils/oneInvoiceReception';

const line = (qty: string, price: string) => ({ po: {}, item: {}, qty, price });

describe('one invoice for several POs', () => {
    it('Xaze 300490: IVA once gives the invoice exactly and the prepaid advance is subtracted', () => {
        const lines = [line('1', '923.58'), line('1', '923.58'), line('1', '923.58')];
        const summary = invoiceSummary(lines, 0.16, [{ advance_paid: 0 }, { advance_paid: 0 }, { advance_paid: 1073 }],
            3214.06);
        expect(summary).toMatchObject({ subtotal: 2770.74, tax: 443.32, total: 3214.06, toPay: 2141.06, inFavor: 0,
            mismatch: false });
    });

    it('shows what stays in favour when the advances cover more than the invoice', () => {
        const summary = invoiceSummary([line('1', '923.58')], 0.16, [{ advance_paid: 1073 }], 1071.35);
        expect(summary).toMatchObject({ total: 1071.35, toPay: 0, inFavor: 1.65 });
    });

    it('warns when the invoice amount does not match what was received', () => {
        expect(invoiceSummary([line('2', '100')], 0.16, [], 300).mismatch).toBe(true);
    });

    it('only open lines with something pending are received', () => {
        expect(lineIsOpen({ qty: 5, quantity_received: 5 })).toBe(false);
        expect(lineIsOpen({ qty: 5, quantity_received: 1, is_fulfilled: true })).toBe(false);
        expect(lineIsOpen({ qty: 5, quantity_received: 1 })).toBe(true);
    });
});
