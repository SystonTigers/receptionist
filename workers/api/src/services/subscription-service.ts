import { createClient } from '@supabase/supabase-js';
import { createStripeClient } from '../integrations/stripe';

const DEFAULT_TRIAL_DAYS = 14;

type TenantSubscriptionRecord = {
  tenant_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan_id: string;
  status: string;
  start_date: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
  delinquent: boolean;
  cancel_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseClient = ReturnType<typeof getClient>;

type InvoiceSummary = {
  id: string;
  status: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  nextPaymentAttempt: string | null;
};

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function ensureString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function stripeTimestampToIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) {
      return new Date(value).toISOString();
    }
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      if (numeric > 1e12) {
        return new Date(numeric).toISOString();
      }
      return new Date(numeric * 1000).toISOString();
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function centsToMajor(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value) / 100;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.round(numeric) / 100;
    }
  }
  return null;
}

function getRecordValue<T>(record: Record<string, unknown> | undefined, key: string): T | undefined {
  if (!record) {
    return undefined;
  }
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  return value as T;
}

async function findSubscriptionRecord(
  client: SupabaseClient,
  identifiers: { tenantId?: string; customerId?: string; subscriptionId?: string }
): Promise<TenantSubscriptionRecord | null> {
  if (identifiers.tenantId) {
    const { data, error } = await client
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', identifiers.tenantId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to lookup tenant subscription: ${error.message}`);
    }
    if (data) {
      return data as TenantSubscriptionRecord;
    }
  }

  if (identifiers.subscriptionId) {
    const { data, error } = await client
      .from('tenant_subscriptions')
      .select('*')
      .eq('stripe_subscription_id', identifiers.subscriptionId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to lookup subscription by Stripe id: ${error.message}`);
    }
    if (data) {
      return data as TenantSubscriptionRecord;
    }
  }

  if (identifiers.customerId) {
    const { data, error } = await client
      .from('tenant_subscriptions')
      .select('*')
      .eq('stripe_customer_id', identifiers.customerId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to lookup subscription by customer id: ${error.message}`);
    }
    if (data) {
      return data as TenantSubscriptionRecord;
    }
  }

  return null;
}

async function updateSubscription(
  client: SupabaseClient,
  tenantId: string,
  updates: Partial<Pick<TenantSubscriptionRecord, keyof TenantSubscriptionRecord>>
) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString()
  };
  const { error } = await client
    .from('tenant_subscriptions')
    .update(payload)
    .eq('tenant_id', tenantId);
  if (error) {
    throw new Error(`Failed to update subscription record: ${error.message}`);
  }
}

function mapRecordToStatus(record: TenantSubscriptionRecord) {
  return {
    planId: record.plan_id,
    status: record.status,
    startDate: record.start_date,
    nextBillingDate: record.next_billing_date,
    delinquent: record.delinquent,
    currentPeriodEnd: record.current_period_end,
    cancelAt: record.cancel_at,
    cancelledAt: record.cancelled_at
  };
}

function extractPrimaryInvoiceLine(invoice: Record<string, unknown> | undefined) {
  const lines = getRecordValue<{ data?: Array<Record<string, unknown>> }>(invoice, 'lines')?.data;
  if (Array.isArray(lines) && lines.length > 0) {
    return lines[0];
  }
  return undefined;
}

