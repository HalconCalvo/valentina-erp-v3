import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { quotationService } from '../api/quotation-service';
import {
  quotationQueryKeys,
  useConvertQuotation,
  useCreateQuotation,
  useQuotations,
} from '../hooks/useQuotations';
import type { QuotationCreatePayload } from '../types/quotations';

vi.mock('../api/quotation-service', () => ({
  quotationService: {
    listQuotations: vi.fn(),
    getQuotation: vi.fn(),
    createQuotation: vi.fn(),
    updateQuotation: vi.fn(),
    sendQuotation: vi.fn(),
    acceptQuotation: vi.fn(),
    rejectQuotation: vi.fn(),
    cancelQuotation: vi.fn(),
    convertToOrder: vi.fn(),
    getQuotationPdf: vi.fn(),
    openQuotationPdf: vi.fn(),
  },
  formatQuotationCurrency: vi.fn(),
  formatQuotationFolio: vi.fn(),
  QUOTATION_STATUS_LABELS: {},
}));

vi.mock('@/components/ui/VToast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useQuotations hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza sin errores con QueryClientProvider', () => {
    vi.mocked(quotationService.listQuotations).mockResolvedValue([]);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useQuotations(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current).toBeDefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('useQuotations retorna lista vacía cuando la API responde []', async () => {
    vi.mocked(quotationService.listQuotations).mockResolvedValue([]);
    const queryClient = createTestQueryClient();

    const { result } = renderHook(() => useQuotations(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
    expect(quotationService.listQuotations).toHaveBeenCalledTimes(1);
  });

  it('useCreateQuotation llama al endpoint correcto', async () => {
    const payload: QuotationCreatePayload = {
      project_name: 'Proyecto Test',
      client_id: 1,
      tax_rate_id: 1,
      valid_until: '2026-12-31T12:00:00',
      items: [],
    };
    const created = {
      id: 10,
      status: 'DRAFT' as const,
      project_name: payload.project_name,
      client_id: payload.client_id,
      tax_rate_id: payload.tax_rate_id,
      valid_until: payload.valid_until,
      applied_margin_percent: 0,
      advance_percent: 60,
      currency: 'MXN',
      created_at: '2026-01-01T00:00:00',
      subtotal: 0,
      tax_amount: 0,
      total_price: 0,
      items: [],
    };
    vi.mocked(quotationService.createQuotation).mockResolvedValue(created);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCreateQuotation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(quotationService.createQuotation).toHaveBeenCalledWith(payload);
  });

  it('useConvertQuotation invalida el cache correctamente', async () => {
    vi.mocked(quotationService.convertToOrder).mockResolvedValue({
      quotation_id: 5,
      sales_order_id: 99,
      message: 'Convertida',
    });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useConvertQuotation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(quotationService.convertToOrder).toHaveBeenCalledWith(5);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quotations'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: quotationQueryKeys.detail(5),
    });
  });
});
