import { useQuery } from '@tanstack/react-query';
import { salesService } from '../api/sales-service';
import { loadSalesOrdersWithAdministrationAgingCxc } from '../modules/sales/utils/receivableCxcOrders';
import { InvoicingRightsRead } from '../types/sales';

export const receivablesQueryKeys = {
  salesOrders: () => ['sales-orders'] as const,
  invoicingRights: () => ['invoicing-rights'] as const,
};

export function useSalesOrders(options?: { pausePolling?: boolean }) {
  return useQuery({
    queryKey: receivablesQueryKeys.salesOrders(),
    queryFn: async () => loadSalesOrdersWithAdministrationAgingCxc(),
    staleTime: 10_000,
    refetchInterval: options?.pausePolling ? false : 15_000,
  });
}

export function useInvoicingRights() {
  return useQuery({
    queryKey: receivablesQueryKeys.invoicingRights(),
    queryFn: async (): Promise<InvoicingRightsRead | null> => {
      try {
        return await salesService.getInvoicingRights();
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });
}
