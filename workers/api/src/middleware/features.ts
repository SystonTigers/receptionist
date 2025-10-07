import type { FeatureCode } from '@ai-hairdresser/shared';
import { JsonResponse } from '../lib/response';
import { getTenantPlanAccess, listPlans } from '../services/plan-service';

const PUBLIC_PATHS = [/^\/healthz$/, /^\/auth\//, /^\/webhooks\//];

const FEATURE_REQUIREMENTS: Array<{ pattern: RegExp; feature: FeatureCode }> = [
  { pattern: /^\/assist(\/|$)/, feature: 'ai_assistant_enabled' },
  { pattern: /^\/payments(\/|$)/, feature: 'deposits_enabled' },
  { pattern: /^\/stylists(\/|$)/, feature: 'team_accounts' }
];

export async function withFeatureFlags(request: TenantScopedRequest, env: Env, _ctx: ExecutionContext) {
  const url = new URL(request.url);
  if (!request.tenantId || PUBLIC_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return request;
  }

  const featureAccess = await getTenantPlanAccess(env, request.tenantId);
  request.featureAccess = featureAccess;
  request.hasFeature = (feature: FeatureCode) => featureAccess.features.includes(feature);

  const requirement = FEATURE_REQUIREMENTS.find((rule) => rule.pattern.test(url.pathname));
  if (requirement && !request.hasFeature(requirement.feature)) {
    return JsonResponse.error('Feature not available on current plan', 403, {
      requiredFeature: requirement.feature,
      activePlan: featureAccess.plan,
      effectivePlan: featureAccess.effectivePlan
    });
  }

  return request;
}

export async function getPlanOverview(env: Env, tenantId: string) {
  const [tenantPlan, availablePlans] = await Promise.all([
    getTenantPlanAccess(env, tenantId),
    listPlans(env)
  ]);
  return { tenantPlan, availablePlans };
}
