import { Router } from 'itty-router';

import { JsonResponse } from '../lib/response';
import { createStripeClient } from '../integrations/stripe';
import { handleStripeEvent } from '../services/payment-service';
import { handleInboundMessage, normalizeTwilio } from '../services/messaging-service';
import { validateTwilio, TWILIO_SIGNATURE_HEADER } from '../lib/webhook-security';
import { withIdempotency } from '../lib/idempotency';

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
  const signature = request.headers.get(TWILIO_SIGNATURE_HEADER);
  const valid = await validateTwilio(bodyText, request.url, signature, env.TWILIO_AUTH_TOKEN);

  const params = new URLSearchParams(bodyText);

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
});

export const webhooksRouter = router;
