export function createStripeClient(env: Env) {
  if (!env.STRIPE_SECRET_KEY) {
    console.warn('Missing STRIPE_SECRET_KEY');
  }

  return {
    async createPaymentIntent(options: { amount: number; currency: string; metadata?: Record<string, string> }) {
      console.log('TODO: call Stripe payment intent API', options);
      return { id: 'pi_placeholder', client_secret: 'secret_placeholder' };
    },
    async retrieveEvent(signature: string | null, payload: string) {
      console.log('TODO: verify Stripe webhook signature', { signature, payloadLength: payload.length });
      return { id: 'evt_placeholder', type: 'payment_intent.succeeded' };
    }
  };
}
