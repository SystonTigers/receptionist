import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { createStripeClient } from '../integrations/stripe';
import { handleStripeEvent } from '../services/payment-service';
import { handleInboundMessage, normalizeInboundMessagePayload } from '../services/messaging-service';
import { verifyTwilioWebhookRequest, WebhookVerificationError } from '../lib/webhook-security';

const router = Router({ base: '/webhooks' });

const IDEMP_TTL_SECONDS = 60 * 60 * 24;

router.post('/stripe', async (request: Request, env: Env) => {
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  const stripe = createStripeClient(env);

  try {
    const event = await stripe.retrieveEvent(signature, payload);
    const eventId = (event as { id?: string } | null)?.id;
    if (!eventId) {
      throw new Error('Stripe event missing id');
    }

    const cacheKey = `stripe:${eventId}`;
    if (await env.IDEMP_KV.get(cacheKey)) {
      return JsonResponse.ok({ received: true, duplicate: true });
    }

    await handleStripeEvent(env, event as Record<string, unknown>);
    await env.IDEMP_KV.put(cacheKey, '1', { expirationTtl: IDEMP_TTL_SECONDS });

    return JsonResponse.ok({ received: true });
  } catch (error) {
    console.error('Stripe webhook error', error);
    return JsonResponse.error('Unable to process Stripe webhook', 400);
  }
});

router.post('/twilio', async (request: Request, env: Env) => {
  try {
    const { payload } = await verifyTwilioWebhookRequest(request, env.TWILIO_AUTH_TOKEN);
    const message = normalizeInboundMessagePayload(payload);

    if (message.messageSid) {
      const cacheKey = `twilio:${message.messageSid}`;
      if (await env.IDEMP_KV.get(cacheKey)) {
        return JsonResponse.ok({ received: true, duplicate: true });
      }
      const result = await handleInboundMessage(env, message);
      await env.IDEMP_KV.put(cacheKey, '1', { expirationTtl: IDEMP_TTL_SECONDS });
      return JsonResponse.ok(result);
    }

    const result = await handleInboundMessage(env, message);
    return JsonResponse.ok(result);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      console.warn('Twilio webhook rejected', { reason: error.message });
      return JsonResponse.error('Forbidden', error.status);
    }
    console.error('Twilio webhook error', error);
    return JsonResponse.error('Unable to process Twilio webhook', 400);
  }
});

export const webhooksRouter = router;
