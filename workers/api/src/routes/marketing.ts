import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { generateAdCopy, schedulePost } from '../services/marketing-service';

const router = Router({ base: '/marketing' });

router.post('/generate', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const result = await generateAdCopy(env, request.tenantId!, payload);
  return JsonResponse.ok(result);
});

router.post('/schedule', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const result = await schedulePost(env, request.tenantId!, payload);
  return JsonResponse.ok(result, { status: 202 });
});

export const marketingRouter = router;
