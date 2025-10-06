import { createClient } from '@supabase/supabase-js';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function listClients(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('clients')
    .select('id, first_name, last_name, phone, email, consent_marketing')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`);
  }
  return data ?? [];
}
