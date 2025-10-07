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

import { initializeTenantOnboarding } from './onboarding-service';

import { recordAuditLog } from './audit-log-service';
import { createTenantSubscription } from './subscription-service'

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

  await initializeTenantOnboarding(env, {
    id: tenantId,
    name: tenant.name,
    contactEmail: tenant.contact_email
  await createTenantSubscription(env, {
    tenantId,
    tenantName: payload.tenantName,
    email: payload.email
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
    await recordAuditLog(env, {
      tenantId: null,
      userId: null,
      action: 'auth.failed_login',
      resource: 'auth',
      resourceId: null,
      after: {
        hashedIdentifier: await hashIdentifier(payload.email)
      }
    });
    throw JsonResponse.error('Invalid credentials', 401);
  }

  const valid = await verifyPassword(payload.password, user.password_hash);
  if (!valid) {
    await recordAuditLog(env, {
      tenantId: user.tenant_id,
      userId: user.id,
      action: 'auth.failed_login',
      resource: 'auth',
      resourceId: user.id,
      after: {
        hashedIdentifier: await hashIdentifier(payload.email)
      }
    });
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


async function hashIdentifier(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

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
