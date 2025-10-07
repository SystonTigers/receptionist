import { Router } from 'itty-router';
import { z } from 'zod';
import { JsonResponse } from '../lib/response';
import { getTenantById, listTenantUsers } from '../services/tenant-service';
import { assignTenantPlan } from '../services/plan-service';
import { getPlanOverview } from '../middleware/features';

const router = Router({ base: '/tenants' });

router.get('/me', async (request: TenantScopedRequest, env: Env) => {
  const tenant = await getTenantById(env, request.tenantId!);
  return JsonResponse.ok(tenant);
});

router.get('/me/users', async (request: TenantScopedRequest, env: Env) => {
  const users = await listTenantUsers(env, request.tenantId!);
  return JsonResponse.ok({ users });
});

router.get('/me/plan', async (request: TenantScopedRequest, env: Env) => {
  const overview = await getPlanOverview(env, request.tenantId!);
  return JsonResponse.ok(overview);
});

const planUpdateSchema = z.object({
  planCode: z.enum(['free', 'basic', 'pro'])
});

router.post('/me/plan', async (request: TenantScopedRequest, env: Env) => {
  if (request.role && request.role !== 'admin') {
    return JsonResponse.error('Only administrators can change plans', 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = planUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return JsonResponse.error('Invalid payload', 400, parsed.error.flatten());
  }

  await assignTenantPlan(env, request.tenantId!, parsed.data.planCode);
  const overview = await getPlanOverview(env, request.tenantId!);
  return JsonResponse.ok(overview, { status: 202 });
});

export const tenantRouter = router;
