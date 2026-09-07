import { useQuery } from '@tanstack/react-query';
import { salesService } from '../api/sales-service';
import { InvoicingRightsRead, SalesOrder } from '../types/sales';

export const receivablesQueryKeys = {
  salesOrders: () => ['sales-orders'] as const,
  invoicingRights: () => ['invoicing-rights'] as const,
};

function normalizeOrdersResponse(response: unknown): SalesOrder[] {
  let rawData: unknown[] = [];
  if (Array.isArray(response)) {
    rawData = response;
  } else if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (Array.isArray(r.data)) rawData = r.data;
    else if (Array.isArray(r.items)) rawData = r.items;
  }
  if (rawData.length === 0) return [];
  return Array.from(new Map(rawData.map((o) => [(o as SalesOrder).id, o])).values()) as SalesOrder[];
}

export function useSalesOrders() {
  return useQuery({
    queryKey: receivablesQueryKeys.salesOrders(),
    queryFn: async () => {
      const response = await salesService.getOrders();
      return normalizeOrdersResponse(response);
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
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
