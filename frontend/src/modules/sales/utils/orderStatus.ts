import type { SalesOrder } from '../../../types/sales';

const CANCELLED_ORDER_STATUSES = ['CANCELLED_OV', 'CANCELLED'];

/** An order leaves the operational monitor only when it is really cancelled (not because Rayos X changed it). */
export const isCancelledOrder = (order: Pick<SalesOrder, 'status'> | null | undefined): boolean =>
    Boolean(order && CANCELLED_ORDER_STATUSES.includes(String(order.status)));
