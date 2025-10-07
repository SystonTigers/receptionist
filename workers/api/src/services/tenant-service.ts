import { createClient } from '@supabase/supabase-js';
import {
  createInvitation,
  deleteInvitation,
  listInvitations,
  updateUserRole
} from '../lib/supabase-admin';

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

export async function listTenantInvitations(env: Env, tenantId: string) {
  return listInvitations(env, tenantId);
}

export async function createTenantInvitation(env: Env, tenantId: string, email: string, role: string, invitedBy?: string) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  return createInvitation(env, {
    tenantId,
    email,
    role,
    invitedBy,
    expiresAt,
    token
  });
}

export async function updateTenantUserRole(env: Env, userId: string, role: string) {
  return updateUserRole(env, userId, role);
}

export async function removeTenantInvitation(env: Env, invitationId: string) {
  return deleteInvitation(env, invitationId);
}
