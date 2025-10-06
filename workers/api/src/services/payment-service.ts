import { createClient } from '@supabase/supabase-js';
import { createStripeClient } from '../integrations/stripe';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function centsToMajor(value: unknown) {
  const cents = toNumber(value);
  if (cents === undefined) return undefined;
  return Math.round(cents) / 100;
}

function coerceString(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

async function mutateBookingDeposit(
  client: ReturnType<typeof getClient>,
  tenantId: string,
  bookingId: string,
  mutate: (context: {
    deposit: Record<string, unknown>;
    currentStatus: string;
    timestamp: string;
  }) => { deposit?: Record<string, unknown>; bookingStatus?: string }
) {
  const { data, error } = await client
    .from('bookings')
    .select('metadata, status')
    .eq('tenant_id', tenantId)
    .eq('id', bookingId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load booking for deposit update: ${error?.message ?? 'not found'}`);
  }

  const metadata = ((data as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
  const existingDeposit =
    metadata && typeof metadata.deposit === 'object' && metadata.deposit !== null
      ? { ...(metadata.deposit as Record<string, unknown>) }
      : {};

  const timestamp = new Date().toISOString();
  const result = mutate({
    deposit: existingDeposit,
    currentStatus: (data as { status: string }).status,
    timestamp
  });

  const updatedDeposit = {
    ...existingDeposit,
    ...(result.deposit ?? {}),
    updatedAt: timestamp
  };

  if (!updatedDeposit.createdAt && typeof existingDeposit.createdAt === 'string') {
    updatedDeposit.createdAt = existingDeposit.createdAt;
  } else if (!updatedDeposit.createdAt) {
    updatedDeposit.createdAt = timestamp;
  }

  metadata.deposit = updatedDeposit;

  const bookingStatus = result.bookingStatus ?? (data as { status: string }).status;

  const { error: updateError } = await client
    .from('bookings')
    .update({ metadata, status: bookingStatus, updated_at: timestamp })
    .eq('tenant_id', tenantId)
    .eq('id', bookingId);

  if (updateError) {
    throw new Error(`Failed to update booking record: ${updateError.message}`);
  }

  return { deposit: updatedDeposit, timestamp, bookingStatus };
}

export async function createDepositIntent(env: Env, tenantId: string, payload: any) {
  const stripe = createStripeClient(env);
  const amount = Math.round((payload.amount ?? 0) * 100);
  const currency = payload.currency ?? 'gbp';
  const intent = await stripe.createPaymentIntent({
    amount,
    currency,
    metadata: {
      tenantId,
      appointmentId: payload.appointmentId ?? ''
    }
  });
  // TODO: persist transaction stub
  return intent;
}

export async function listTransactions(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('payment_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }
  return data ?? [];
}

export async function handleStripeEvent(env: Env, event: Record<string, unknown>) {
  if (!event || typeof event !== 'object') {
    console.warn('Received invalid Stripe event payload');
    return { handled: false };
  }

  const client = getClient(env);
  const eventType = coerceString(event.type);

  if (!eventType) {
    return { handled: false };
  }

  const session = (event.data as { object?: Record<string, unknown> } | undefined)?.object;

  if (eventType === 'checkout.session.completed') {
    if (!session) return { handled: false };
    const metadata = (session.metadata as Record<string, unknown> | undefined) ?? {};
    const tenantId = coerceString(metadata.tenantId ?? metadata.tenant_id);
    const bookingId = coerceString(session.client_reference_id);

    if (!tenantId || !bookingId) {
      console.warn('Stripe checkout session missing tenant or booking reference');
      return { handled: false };
    }

    const { timestamp } = await mutateBookingDeposit(client, tenantId, bookingId, ({ deposit, timestamp }) => {
      deposit.required = true;
      deposit.status = 'paid';
      const amount = centsToMajor(session.amount_total ?? session.amount_subtotal);
      if (amount !== undefined) {
        deposit.amount = amount;
      }
      const currency = coerceString(session.currency);
      if (currency) {
        deposit.currency = currency;
      }
      const sessionId = coerceString(session.id);
      if (sessionId) {
        deposit.checkoutSessionId = sessionId;
      }
      const sessionUrl = coerceString(session.url);
      if (sessionUrl) {
        deposit.checkoutUrl = sessionUrl;
      }
      deposit.paidAt = timestamp;
      return { deposit, bookingStatus: 'confirmed' };
    });

    const paymentIntentId = coerceString(session.payment_intent);
    const { error: txError } = await client
      .from('payment_transactions')
      .update({
        status: 'succeeded',
        stripe_payment_intent_id: paymentIntentId ?? null,
        updated_at: timestamp
      })
      .eq('tenant_id', tenantId)
      .contains('metadata', { bookingId });

    if (txError) {
      throw new Error(`Failed to update payment transaction: ${txError.message}`);
    }

    return { handled: true };
  }

  if (eventType === 'checkout.session.expired' || eventType === 'checkout.session.async_payment_failed') {
    if (!session) return { handled: false };
    const metadata = (session.metadata as Record<string, unknown> | undefined) ?? {};
    const tenantId = coerceString(metadata.tenantId ?? metadata.tenant_id);
    const bookingId = coerceString(session.client_reference_id);

    if (!tenantId || !bookingId) {
      console.warn('Stripe checkout session failure missing identifiers');
      return { handled: false };
    }

    const depositStatus = eventType === 'checkout.session.expired' ? 'cancelled' : 'failed';
    const { timestamp } = await mutateBookingDeposit(client, tenantId, bookingId, ({ deposit }) => {
      deposit.required = true;
      deposit.status = depositStatus;
      const sessionId = coerceString(session.id);
      if (sessionId) {
        deposit.checkoutSessionId = sessionId;
      }
      const sessionUrl = coerceString(session.url);
      if (sessionUrl) {
        deposit.checkoutUrl = sessionUrl;
      }
      return { deposit };
    });

    const txStatus = depositStatus === 'cancelled' ? 'cancelled' : 'failed';
    const { error: txError } = await client
      .from('payment_transactions')
      .update({ status: txStatus, updated_at: timestamp })
      .eq('tenant_id', tenantId)
      .contains('metadata', { bookingId });

    if (txError) {
      throw new Error(`Failed to update payment transaction after ${depositStatus}: ${txError.message}`);
    }

    return { handled: true };
  }

  return { handled: false };
}