export async function createTenantSubscription(
  env: Env,
  options: { tenantId: string; tenantName: string; email: string; trialPeriodDays?: number }
) {
  if (!env.STRIPE_DEFAULT_PRICE_ID) {
    throw new Error('Missing STRIPE_DEFAULT_PRICE_ID');
  }

  const stripe = createStripeClient(env);
  const customer = await stripe.createCustomer({
    email: options.email,
    name: options.tenantName,
    metadata: { tenantId: options.tenantId }
  });

  const subscription = await stripe.createSubscription({
    customerId: customer.id,
    priceId: env.STRIPE_DEFAULT_PRICE_ID,
    trialPeriodDays: options.trialPeriodDays ?? DEFAULT_TRIAL_DAYS,
    metadata: { tenantId: options.tenantId }
  });

  const subscriptionRecord = subscription as Record<string, unknown>;
  const startDate =
    stripeTimestampToIso(getRecordValue(subscriptionRecord, 'start_date')) ??
    stripeTimestampToIso(getRecordValue(subscriptionRecord, 'current_period_start')) ??
    new Date().toISOString();
  const currentPeriodEnd = stripeTimestampToIso(getRecordValue(subscriptionRecord, 'current_period_end'));

  const client = getClient(env);
  const record = {
    tenant_id: options.tenantId,
    stripe_customer_id: customer.id,
    stripe_subscription_id: ensureString(getRecordValue(subscriptionRecord, 'id')) ?? null,
    plan_id: env.STRIPE_DEFAULT_PRICE_ID,
    status: ensureString(getRecordValue(subscriptionRecord, 'status')) ?? 'incomplete',
    start_date: startDate,
    current_period_end: currentPeriodEnd,
    next_billing_date: currentPeriodEnd,
    delinquent: false,
    cancel_at: stripeTimestampToIso(getRecordValue(subscriptionRecord, 'cancel_at')),
    cancelled_at: stripeTimestampToIso(getRecordValue(subscriptionRecord, 'canceled_at')),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await client
    .from('tenant_subscriptions')
    .upsert(record, { onConflict: 'tenant_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to persist tenant subscription: ${error.message}`);
  }

  return data as TenantSubscriptionRecord;
}

export async function getTenantSubscriptionRecord(env: Env, tenantId: string) {
  const client = getClient(env);
  return findSubscriptionRecord(client, { tenantId });
}

export async function getTenantSubscriptionStatus(env: Env, tenantId: string) {
  const client = getClient(env);
  const record = await findSubscriptionRecord(client, { tenantId });
  if (!record) {
    return null;
  }
  return mapRecordToStatus(record);
}

export async function listTenantInvoices(env: Env, tenantId: string, options: { limit?: number } = {}) {
  const client = getClient(env);
  const record = await findSubscriptionRecord(client, { tenantId });
  if (!record) {
    throw new Error('Subscription not configured for tenant');
  }

  const stripe = createStripeClient(env);
  const response = await stripe.listInvoices({ customerId: record.stripe_customer_id, limit: options.limit });
  const invoices: InvoiceSummary[] = (response.data ?? []).map((invoice) => {
    const invoiceRecord = invoice as Record<string, unknown>;
    const primaryLine = extractPrimaryInvoiceLine(invoiceRecord);
    const period = getRecordValue<Record<string, unknown>>(primaryLine, 'period');
    return {
      id: ensureString(getRecordValue(invoiceRecord, 'id')) ?? crypto.randomUUID(),
      status: ensureString(getRecordValue(invoiceRecord, 'status')) ?? null,
      amountDue: centsToMajor(getRecordValue(invoiceRecord, 'amount_due')),
      amountPaid: centsToMajor(getRecordValue(invoiceRecord, 'amount_paid')),
      currency: ensureString(getRecordValue(invoiceRecord, 'currency')) ?? null,
      hostedInvoiceUrl: ensureString(getRecordValue(invoiceRecord, 'hosted_invoice_url')) ?? null,
      createdAt: stripeTimestampToIso(getRecordValue(invoiceRecord, 'created')),
      periodStart:
        stripeTimestampToIso(getRecordValue(period, 'start')) ??
        stripeTimestampToIso(getRecordValue(invoiceRecord, 'period_start')),
      periodEnd:
        stripeTimestampToIso(getRecordValue(period, 'end')) ??
        stripeTimestampToIso(getRecordValue(invoiceRecord, 'period_end')),
      nextPaymentAttempt: stripeTimestampToIso(getRecordValue(invoiceRecord, 'next_payment_attempt'))
    };
  });

  return { invoices };
}

export async function createCustomerPortalSession(env: Env, tenantId: string, returnUrl?: string) {
  const client = getClient(env);
  const record = await findSubscriptionRecord(client, { tenantId });
  if (!record) {
    throw new Error('Subscription not configured for tenant');
  }

  const stripe = createStripeClient(env);
  const portal = await stripe.createBillingPortalSession({
    customerId: record.stripe_customer_id,
    returnUrl: returnUrl ?? env.STRIPE_BILLING_PORTAL_RETURN_URL ?? 'https://dashboard.stripe.com/test'
  });

  return portal;
}

export async function markInvoiceSucceeded(env: Env, invoice: Record<string, unknown>) {
  const client = getClient(env);
  const customerId = ensureString(getRecordValue(invoice, 'customer'));
  const subscriptionId = ensureString(getRecordValue(invoice, 'subscription'));
  if (!customerId && !subscriptionId) {
    console.warn('Invoice success event missing identifiers');
    return;
  }

  const record = await findSubscriptionRecord(client, { customerId, subscriptionId });
  if (!record) {
    console.warn('No subscription record found for successful invoice', { customerId, subscriptionId });
    return;
  }

  const primaryLine = extractPrimaryInvoiceLine(invoice);
  const period = getRecordValue<Record<string, unknown>>(primaryLine, 'period');
  const price = getRecordValue<Record<string, unknown>>(primaryLine, 'price');
  const updates: Partial<TenantSubscriptionRecord> = {
    status: ensureString(getRecordValue(invoice, 'status')) ?? 'active',
    delinquent: false,
    next_billing_date:
      stripeTimestampToIso(getRecordValue(invoice, 'next_payment_attempt')) ??
      stripeTimestampToIso(getRecordValue(period, 'end')) ??
      stripeTimestampToIso(getRecordValue(invoice, 'period_end')) ??
      record.next_billing_date,
    current_period_end:
      stripeTimestampToIso(getRecordValue(period, 'end')) ??
      stripeTimestampToIso(getRecordValue(invoice, 'period_end')) ??
      record.current_period_end,
    start_date:
      record.start_date ??
      stripeTimestampToIso(getRecordValue(period, 'start')) ??
      record.start_date
  };

  const planId = ensureString(getRecordValue(price, 'id'));
  if (planId) {
    updates.plan_id = planId;
  }
  if (subscriptionId) {
    updates.stripe_subscription_id = subscriptionId;
  }

  await updateSubscription(client, record.tenant_id, updates);
}

export async function markInvoiceFailed(env: Env, invoice: Record<string, unknown>) {
  const client = getClient(env);
  const customerId = ensureString(getRecordValue(invoice, 'customer'));
  const subscriptionId = ensureString(getRecordValue(invoice, 'subscription'));
  if (!customerId && !subscriptionId) {
    console.warn('Invoice failure event missing identifiers');
    return;
  }

  const record = await findSubscriptionRecord(client, { customerId, subscriptionId });
  if (!record) {
    console.warn('No subscription record found for failed invoice', { customerId, subscriptionId });
    return;
  }

  const updates: Partial<TenantSubscriptionRecord> = {
    status: 'past_due',
    delinquent: true,
    next_billing_date:
      stripeTimestampToIso(getRecordValue(invoice, 'next_payment_attempt')) ??
      stripeTimestampToIso(getRecordValue(invoice, 'period_end')) ??
      record.next_billing_date
  };

  await updateSubscription(client, record.tenant_id, updates);
}

export async function markSubscriptionDeleted(env: Env, subscription: Record<string, unknown>) {
  const client = getClient(env);
  const subscriptionId = ensureString(getRecordValue(subscription, 'id'));
  const customerId = ensureString(getRecordValue(subscription, 'customer'));
  if (!subscriptionId && !customerId) {
    console.warn('Subscription deletion missing identifiers');
    return;
  }

  const record = await findSubscriptionRecord(client, { subscriptionId, customerId });
  if (!record) {
    console.warn('No subscription record found for deleted subscription', { subscriptionId, customerId });
    return;
  }

  const updates: Partial<TenantSubscriptionRecord> = {
    status: ensureString(getRecordValue(subscription, 'status')) ?? 'canceled',
    delinquent: false,
    stripe_subscription_id: subscriptionId ?? record.stripe_subscription_id,
    cancel_at: stripeTimestampToIso(getRecordValue(subscription, 'cancel_at')),
    cancelled_at: stripeTimestampToIso(getRecordValue(subscription, 'canceled_at')),
    current_period_end:
      stripeTimestampToIso(getRecordValue(subscription, 'current_period_end')) ?? record.current_period_end,
    next_billing_date: null
  };

  await updateSubscription(client, record.tenant_id, updates);
}
