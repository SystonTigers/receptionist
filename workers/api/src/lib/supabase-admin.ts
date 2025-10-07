import { createClient } from '@supabase/supabase-js';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  contact_phone: string | null;
  tier?: string;
};

type UserRow = {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  password_hash: string;
};

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function insertTenant(env: Env, data: TenantRow) {
  const client = getClient(env);
  const { data: inserted, error } = await client.from('tenants').insert(data).select().single();
  if (error) {
    throw new Error(`Failed to insert tenant: ${error.message}`);
  }
  return inserted;
}

export async function insertUser(env: Env, data: UserRow) {
  const client = getClient(env);
  const { error } = await client.from('users').insert(data);
  if (error) {
    throw new Error(`Failed to insert user: ${error.message}`);
  }
}

export async function getUserByEmail(env: Env, email: string) {
  const client = getClient(env);
  const { data, error } = await client.from('users').select('*').eq('email', email).maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch user: ${error.message}`);
  }
  return data as UserRow | null;
}
