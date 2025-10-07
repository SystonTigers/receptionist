import { JsonResponse } from '../lib/response';
import { getTenantSubscriptionRecord } from '../services/subscription-service';

const PUBLIC_PATHS = [/^\/healthz$/, /^\/auth\//, /^\/webhooks\//];
const BILLING_PATHS = [/^\/billing(?:\/.*)?$/];

export async function withBilling(request: TenantScopedRequest, env: Env, _ctx: ExecutionContext) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return request;
  }

  if (!request.tenantId) {
    return JsonResponse.error('Missing tenant context', 400);
  }

  const subscriptionRecord = await getTenantSubscriptionRecord(env, request.tenantId);
  if (!subscriptionRecord) {
    return JsonResponse.error('Billing subscription not found for tenant', 402);
  }

  request.subscription = {
    status: subscriptionRecord.status,
    planId: subscriptionRecord.plan_id,
    startDate: subscriptionRecord.start_date,
    nextBillingDate: subscriptionRecord.next_billing_date,
    delinquent: subscriptionRecord.delinquent
  };

  if (subscriptionRecord.delinquent && !BILLING_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return JsonResponse.error('Subscription payment required. Please update billing details.', 402);
  }

  return request;
}
