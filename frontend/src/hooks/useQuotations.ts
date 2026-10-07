import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quotationService } from '../api/quotation-service';
import { toast } from '@/components/ui/VToast';
import {
  ClientPurchaseOrder,
  Quotation,
  QuotationCreatePayload,
  QuotationListFilters,
} from '../types/quotations';

export const quotationQueryKeys = {
  list: (filters?: QuotationListFilters) => ['quotations', filters ?? {}] as const,
  detail: (id: number) => ['quotation', id] as const,
};

export function getErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export function useQuotations(filters?: QuotationListFilters) {
  return useQuery({
    queryKey: quotationQueryKeys.list(filters),
    queryFn: () => quotationService.listQuotations(filters),
  });
}

export function useQuotation(id: number) {
  return useQuery({
    queryKey: quotationQueryKeys.detail(id),
    queryFn: () => quotationService.getQuotation(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: QuotationCreatePayload) => quotationService.createQuotation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo crear la cotización.'));
    },
  });
}

/**
 * Any change of state of a quotation (request authorization, return, lost, cancel, renew...).
 * Refreshes the list and the detail; the error message comes from the backend.
 */
export function useQuotationTransition<TArgs>(
  action: (args: TArgs) => Promise<Quotation>,
  fallbackError: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (quotation: Quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(quotation.id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, fallbackError));
    },
  });
}

export function useConvertQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, po }: { id: number; po: ClientPurchaseOrder }) => quotationService.convertToOrder(id, po),
    onSettled: (_result, _error, { id }) => {
      // A blocked conversion (expired or cost drift) also changes the quotation status.
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo generar la OV.'));
    },
  });
}
