import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import {
  createCustomerPortalSession,
  getTenantSubscriptionStatus,
  listTenantInvoices
} from '../services/subscription-service';

const router = Router({ base: '/billing' });

router.get('/status', async (request: TenantScopedRequest, env: Env) => {
  const subscription = await getTenantSubscriptionStatus(env, request.tenantId!);
  if (!subscription) {
    return JsonResponse.error('Subscription not found', 404);
  }
  return JsonResponse.ok({ subscription });
});

router.get('/invoices', async (request: TenantScopedRequest, env: Env) => {
  const { invoices } = await listTenantInvoices(env, request.tenantId!, { limit: 24 });
  return JsonResponse.ok({ invoices });
});

router.post('/portal', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json().catch(() => null);
  const body = (payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const returnUrl = typeof body.returnUrl === 'string' ? body.returnUrl : undefined;
  const session = await createCustomerPortalSession(env, request.tenantId!, returnUrl);
  return JsonResponse.ok({ url: session.url });
});

export const billingRouter = router;
