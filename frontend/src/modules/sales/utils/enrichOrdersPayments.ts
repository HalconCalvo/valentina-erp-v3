import { salesService } from '../../../api/sales-service';
import { SalesOrder } from '../../../types/sales';

const detailCache = new Map<number, { at: number; order: SalesOrder }>();
const DETAIL_TTL_MS = 45_000;

function currentRole(): string {
    return (localStorage.getItem('user_role') || '').toUpperCase().trim();
}

function isSellerLikeRole(): boolean {
    return ['SALES', 'VENTAS'].includes(currentRole());
}

function orderHasPendingInList(o: SalesOrder): boolean {
    const p = (o as unknown as { payments?: { status?: string }[] }).payments;
    if (!Array.isArray(p)) return false;
    return p.some((x) => String(x?.status ?? '').toUpperCase() === 'PENDING');
}

export function listHasAnyPendingCxc(orders: SalesOrder[]): boolean {
    return orders.some(orderHasPendingInList);
}

function orderNeedsDetailHydration(o: SalesOrder, sellerLike: boolean): boolean {
    const p = (o as unknown as { payments?: unknown[] }).payments;
    if (!Array.isArray(p) || p.length === 0) return true;
    if (orderHasPendingInList(o)) return false;
    // Listado con pagos pero sin PENDING: en rol vendedor el API suele omitir CXC pendientes.
    return sellerLike;
}

async function getDetailCached(orderId: number, now: number, fallback: SalesOrder): Promise<SalesOrder> {
    const hit = detailCache.get(orderId);
    if (hit && now - hit.at < DETAIL_TTL_MS) {
        return hit.order;
    }
    const d = await salesService.getOrderDetail(orderId).catch(() => null);
    if (!d) return fallback;
    detailCache.set(orderId, { at: now, order: d });
    return d;
}

/**
 * Órdenes que aparecen en comisiones pero no en el listado de getOrders (p. ej. filtros de rol).
 */
async function fetchOrdersMissingFromList(existing: SalesOrder[], now: number): Promise<SalesOrder[]> {
    const haveIds = new Set(existing.map((o) => o.id).filter((id): id is number => id != null));
    try {
        const comms = await salesService.getCommissions();
        const candidateIds = [
            ...new Set(
                comms
                    .map((c) => c.sales_order_id)
                    .filter((id): id is number => id != null && !haveIds.has(id))
            ),
        ];
        if (candidateIds.length === 0) return [];
        const extras = await Promise.all(
            candidateIds.map((id) => getDetailCached(id, now, { id } as SalesOrder))
        );
        return extras.filter((o) => o.id != null);
    } catch {
        return [];
    }
}

/**
 * Hidrata `payments` vía GET /sales/orders/:id cuando el listado es incompleto (muy frecuente en rol Ventas).
 * Si tras hidratar no hay ningún PENDING, intenta incorporar OVs referenciadas en comisiones del vendedor.
 */
export async function enrichSalesOrdersWithPaymentsWhenMissing(orders: SalesOrder[]): Promise<SalesOrder[]> {
    const now = Date.now();
    const sellerLike = isSellerLikeRole();

    if (orders.length === 0) {
        if (sellerLike) {
            const extra = await fetchOrdersMissingFromList([], now);
            return extra;
        }
        return orders;
    }

    const hydrated = await Promise.all(
        orders.map(async (o) => {
            if (o.id == null) return o;
            if (!orderNeedsDetailHydration(o, sellerLike)) return o;
            return getDetailCached(o.id, now, o);
        })
    );

    let combined = hydrated;
    if (sellerLike && !listHasAnyPendingCxc(hydrated)) {
        const extra = await fetchOrdersMissingFromList(hydrated, now);
        if (extra.length > 0) {
            combined = [...hydrated, ...extra];
        }
    }

    return Array.from(new Map(combined.map((o) => [o.id, o])).values()).filter((o) => o.id != null) as SalesOrder[];
}
