import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { listStylists, upsertStylistRota } from '../services/stylist-service';

const router = Router({ base: '/stylists' });

router.get('/', async (request: TenantScopedRequest, env: Env) => {
  const stylists = await listStylists(env, request.tenantId!);
  return JsonResponse.ok({ stylists });
});

router.post('/rota', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  await upsertStylistRota(env, request.tenantId!, payload);
  return JsonResponse.ok({ status: 'accepted' }, { status: 202 });
});

export const stylistRouter = router;
