import { normalizeError } from '@ai-hairdresser/shared';
import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { sendOutboundMessage, handleInboundMessage } from '../services/messaging-service';

const router = Router({ base: '/messaging' });

router.post('/outbound', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return JsonResponse.error('Invalid JSON body', 400);
  }

  try {
    const result = await sendOutboundMessage(env, request.tenantId!, payload, request.logger);
    return JsonResponse.ok(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message';
    request.logger?.error('Failed to queue outbound message', { error: normalizeError(error) });
    return JsonResponse.error(message, 400);
  }
});

router.post('/inbound', async (request: Request, env: Env) => {
  const payload = await request.json();
  const result = await handleInboundMessage(env, payload);
  return JsonResponse.ok(result);
});

export const messagingRouter = router;
