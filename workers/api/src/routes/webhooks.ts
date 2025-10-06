import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { createStripeClient } from '../integrations/stripe';
import { handleInboundMessage } from '../services/messaging-service';

const router = Router({ base: '/webhooks' });

router.post('/stripe', async (request: Request, env: Env) => {
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  const stripe = createStripeClient(env);
  const event = await stripe.retrieveEvent(signature, payload);
  console.log('Stripe event', event);
  return JsonResponse.ok({ received: true });
});

router.post('/twilio', async (request: Request, env: Env) => {
  const payload = await request.json();
  const result = await handleInboundMessage(env, payload);
  return JsonResponse.ok(result);
});

export const webhooksRouter = router;
