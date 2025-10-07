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

type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by: string | null;
  accepted_by: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
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

export async function updateUserRole(env: Env, userId: string, role: string) {
  const client = getClient(env);
  const { error } = await client.from('users').update({ role }).eq('id', userId);
  if (error) {
    throw new Error(`Failed to update user role: ${error.message}`);
  }
}

export async function listInvitations(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('tenant_user_invitations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to fetch invitations: ${error.message}`);
  }
  return (data as InvitationRow[] | null) ?? [];
}

export async function createInvitation(
  env: Env,
  input: { tenantId: string; email: string; role: string; invitedBy?: string; expiresAt?: string; token: string }
) {
  const client = getClient(env);
  const payload = {
    tenant_id: input.tenantId,
    email: input.email,
    role: input.role,
    invited_by: input.invitedBy ?? null,
    expires_at: input.expiresAt ?? null,
    token: input.token
  };
  const { data, error } = await client
    .from('tenant_user_invitations')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    throw new Error(`Failed to create invitation: ${error.message}`);
  }
  return data as InvitationRow;
}

export async function getInvitationByToken(env: Env, token: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('tenant_user_invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to fetch invitation: ${error.message}`);
  }
  return data as InvitationRow | null;
}

export async function markInvitationAccepted(env: Env, invitationId: string, userId: string) {
  const client = getClient(env);
  const { error } = await client
    .from('tenant_user_invitations')
    .update({ status: 'accepted', accepted_by: userId, accepted_at: new Date().toISOString() })
    .eq('id', invitationId);
  if (error) {
    throw new Error(`Failed to update invitation: ${error.message}`);
  }
}

export async function expireInvitation(env: Env, invitationId: string) {
  const client = getClient(env);
  const { error } = await client
    .from('tenant_user_invitations')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', invitationId);
  if (error) {
    throw new Error(`Failed to expire invitation: ${error.message}`);
  }
}

export async function deleteInvitation(env: Env, invitationId: string) {
  const client = getClient(env);
  const { error } = await client.from('tenant_user_invitations').delete().eq('id', invitationId);
  if (error) {
    throw new Error(`Failed to delete invitation: ${error.message}`);
  }
}
