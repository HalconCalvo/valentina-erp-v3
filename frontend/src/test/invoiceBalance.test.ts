import { describe, expect, it } from 'vitest';
import { invoiceOpenBalance } from '@/utils/invoiceBalance';

describe('invoiceOpenBalance (H47)', () => {
  it('subtracts the amortized advance and the payments, like CxC', () => {
    const invoice = { amount: 18411.01, amortized_advance: 11046.61, status: 'PENDING', installments: [] };
    expect(invoiceOpenBalance(invoice)).toBe(7364.4);
    expect(invoiceOpenBalance({ ...invoice, installments: [{ amount: 7364.4 }] })).toBe(0);
    expect(invoiceOpenBalance({ ...invoice, installments: [{ amount: 7364.4, is_cancelled: true }] })).toBe(7364.4);
  });

  it('is zero for paid or cancelled invoices', () => {
    expect(invoiceOpenBalance({ amount: 100, status: 'PAID' })).toBe(0);
    expect(invoiceOpenBalance({ amount: 100, status: 'CANCELLED' })).toBe(0);
  });
});
