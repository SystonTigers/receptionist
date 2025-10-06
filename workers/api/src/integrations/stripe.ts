const STRIPE_API_BASE = 'https://api.stripe.com/v1';

type StripeCheckoutSessionOptions = {
  amount: number;
  currency: string;
  clientReferenceId: string;
  successUrl: string;
  cancelUrl: string;
  productName: string;
  description?: string;
  customerEmail?: string;
  metadata?: Record<string, string | number | undefined | null>;
};

type StripeCheckoutSession = {
  id: string;
  url?: string;
  payment_intent?: string;
  [key: string]: unknown;
};

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
  [key: string]: unknown;
};

function normaliseMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return undefined;
  }

  const normalised: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    normalised[key] = String(value);
  }
  return normalised;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function bufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseStripeSignatureHeader(header: string) {
  const parts = header.split(',');
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;
    if (key === 't') {
      timestamp = value;
    }
    if (key === 'v1') {
      signatures.push(value);
    }
  }

  return { timestamp, signatures };
}

async function verifyStripeSignature(secret: string, signature: string, payload: string) {
  const { timestamp, signatures } = parseStripeSignatureHeader(signature);
  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe signature header');
  }

  const encoder = new TextEncoder();
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSignature = bufferToHex(signatureBuffer);

  const isValid = signatures.some((candidate) => timingSafeEqual(candidate, expectedSignature));
  if (!isValid) {
    throw new Error('Stripe signature verification failed');
  }
}

async function stripeRequest(env: Env, path: string, params: URLSearchParams) {
  if (!env.STRIPE_SECRET_KEY) {
    console.warn('Missing STRIPE_SECRET_KEY; returning stubbed response');
    return null;
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params,
    redirect: 'follow'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = (payload as Record<string, unknown>)?.error
      ? JSON.stringify((payload as Record<string, unknown>).error)
      : `status ${response.status}`;
    throw new Error(`Stripe API error: ${message}`);
  }

  return response.json();
}

export function createStripeClient(env: Env) {
  return {
    async createPaymentIntent(options: { amount: number; currency: string; metadata?: Record<string, string> }) {
      const params = new URLSearchParams();
      params.append('amount', String(options.amount));
      params.append('currency', options.currency);
      params.append('payment_method_types[]', 'card');

      const metadata = normaliseMetadata(options.metadata);
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          params.append(`metadata[${key}]`, value);
        }
      }

      const result = await stripeRequest(env, '/payment_intents', params);
      if (!result) {
        return { id: `pi_test_${crypto.randomUUID()}`, client_secret: 'secret_placeholder' };
      }
      return result;
    },

    async createCheckoutSession(options: StripeCheckoutSessionOptions): Promise<StripeCheckoutSession> {
      const params = new URLSearchParams();
      params.append('mode', 'payment');
      params.append('payment_method_types[0]', 'card');
      params.append('client_reference_id', options.clientReferenceId);
      params.append('success_url', options.successUrl);
      params.append('cancel_url', options.cancelUrl);
      params.append('line_items[0][quantity]', '1');
      params.append('line_items[0][price_data][currency]', options.currency);
      params.append('line_items[0][price_data][unit_amount]', String(options.amount));
      params.append('line_items[0][price_data][product_data][name]', options.productName);
      if (options.description) {
        params.append('line_items[0][price_data][product_data][description]', options.description);
      }
      if (options.customerEmail) {
        params.append('customer_email', options.customerEmail);
      }

      const metadata = normaliseMetadata(options.metadata);
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          params.append(`metadata[${key}]`, value);
        }
      }

      const result = await stripeRequest(env, '/checkout/sessions', params);
      if (!result) {
        return {
          id: `cs_test_${crypto.randomUUID()}`,
          url: 'https://checkout.stripe.com/test-session',
          payment_intent: undefined
        };
      }
      return result as StripeCheckoutSession;
    },

    async retrieveEvent(signature: string | null, payload: string): Promise<StripeEvent> {
      if (!payload) {
        throw new Error('Empty Stripe webhook payload');
      }

      if (!env.STRIPE_WEBHOOK_SECRET || !signature) {
        console.warn('Skipping Stripe signature verification; secret not configured');
        return JSON.parse(payload) as StripeEvent;
      }

      await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, signature, payload);
      return JSON.parse(payload) as StripeEvent;
    }
  };
}
