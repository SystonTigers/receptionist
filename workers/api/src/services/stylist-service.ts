import { createClient } from '@supabase/supabase-js';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function listStylists(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('stylists')
    .select('id, first_name, last_name, specialties, working_hours')
    .eq('tenant_id', tenantId)
    .order('first_name');
  if (error) {
    throw new Error(`Failed to fetch stylists: ${error.message}`);
  }
  return data ?? [];
}

export async function upsertStylistRota(env: Env, tenantId: string, payload: any) {
  const client = getClient(env);
  const { error } = await client
    .from('stylist_rotas')
    .upsert({
      tenant_id: tenantId,
      stylist_id: payload.stylistId,
      rota: payload.rota,
      updated_at: new Date().toISOString()
    });
  if (error) {
    throw new Error(`Failed to update rota: ${error.message}`);
  }
}
