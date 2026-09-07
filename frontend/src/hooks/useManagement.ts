import { useQuery } from '@tanstack/react-query';
import axiosClient from '../api/axios-client';
import { financeService } from '../api/finance-service';
import { salesService } from '../api/sales-service';
import { treasuryService } from '../api/treasury-service';
import { AccountsPayableStats } from '../types/finance';
import { InvoicingRightsRead, SalesOrder } from '../types/sales';
import { BankAccount } from '../types/treasury';

export type GlobalConfigRead = {
  company_name?: string;
  logo_path?: string;
  [key: string]: unknown;
};

export type ManagementDataRead = {
  apStats: AccountsPayableStats;
  rights: InvoicingRightsRead | null;
  orders: SalesOrder[];
};

export type PayrollDashboardRead = {
  commPayableCount: number;
  instPayableCount: number;
  commPayableTotal: number;
  instPayableTotal: number;
};

export type PurchasePendingTasksRead = {
  orders_to_authorize: number;
};

export const managementQueryKeys = {
  globalConfig: () => ['global-config'] as const,
  bankAccounts: () => ['bank-accounts'] as const,
  managementData: () => ['management-data'] as const,
  payrollDashboard: () => ['management-payroll-dashboard'] as const,
  purchasePendingTasks: () => ['management-purchase-pending-tasks'] as const,
};

const EMPTY_PAYROLL_DASH: PayrollDashboardRead = {
  commPayableCount: 0,
  instPayableCount: 0,
  commPayableTotal: 0,
  instPayableTotal: 0,
};

export function useGlobalConfig() {
  return useQuery({
    queryKey: managementQueryKeys.globalConfig(),
    queryFn: async (): Promise<GlobalConfigRead | null> => {
      try {
        const response = await axiosClient.get('/foundations/config');
        const cfgData = Array.isArray(response.data) ? response.data[0] : response.data;
        return cfgData as GlobalConfigRead;
      } catch {
        return null;
      }
    },
    staleTime: 300_000,
  });
}

export function useBankAccounts(enabled: boolean) {
  return useQuery({
    queryKey: managementQueryKeys.bankAccounts(),
    queryFn: (): Promise<BankAccount[]> => treasuryService.getAccounts(),
    enabled,
    staleTime: 30_000,
  });
}

export function useManagementData() {
  return useQuery({
    queryKey: managementQueryKeys.managementData(),
    queryFn: async (): Promise<ManagementDataRead> => {
      const [apStats, rights, orders] = await Promise.all([
        financeService.getPayableDashboardStats(),
        salesService.getInvoicingRights().catch(() => null),
        salesService.getOrders().catch(() => [] as SalesOrder[]),
      ]);
      return { apStats, rights, orders };
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function usePayrollDashboard() {
  return useQuery({
    queryKey: managementQueryKeys.payrollDashboard(),
    queryFn: async (): Promise<PayrollDashboardRead> => {
      try {
        const [coOv, instOv] = await Promise.all([
          salesService.getCommissionsPayrollOverview(),
          treasuryService.getInstallerPayrollOverview(),
        ]);
        return {
          commPayableCount: coOv.payable.length,
          instPayableCount: instOv.payable.length,
          commPayableTotal: coOv.payable_total,
          instPayableTotal: instOv.payable_total,
        };
      } catch {
        return EMPTY_PAYROLL_DASH;
      }
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function usePurchasePendingTasks() {
  return useQuery({
    queryKey: managementQueryKeys.purchasePendingTasks(),
    queryFn: async (): Promise<PurchasePendingTasksRead> => {
      const response = await axiosClient.get('/purchases/notifications/pending-tasks');
      return {
        orders_to_authorize: response.data.orders_to_authorize || 0,
      };
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
    meta: { errorMessage: 'Error al cargar notificaciones de compras.' },
  });
}
