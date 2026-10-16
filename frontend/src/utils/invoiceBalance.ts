/** Fields of a customer invoice (CxC) needed for its open balance. */
export interface InvoiceBalanceFields {
  amount?: number | null;
  amortized_advance?: number | null;
  status?: string | null;
  installments?: Array<{ amount?: number | null; is_cancelled?: boolean | null }> | null;
}

/**
 * H47: what the client still owes on an invoice, as CxC computes it: amount − advance amortized − active payments.
 * Credit notes are not in the order payload; screens that need them use the server balance.
 */
export function invoiceOpenBalance(cxc: InvoiceBalanceFields): number {
  const status = String(cxc.status ?? '').toUpperCase();
  if (status === 'PAID' || status === 'CANCELLED') return 0;
  const paid = (cxc.installments ?? [])
    .filter((inst) => !inst.is_cancelled)
    .reduce((sum, inst) => sum + Number(inst.amount || 0), 0);
  const balance = Number(cxc.amount || 0) - Number(cxc.amortized_advance || 0) - paid;
  return balance > 0.01 ? Math.round(balance * 100) / 100 : 0;
}
