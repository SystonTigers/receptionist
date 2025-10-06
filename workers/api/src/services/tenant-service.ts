import { createClient } from '@supabase/supabase-js';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getTenantById(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client.from('tenants').select('*').eq('id', tenantId).single();
  if (error) {
    throw new Error(`Failed to fetch tenant: ${error.message}`);
  }
  return data;
}

export async function listTenantUsers(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client.from('users').select('id,email,first_name,last_name,role').eq('tenant_id', tenantId);
  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
  return data ?? [];
}
