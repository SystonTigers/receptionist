import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { sendOutboundMessage, handleInboundMessage } from '../services/messaging-service';

const router = Router({ base: '/messaging' });

router.post('/outbound', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const result = await sendOutboundMessage(env, request.tenantId!, payload);
  return JsonResponse.ok(result, { status: 202 });
});

router.post('/inbound', async (request: Request, env: Env) => {
  const payload = await request.json();
  const result = await handleInboundMessage(env, payload);
  return JsonResponse.ok(result);
});

export const messagingRouter = router;
