import { Router } from 'itty-router';

import { JsonResponse } from '../lib/response';
import { createStripeClient } from '../integrations/stripe';
import { handleStripeEvent } from '../services/payment-service';
import { handleInboundMessage, normalizeTwilio } from '../services/messaging-service';
import { validateTwilioSignature, TWILIO_SIGNATURE_HEADER } from '../lib/webhook-security';
import { withIdempotency } from '../lib/idempotency';
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

    const idemKey = `stripe:${eventId}`;
    const outcome = await withIdempotency(env, idemKey, IDEMP_TTL_SECONDS, async () => {
      await handleStripeEvent(env, event as Record<string, unknown>);
      return { received: true };
    });

    if (!outcome.ok) {
      return JsonResponse.ok({ received: true, duplicate: true });
    }

    return JsonResponse.ok(outcome.value);
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
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return JsonResponse.error('Unsupported media type', 415);
  }

  const bodyText = await request.text();
  const params = new URLSearchParams(bodyText);
  const signature = request.headers.get(TWILIO_SIGNATURE_HEADER);
  const valid = await validateTwilioSignature(env.TWILIO_AUTH_TOKEN, request.url, params, signature);

  if (!valid) {
    return new Response('Invalid signature', { status: 403 });
  }

  const message = normalizeTwilio(params);
  const idemKey = `twilio:${message.messageId}`;
  const outcome = await withIdempotency(env, idemKey, IDEMP_TTL_SECONDS, async () => handleInboundMessage(env, message));

  if (!outcome.ok) {
    return JsonResponse.ok({ received: true, duplicate: true });
  }

  return JsonResponse.ok(outcome.value);
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
