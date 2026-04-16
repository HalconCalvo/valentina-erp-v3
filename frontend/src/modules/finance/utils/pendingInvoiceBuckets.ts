import type { SalesOrder } from '../../../types/sales';

/** Igual que en API/UI: comparar siempre en mayúsculas. */
export function normalizeOrderStatus(order: SalesOrder): string {
  return String(order.status ?? '').toUpperCase().trim();
}

export const STATUS_WAITING_ADVANCE = 'WAITING_ADVANCE';

/** OVs con actividad post–primer anticipo: saldo de contrato pendiente de facturar (tarjeta B). */
export const BILLABLE_CONTRACT_STATUSES = new Set([
  'SOLD',
  'IN_PRODUCTION',
  'INSTALLED',
  'FINISHED',
  'COMPLETED',
]);

/** Suma facturado según CXC (importe de facturas emitidas). Alineado con PendingToInvoice / Rayos X. */
export function totalInvoicedFromPayments(order: SalesOrder): number {
  if (!order.payments?.length) return 0;
  return order.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export type ContractInstallmentRow = SalesOrder & {
  clientName: string;
  totalOrder: number;
  totalInvoiced: number;
  pendingToInvoice: number;
};

/** Filas para tabla “saldo de contrato” — misma regla que tarjeta B en ReceivablesModule. */
export function buildContractInstallmentRows(
  orders: SalesOrder[],
  getClientName: (o: SalesOrder) => string
): ContractInstallmentRow[] {
  return orders
    .filter((o) => BILLABLE_CONTRACT_STATUSES.has(normalizeOrderStatus(o)))
    .map((order) => {
      const totalOrder = Number(order.total_price) || 0;
      const totalInvoiced = totalInvoicedFromPayments(order);
      let pendingToInvoice = totalOrder - totalInvoiced;
      if (pendingToInvoice < 0.1) pendingToInvoice = 0;
      return {
        ...order,
        clientName: getClientName(order),
        totalOrder,
        totalInvoiced,
        pendingToInvoice,
      };
    })
    .filter((o) => o.pendingToInvoice > 0);
}

export type WaitingAdvanceRow = SalesOrder & {
  clientName: string;
  /** Monto del primer anticipo aún por cubrir (esperado − ya facturado en CXC). */
  pendingAdvance: number;
};

/** OVs esperando primer anticipo (tarjeta A en Cobranzas). */
export function buildWaitingAdvanceRows(
  orders: SalesOrder[],
  getClientName: (o: SalesOrder) => string
): WaitingAdvanceRow[] {
  return orders
    .filter((o) => normalizeOrderStatus(o) === STATUS_WAITING_ADVANCE)
    .map((order) => {
      const totalOrder = Number(order.total_price) || 0;
      const pct = (Number(order.advance_percent) || 60) / 100;
      const expectedFirst = totalOrder * pct;
      const invoiced = totalInvoicedFromPayments(order);
      const pendingAdvance = Math.max(0, expectedFirst - invoiced);
      return {
        ...order,
        clientName: getClientName(order),
        pendingAdvance,
      };
    })
    .filter((o) => o.pendingAdvance > 0.01);
}
