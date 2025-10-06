import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { listClients } from '../services/client-service';

const router = Router({ base: '/clients' });

router.get('/', async (request: TenantScopedRequest, env: Env) => {
  const clients = await listClients(env, request.tenantId!);
  return JsonResponse.ok({ clients });
});

export const clientRouter = router;
