import { createClient } from '@supabase/supabase-js';
import { createStripeClient } from '../integrations/stripe';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
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
