import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesService } from '../api/sales-service';
import { treasuryService } from '../api/treasury-service';
import { toast } from '@/components/ui/VToast';
import { SalesOrder } from '../types/sales';
import type { BankAccount } from '../types/treasury';

export const orderStatementQueryKeys = {
  order: (orderId: number) => ['order', orderId] as const,
  installments: (cxcId: number) => ['installments', cxcId] as const,
  commissions: () => ['commissions'] as const,
  bankAccounts: () => ['bank-accounts'] as const,
};

function getErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export type RegisterInstallmentPayload = {
  amount: number;
  payment_date?: string | null;
  notes?: string | null;
  reference?: string | null;
  account_id?: number | null;
  instance_ids?: number[];
  is_advance?: boolean;
};

export type UpdateInstallmentPayload = {
  amount?: number;
  payment_date?: string | null;
  notes?: string | null;
  reference?: string | null;
  instance_ids?: number[];
  is_advance?: boolean;
};

export function useOrderDetail(orderId: number | undefined, isOpen: boolean) {
  return useQuery({
    queryKey: orderStatementQueryKeys.order(orderId ?? 0),
    queryFn: () => salesService.getOrderDetail(orderId!),
    enabled: isOpen && !!orderId,
    staleTime: 0,
  });
}

export function useInstallments(cxcId: number | undefined) {
  return useQuery({
    queryKey: orderStatementQueryKeys.installments(cxcId ?? 0),
    queryFn: () => salesService.getInstallments(cxcId!),
    enabled: !!cxcId,
  });
}

export function useCommissions(enabled = true) {
  return useQuery({
    queryKey: orderStatementQueryKeys.commissions(),
    queryFn: () => salesService.getCommissions(),
    enabled,
    staleTime: 60_000,
  });
}

export function useBankAccounts(canAccess: boolean) {
  return useQuery({
    queryKey: orderStatementQueryKeys.bankAccounts(),
    queryFn: (): Promise<BankAccount[]> => treasuryService.getAccounts(),
    enabled: canAccess,
  });
}

export function useRegisterInstallment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      cxcId,
      payload,
    }: {
      cxcId: number;
      orderId: number;
      payload: RegisterInstallmentPayload;
    }) => salesService.registerInstallment(cxcId, payload),
    onSuccess: (_data, { cxcId, orderId }) => {
      queryClient.invalidateQueries({ queryKey: orderStatementQueryKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: orderStatementQueryKeys.installments(cxcId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo registrar el abono.'));
    },
  });
}

export function useUpdateInstallment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      installmentId,
      payload,
    }: {
      installmentId: number;
      cxcId: number;
      orderId: number;
      payload: UpdateInstallmentPayload;
    }) => salesService.updateInstallment(installmentId, payload),
    onSuccess: (_data, { cxcId, orderId }) => {
      queryClient.invalidateQueries({ queryKey: orderStatementQueryKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: orderStatementQueryKeys.installments(cxcId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo actualizar el abono.'));
    },
  });
}

export function useCancelInstallment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      installmentId,
      reason,
    }: {
      installmentId: number;
      cxcId: number;
      orderId: number;
      reason: string;
    }) => salesService.cancelInstallment(installmentId, reason),
    onSuccess: (_data, { cxcId, orderId }) => {
      queryClient.invalidateQueries({ queryKey: orderStatementQueryKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: orderStatementQueryKeys.installments(cxcId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo cancelar el abono.'));
    },
  });
}

export async function fetchInstallmentsForCxc(cxcId: number) {
  return salesService.getInstallments(cxcId);
}

export type { SalesOrder };
