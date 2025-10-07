import { createContext, PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import useSWR from 'swr';
import type {
  FeatureCode,
  PlanSummary,
  TenantPlanAccess,
  TenantPlanResponse
} from '@ai-hairdresser/shared';
import { apiFetch } from './api-client';

const FeatureFlagContext = createContext<FeatureContextValue | undefined>(undefined);

const fetcher = (path: string) => apiFetch<TenantPlanResponse>(path);

type FeatureContextValue = {
  loading: boolean;
  error?: string;
  plan?: TenantPlanAccess;
  availablePlans: PlanSummary[];
  features: FeatureCode[];
  hasFeature: (feature: FeatureCode) => boolean;
  refresh: () => Promise<TenantPlanResponse | undefined>;
};

export function FeatureFlagProvider({ children }: PropsWithChildren) {
  const { data, error, isLoading, mutate } = useSWR('/tenants/plan', fetcher, {
    revalidateOnFocus: false
  });

  const refresh = useCallback(() => mutate(), [mutate]);

  const value = useMemo<FeatureContextValue>(() => {
    const plan = data?.tenantPlan;
    const availablePlans = data?.availablePlans ?? [];
    const features = plan?.features ?? [];
    const featureSet = new Set(features);

    return {
      loading: Boolean(isLoading),
      error: error instanceof Error ? error.message : undefined,
      plan,
      availablePlans,
      features,
      hasFeature: (feature: FeatureCode) => featureSet.has(feature),
      refresh
    };
  }, [data, error, isLoading, refresh]);

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within FeatureFlagProvider');
  }
  return context;
}

export function useFeatureFlag(feature: FeatureCode) {
  const context = useFeatureFlags();
  return {
    enabled: context.hasFeature(feature),
    loading: context.loading,
    plan: context.plan
  };
}
