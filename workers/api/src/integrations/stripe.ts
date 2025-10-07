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

type StripeRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: URLSearchParams;
};

async function stripeRequest(env: Env, path: string, options: StripeRequestOptions = {}) {
  if (!env.STRIPE_SECRET_KEY) {
    console.warn('Missing STRIPE_SECRET_KEY; returning stubbed response');
    return null;
  }

  const method = options.method ?? 'POST';
  const url = new URL(`${STRIPE_API_BASE}${path}`);
  let body: BodyInit | undefined;

  if (method === 'GET') {
    if (options.params) {
      url.search = options.params.toString();
    }
  } else if (options.params) {
    body = options.params;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
  };

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body,
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

      const result = await stripeRequest(env, '/payment_intents', { params });
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

      const result = await stripeRequest(env, '/checkout/sessions', { params });
      if (!result) {
        return {
          id: `cs_test_${crypto.randomUUID()}`,
          url: 'https://checkout.stripe.com/test-session',
          payment_intent: undefined
        };
      }
      return result as StripeCheckoutSession;
    },

    async createCustomer(options: {
      email: string;
      name?: string;
      metadata?: Record<string, string | number | undefined | null>;
    }) {
      const params = new URLSearchParams();
      params.append('email', options.email);
      if (options.name) {
        params.append('name', options.name);
      }

      const metadata = normaliseMetadata(options.metadata);
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          params.append(`metadata[${key}]`, value);
        }
      }

      const result = await stripeRequest(env, '/customers', { params });
      if (!result) {
        return { id: `cus_test_${crypto.randomUUID()}` };
      }
      return result as { id: string };
    },

    async createSubscription(options: {
      customerId: string;
      priceId: string;
      trialPeriodDays?: number;
      metadata?: Record<string, string | number | undefined | null>;
    }) {
      const params = new URLSearchParams();
      params.append('customer', options.customerId);
      params.append('items[0][price]', options.priceId);
      params.append('payment_behavior', 'allow_incomplete');

      if (typeof options.trialPeriodDays === 'number') {
        params.append('trial_period_days', String(options.trialPeriodDays));
      }

      const metadata = normaliseMetadata(options.metadata);
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          params.append(`metadata[${key}]`, value);
        }
      }

      const result = await stripeRequest(env, '/subscriptions', { params });
      if (!result) {
        const now = Math.floor(Date.now() / 1000);
        return {
          id: `sub_test_${crypto.randomUUID()}`,
          status: 'trialing',
          current_period_start: now,
          current_period_end: now + 30 * 24 * 60 * 60
        };
      }
      return result as Record<string, unknown> & { id: string };
    },

    async listInvoices(options: { customerId: string; limit?: number }) {
      const params = new URLSearchParams();
      params.append('customer', options.customerId);
      params.append('limit', String(options.limit ?? 12));
      const result = await stripeRequest(env, '/invoices', { method: 'GET', params });
      if (!result) {
        return { data: [] };
      }
      return result as { data: Array<Record<string, unknown>> };
    },

    async createBillingPortalSession(options: { customerId: string; returnUrl: string }) {
      const params = new URLSearchParams();
      params.append('customer', options.customerId);
      params.append('return_url', options.returnUrl);
      const result = await stripeRequest(env, '/billing_portal/sessions', { params });
      if (!result) {
        return { url: options.returnUrl };
      }
      return result as { url: string };
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
