import useSWR from 'swr';
import { Tenant } from '@ai-hairdresser/shared';
import { apiFetch } from '@/lib/api-client';

const fetcher = (path: string) => apiFetch<Tenant>(path);

export function useTenant() {
  const { data, error, isLoading } = useSWR('/tenants/me', fetcher);
  return {
    tenant: data,
    loading: isLoading,
    error
  };
}
