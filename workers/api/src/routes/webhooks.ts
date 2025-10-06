import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { createStripeClient } from '../integrations/stripe';
import { handleStripeEvent } from '../services/payment-service';
import { handleInboundMessage } from '../services/messaging-service';

const router = Router({ base: '/webhooks' });

router.post('/stripe', async (request: Request, env: Env) => {
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  const stripe = createStripeClient(env);

  try {
    const event = await stripe.retrieveEvent(signature, payload);
    await handleStripeEvent(env, event as Record<string, unknown>);
    return JsonResponse.ok({ received: true });
  } catch (error) {
    console.error('Stripe webhook error', error);
    return JsonResponse.error('Unable to process Stripe webhook', 400);
  }
});

router.post('/twilio', async (request: Request, env: Env) => {
  const payload = await request.json();
  const result = await handleInboundMessage(env, payload);
  return JsonResponse.ok(result);
});

export const webhooksRouter = router;
