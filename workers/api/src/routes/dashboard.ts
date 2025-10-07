import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { getDashboardSummary } from '../services/dashboard-service';
import { getUsageOverview } from '../services/usage-service';

const router = Router({ base: '/dashboard' });

router.get('/summary', async (request: TenantScopedRequest, env: Env) => {
  const summary = await getDashboardSummary(env, request.tenantId!);
  return JsonResponse.ok(summary);
});

router.get('/usage', async (request: TenantScopedRequest, env: Env) => {
  const usage = await getUsageOverview(env, request.tenantId!);
  return JsonResponse.ok(usage);
});

export const dashboardRouter = router;
