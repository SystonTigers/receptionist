import { createClient } from '@supabase/supabase-js';
import type {
  FeatureCode,
  PlanCode,
  PlanSummary,
  TenantPlanAccess,
  TenantPlanStatus
} from '@ai-hairdresser/shared';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalizePrice(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function mapPlanRow(row: any): PlanSummary {
  const features = Array.isArray(row.plan_features)
    ? (row.plan_features
        .map((feature: any) => feature?.feature_code)
        .filter((code: unknown): code is FeatureCode => typeof code === 'string') as FeatureCode[])
    : [];

  return {
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    monthlyPrice: normalizePrice(row.monthly_price),
    currency: row.currency ?? null,
    gracePeriodDays: typeof row.grace_period_days === 'number' ? row.grace_period_days : Number(row.grace_period_days ?? 0) || 0,
    features
  };
}

async function getPlanByCode(env: Env, code: PlanCode): Promise<PlanSummary> {
  const client = getClient(env);
  const { data, error } = await client
    .from('plans')
    .select('id, code, name, description, monthly_price, currency, grace_period_days, plan_features(feature_code)')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load plan ${code}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Plan ${code} is not configured`);
  }

  return mapPlanRow(data);
}

export async function listPlans(env: Env): Promise<PlanSummary[]> {
  const client = getClient(env);
  const { data, error } = await client
    .from('plans')
    .select('id, code, name, description, monthly_price, currency, grace_period_days, plan_features(feature_code)')
    .eq('is_active', true)
    .order('monthly_price', { ascending: true });

  if (error) {
    throw new Error(`Failed to list plans: ${error.message}`);
  }

  return (data ?? []).map(mapPlanRow);
}

function isActiveStatus(status: TenantPlanStatus) {
  return status === 'active' || status === 'trialing';
}

export async function getTenantPlanAccess(env: Env, tenantId: string): Promise<TenantPlanAccess> {
  const client = getClient(env);
  const { data, error } = await client
    .from('tenant_plans')
    .select(
      'id, status, billing_status, current_period_end, grace_period_ends_at, plan:plans(id, code, name, description, monthly_price, currency, grace_period_days, plan_features(feature_code))'
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve tenant plan: ${error.message}`);
  }

  const freePlan = await getPlanByCode(env, 'free');

  if (!data?.plan) {
    return {
      plan: freePlan,
      effectivePlan: freePlan,
      status: 'active',
      billingStatus: null,
      features: freePlan.features,
      isInGracePeriod: false,
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      downgradedTo: null
    };
  }

  const rawPlan = Array.isArray(data.plan) ? (data.plan[0] ?? {}) : (data.plan ?? {});
  const planFeatures = Array.isArray((rawPlan as { plan_features?: unknown }).plan_features)
    ? ((rawPlan as { plan_features: unknown }).plan_features as unknown[])
    : [];
  const plan = mapPlanRow({
    ...(rawPlan as Record<string, unknown>),
    plan_features: planFeatures
  });
  const status = (data.status ?? 'active') as TenantPlanStatus;
  const currentPeriodEnd = data.current_period_end ?? null;
  const gracePeriodEndsAt = data.grace_period_ends_at ?? null;

  let isInGracePeriod = false;
  if (gracePeriodEndsAt) {
    const graceDate = new Date(gracePeriodEndsAt);
    isInGracePeriod = Number.isFinite(graceDate.getTime()) && graceDate.getTime() > Date.now();
  }

  let effectivePlan = plan;
  let downgradedTo: PlanSummary | null = null;

  if (!isActiveStatus(status)) {
    if (status === 'past_due' && isInGracePeriod) {
      // still allow features during grace period
      effectivePlan = plan;
    } else {
      effectivePlan = freePlan;
      downgradedTo = freePlan;
    }
  }

  return {
    plan,
    effectivePlan,
    status,
    billingStatus: data.billing_status ?? null,
    features: effectivePlan.features,
    isInGracePeriod,
    currentPeriodEnd,
    gracePeriodEndsAt,
    downgradedTo
  };
}

export async function assignTenantPlan(env: Env, tenantId: string, planCode: PlanCode) {
  const client = getClient(env);
  const plan = await getPlanByCode(env, planCode);
  const now = new Date();
  const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const graceDays = Number.isFinite(plan.gracePeriodDays) ? plan.gracePeriodDays : 7;
  const gracePeriodEnds = new Date(currentPeriodEnd.getTime() + graceDays * 24 * 60 * 60 * 1000);

  const timestamp = now.toISOString();
  const { data, error } = await client
    .from('plans')
    .select('id')
    .eq('code', planCode)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Unable to locate plan for assignment: ${error?.message ?? 'not found'}`);
  }

  const { error: insertError } = await client.from('tenant_plans').insert({
    tenant_id: tenantId,
    plan_id: data.id,
    status: 'active',
    billing_status: 'active',
    current_period_start: timestamp,
    current_period_end: currentPeriodEnd.toISOString(),
    grace_period_ends_at: gracePeriodEnds.toISOString(),
    updated_at: timestamp
  });

  if (insertError) {
    throw new Error(`Failed to assign tenant plan: ${insertError.message}`);
  }

  return getTenantPlanAccess(env, tenantId);
}
