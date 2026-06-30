import { SalesOrder } from '../../../types/sales';

function orderHasPendingInList(o: SalesOrder): boolean {
    const p = (o as unknown as { payments?: { status?: string }[] }).payments;
    if (!Array.isArray(p)) return false;
    return p.some((x) => String(x?.status ?? '').toUpperCase() === 'PENDING');
}

export function listHasAnyPendingCxc(orders: SalesOrder[]): boolean {
    return orders.some(orderHasPendingInList);
}

/**
 * El backend ya incluye `payments` completos en el listado GET /sales/orders (mismo
 * response_model y selectinload que el detalle). Por eso ya NO hidratamos orden por orden:
 * solo deduplicamos por id. Se mantiene la firma async para no romper a los llamadores.
 */
export async function enrichSalesOrdersWithPaymentsWhenMissing(orders: SalesOrder[]): Promise<SalesOrder[]> {
    return Array.from(new Map(orders.map((o) => [o.id, o])).values())
        .filter((o) => o.id != null) as SalesOrder[];
}
