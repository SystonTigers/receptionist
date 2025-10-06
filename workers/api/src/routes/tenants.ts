import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { getTenantById, listTenantUsers } from '../services/tenant-service';

const router = Router({ base: '/tenants' });

router.get('/me', async (request: TenantScopedRequest, env: Env) => {
  const tenant = await getTenantById(env, request.tenantId!);
  return JsonResponse.ok(tenant);
});

router.get('/me/users', async (request: TenantScopedRequest, env: Env) => {
  const users = await listTenantUsers(env, request.tenantId!);
  return JsonResponse.ok({ users });
});

export const tenantRouter = router;
