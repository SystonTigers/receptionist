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

  return {
    upcomingAppointments: upcoming.data?.length ?? 0,
    pendingConfirmations: 0,
    pendingMessages: pendingMessages.data?.length ?? 0,
    revenueLast30d: 0
  };
}

export async function getUsageMetrics(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('usage_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`Failed to fetch usage metrics: ${error.message}`);
  }
  return data ?? [];
}
