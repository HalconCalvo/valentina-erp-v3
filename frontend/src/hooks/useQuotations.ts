import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quotationService } from '../api/quotation-service';
import { toast } from '@/components/ui/VToast';
import {
  Quotation,
  QuotationCreatePayload,
  QuotationListFilters,
  QuotationUpdatePayload,
} from '../types/quotations';

export const quotationQueryKeys = {
  list: (filters?: QuotationListFilters) => ['quotations', filters ?? {}] as const,
  detail: (id: number) => ['quotation', id] as const,
};

function getErrorMessage(error: unknown, fallback: string): string {
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

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: QuotationUpdatePayload }) =>
      quotationService.updateQuotation(id, data),
    onSuccess: (quotation: Quotation) => {
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(quotation.id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo actualizar la cotización.'));
    },
  });
}

export function useSendQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => quotationService.sendQuotation(id),
    onSuccess: (quotation: Quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(quotation.id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo enviar la cotización.'));
    },
  });
}

export function useAcceptQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => quotationService.acceptQuotation(id),
    onSuccess: (quotation: Quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(quotation.id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo aceptar la cotización.'));
    },
  });
}

export function useRejectQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      quotationService.rejectQuotation(id, reason),
    onSuccess: (quotation: Quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(quotation.id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo rechazar la cotización.'));
    },
  });
}

export function useCancelQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      quotationService.cancelQuotation(id, reason),
    onSuccess: (quotation: Quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(quotation.id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo cancelar la cotización.'));
    },
  });
}

export function useConvertQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => quotationService.convertToOrder(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: quotationQueryKeys.detail(id) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo convertir a OV.'));
    },
  });
}
