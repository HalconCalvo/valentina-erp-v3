import { describe, expect, it } from 'vitest';
import { isCancelledOrder } from '../modules/sales/utils/orderStatus';
import { SalesOrderStatus } from '../types/sales';

describe('isCancelledOrder', () => {
    it('keeps an order waiting for advance after a change order is requested', () => {
        expect(isCancelledOrder({ status: SalesOrderStatus.WAITING_ADVANCE })).toBe(false);
        expect(isCancelledOrder({ status: SalesOrderStatus.SOLD })).toBe(false);
    });

    it('hides cancelled orders', () => {
        expect(isCancelledOrder({ status: SalesOrderStatus.CANCELLED_OV })).toBe(true);
        expect(isCancelledOrder({ status: SalesOrderStatus.CANCELLED })).toBe(true);
        expect(isCancelledOrder(null)).toBe(false);
    });
});
