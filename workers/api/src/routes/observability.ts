import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { getHealthSummary, getObservabilitySummary, evaluateTenantAlerts } from '../services/observability-service';

const router = Router({ base: '/observability' });

router.get('/summary', async (request: TenantScopedRequest, env: Env) => {
  if (!request.tenantId) {
    return JsonResponse.error('Missing tenant context', 400);
  }
  const summary = await getObservabilitySummary(env, request.tenantId);
  request.logger?.info('Observability summary delivered', {
    alerts: summary.alerts.length,
    requestWindow: summary.timeframe
  });
  return JsonResponse.ok(summary);
});

router.get('/alerts', async (request: TenantScopedRequest, env: Env) => {
  if (!request.tenantId) {
    return JsonResponse.error('Missing tenant context', 400);
  }
  const alerts = await evaluateTenantAlerts(env, request.tenantId);
  request.logger?.debug('Evaluated alerts for tenant', { count: alerts.length });
  return JsonResponse.ok({ alerts });
});

router.get('/health', async (_request: TenantScopedRequest, env: Env) => {
  const summary = await getHealthSummary(env);
  return JsonResponse.ok(summary);
});

export const observabilityRouter = router;
