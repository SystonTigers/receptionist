import { createClient } from '@supabase/supabase-js';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getDashboardSummary(env: Env, tenantId: string) {
  const client = getClient(env);
  const upcoming = await client
    .from('appointments')
    .select('id')
    .eq('tenant_id', tenantId)
    .gte('start_time', new Date().toISOString());
  const pendingMessages = await client
    .from('messages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('handled_by', 'human');

  const pendingBookings = await client
    .from('bookings')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');

  if (pendingBookings.error) {
    throw new Error(`Failed to load pending bookings: ${pendingBookings.error.message}`);
  }

  const { data: depositTransactions, error: depositError } = await client
    .from('payment_transactions')
    .select('amount, status, created_at')
    .eq('tenant_id', tenantId)
    .contains('metadata', { type: 'deposit' });

  if (depositError) {
    throw new Error(`Failed to load deposit transactions: ${depositError.message}`);
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let pendingDeposits = 0;
  let collectedDeposits = 0;
  let revenueLast30d = 0;

  for (const tx of depositTransactions ?? []) {
    const status = typeof tx.status === 'string' ? tx.status : '';
    const amountValue =
      typeof tx.amount === 'number'
        ? tx.amount
        : typeof tx.amount === 'string'
          ? Number.parseFloat(tx.amount)
          : 0;
    const createdAt = typeof tx.created_at === 'string' ? new Date(tx.created_at) : null;

    if (status === 'succeeded') {
      collectedDeposits += 1;
      if (createdAt && createdAt >= thirtyDaysAgo) {
        revenueLast30d += Number.isFinite(amountValue) ? amountValue : 0;
      }
    } else if (status === 'requires_payment_method' || status === 'requires_confirmation') {
      pendingDeposits += 1;
    }
  }

  return {
    upcomingAppointments: upcoming.data?.length ?? 0,
    pendingConfirmations: pendingBookings.data?.length ?? 0,
    pendingMessages: pendingMessages.data?.length ?? 0,
    revenueLast30d,
    pendingDeposits,
    collectedDeposits
  };
}

