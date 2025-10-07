import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { getDashboardSummary, getUsageMetrics, getOnboardingAnalytics } from '../services/dashboard-service';

const router = Router({ base: '/dashboard' });

router.get('/summary', async (request: TenantScopedRequest, env: Env) => {
  const summary = await getDashboardSummary(env, request.tenantId!);
  return JsonResponse.ok(summary);
});

router.get('/usage', async (request: TenantScopedRequest, env: Env) => {
  const usage = await getUsageMetrics(env, request.tenantId!);
  return JsonResponse.ok({ usage });
});

router.get('/analytics', async (_request: TenantScopedRequest, env: Env) => {
  const analytics = await getOnboardingAnalytics(env);
  return JsonResponse.ok(analytics);
});

export const dashboardRouter = router;
