import { z } from 'zod';
import type { Role } from '@ai-hairdresser/shared';
import { JsonResponse } from '../lib/response';
import {
  insertTenant,
  insertUser,
  getUserByEmail,
  getInvitationByToken,
  markInvitationAccepted,
  expireInvitation
} from '../lib/supabase-admin';
import { hashPassword, verifyPassword } from '../lib/passwords';
import { buildTenantToken } from '../lib/tenant-token';

const signupInput = z.object({
  tenantName: z.string(),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional()
});

export async function createTenantWithAdmin(input: unknown, env: Env) {
  const payload = signupInput.parse(input);
  const tenantId = crypto.randomUUID();
  const tenant = await insertTenant(env, {
    id: tenantId,
    name: payload.tenantName,
    slug: payload.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    contact_email: payload.email,
    contact_phone: payload.phone ?? null,
    tier: 'starter'
  });

  const passwordHash = await hashPassword(payload.password);
  const userId = crypto.randomUUID();
  await insertUser(env, {
    id: userId,
    tenant_id: tenantId,
    email: payload.email,
    first_name: payload.email.split('@')[0],
    last_name: 'Owner',
    role: 'owner',
    password_hash: passwordHash
  });

  return {
    tenant,
    adminUserId: userId,
    token: buildTenantToken({ tenantId, role: 'owner', sub: userId })
  };
}

const loginInput = z.object({
  email: z.string().email(),
  password: z.string()
});

export async function authenticateUser(input: unknown, env: Env) {
  const payload = loginInput.parse(input);
  const user = await getUserByEmail(env, payload.email);
  if (!user) {
    throw JsonResponse.error('Invalid credentials', 401);
  }

  const valid = await verifyPassword(payload.password, user.password_hash);
  if (!valid) {
    throw JsonResponse.error('Invalid credentials', 401);
  }

  return {
    token: buildTenantToken({ tenantId: user.tenant_id, role: user.role as Role, sub: user.id }),
    user: {
      id: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      role: user.role
    }
  };
}

const invitationAcceptanceInput = z.object({
  token: z.string().min(10),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8)
});

export async function acceptInvitation(input: unknown, env: Env) {
  const payload = invitationAcceptanceInput.parse(input);
  const invitation = await getInvitationByToken(env, payload.token);

  if (!invitation || invitation.status !== 'pending') {
    throw JsonResponse.error('Invitation not found or already used', 404);
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    await expireInvitation(env, invitation.id);
    throw JsonResponse.error('Invitation has expired', 410);
  }

  const existingUser = await getUserByEmail(env, invitation.email);
  if (existingUser) {
    throw JsonResponse.error('User already registered with this email', 409);
  }

  const passwordHash = await hashPassword(payload.password);
  const userId = crypto.randomUUID();

  await insertUser(env, {
    id: userId,
    tenant_id: invitation.tenant_id,
    email: invitation.email,
    first_name: payload.firstName,
    last_name: payload.lastName,
    role: invitation.role,
    password_hash: passwordHash
  });

  await markInvitationAccepted(env, invitation.id, userId);

  return {
    token: buildTenantToken({ tenantId: invitation.tenant_id, role: invitation.role as Role, sub: userId }),
    user: {
      id: userId,
      email: invitation.email,
      tenantId: invitation.tenant_id,
      role: invitation.role
    }
  };
}
