import { normalizeError } from '@ai-hairdresser/shared';
import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { sendOutboundMessage, handleInboundMessage, normalizeInboundMessagePayload } from '../services/messaging-service';

const router = Router({ base: '/messaging' });

router.post('/outbound', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return JsonResponse.error('Invalid JSON body', 400);
  }

  const body = payload as Record<string, unknown>;
  const to = typeof body.to === 'string' ? body.to : '';
  const text = typeof body.body === 'string' ? body.body : '';
  const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'sms';

  if (!to || !text) {
    return JsonResponse.error('Recipient and message body are required', 400);
  }

  try {
    const result = await sendOutboundMessage(
      env,
      request.tenantId!,
      { to, body: text, channel },
      request.logger
    );
    return JsonResponse.ok(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message';
    request.logger?.error('Failed to queue outbound message', { error: normalizeError(error) });
    return JsonResponse.error(message, 400);
  }
});

router.post('/inbound', async (request: Request, env: Env) => {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return JsonResponse.error('Invalid JSON body', 400);
  }
  const normalized = normalizeInboundMessagePayload(payload);
  const result = await handleInboundMessage(env, normalized);
  return JsonResponse.ok(result);
});

export const messagingRouter = router;
