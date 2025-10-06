import { z } from 'zod';
import { JsonResponse } from '../lib/response';
import { insertTenant, insertUser, getUserByEmail } from '../lib/supabase-admin';
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
    contact_phone: payload.phone ?? null
  });

  const passwordHash = await hashPassword(payload.password);
  const userId = crypto.randomUUID();
  await insertUser(env, {
    id: userId,
    tenant_id: tenantId,
    email: payload.email,
    first_name: payload.email.split('@')[0],
    last_name: 'Owner',
    role: 'admin',
    password_hash: passwordHash
  });

  return {
    tenant,
    adminUserId: userId,
    token: buildTenantToken({ tenantId, role: 'admin', sub: userId })
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
    token: buildTenantToken({ tenantId: user.tenant_id, role: user.role, sub: user.id }),
    user: {
      id: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      role: user.role
    }
  };
}
