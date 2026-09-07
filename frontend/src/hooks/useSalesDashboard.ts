import { useQuery } from '@tanstack/react-query';
import axiosClient from '../api/axios-client';

export { useSalesOrders } from './useReceivables';

export type CurrentUserRead = {
  monthly_quota?: number | string | null;
  monthly_sales_target?: number | string | null;
  [key: string]: unknown;
};

export const salesDashboardQueryKeys = {
  currentUser: () => ['current-user'] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: salesDashboardQueryKeys.currentUser(),
    queryFn: async (): Promise<CurrentUserRead> => {
      const response = await axiosClient.get('/users/me');
      return response.data;
    },
    staleTime: 300_000,
  });
}
