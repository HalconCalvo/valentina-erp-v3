import { useQuery } from '@tanstack/react-query';
import axiosClient from '../api/axios-client';

export const purchaseOrdersQueryKeys = {
  planning: () => ['purchase-planning'] as const,
  orders: (filters?: PurchaseOrderFilters) => ['purchase-orders', filters ?? {}] as const,
  materials: () => ['materials'] as const,
};

export type PurchaseOrderFilters = Record<string, string | number | boolean | undefined>;

function extractList(res: { data?: unknown }, fallbackKey: string): any[] {
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o[fallbackKey])) return o[fallbackKey] as any[];
  }
  return [];
}

function sortPlanningGroups(data: any[]): any[] {
  return [...data].sort((a, b) => {
    const aHasProject = a.items?.some((it: any) => it.project_name) || false;
    const bHasProject = b.items?.some((it: any) => it.project_name) || false;
    return aHasProject === bHasProject ? 0 : aHasProject ? -1 : 1;
  });
}

export function usePurchasePlanning() {
  return useQuery({
    queryKey: purchaseOrdersQueryKeys.planning(),
    queryFn: async () => {
      const response = await axiosClient.get('/purchases/planning/consolidated', {
        params: { t: Date.now() },
      });
      const data = extractList({ data: response.data }, 'items');
      return sortPlanningGroups(data);
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function usePurchaseOrders(filters?: PurchaseOrderFilters) {
  return useQuery({
    queryKey: purchaseOrdersQueryKeys.orders(filters),
    queryFn: async () => {
      const response = await axiosClient.get('/purchases/orders/', {
        params: { ...filters, t: Date.now() },
      });
      return extractList({ data: response.data }, 'orders');
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useMaterials() {
  return useQuery({
    queryKey: purchaseOrdersQueryKeys.materials(),
    queryFn: async () => {
      const response = await axiosClient.get('/foundations/materials');
      return extractList({ data: response.data }, 'materials');
    },
    staleTime: 60_000,
  });
}
