import { useQuery } from '@tanstack/react-query';
import type {
  Expense,
  FinanceOverview,
  Forecast,
  Invoice,
  Job,
  PendingBillingGroup,
  QuarterReport,
} from '@l10n/shared';
import { api } from '@/lib/api';

type Query = Record<string, string | number | undefined>;

export const usePendingBilling = () =>
  useQuery({
    queryKey: ['billing-pending'],
    queryFn: () => api<PendingBillingGroup[]>('/billing/pending'),
  });
export const useInvoices = (query: Query = {}) =>
  useQuery({
    queryKey: ['invoices', query],
    queryFn: () => api<Invoice[]>('/invoices', { query }),
  });
export const useInvoice = (id: string | null) =>
  useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api<{ invoice: Invoice; jobs: Job[] }>(`/invoices/${id}`),
    enabled: Boolean(id),
  });
export const useExpenses = (query: Query = {}) =>
  useQuery({
    queryKey: ['expenses', query],
    queryFn: () => api<Expense[]>('/expenses', { query }),
  });
export const useForecast = (months = 6) =>
  useQuery({
    queryKey: ['finance-forecast', months],
    queryFn: () => api<Forecast>('/reports/forecast', { query: { months } }),
  });
export const useOverview = (year: number) =>
  useQuery({
    queryKey: ['finance-overview', year],
    queryFn: () => api<FinanceOverview>('/reports/overview', { query: { year } }),
  });
export const useQuarter = (year: number, quarter: number) =>
  useQuery({
    queryKey: ['finance-quarter', year, quarter],
    queryFn: () => api<QuarterReport>('/reports/quarter', { query: { year, quarter } }),
  });
