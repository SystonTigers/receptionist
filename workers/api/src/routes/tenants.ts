import { Router } from 'itty-router';
import { z } from 'zod';
import { JsonResponse } from '../lib/response';
import {
  createTenantInvitation,
  getTenantById,
  listTenantInvitations,
  listTenantUsers,
  removeTenantInvitation,
  updateTenantUserRole
} from '../services/tenant-service';
import { requireRole } from '../lib/authorization';
import type { Role } from '@ai-hairdresser/shared';

import { getTenantById, listTenantUsers } from '../services/tenant-service';
import { assignTenantPlan } from '../services/plan-service';
import { getPlanOverview } from '../middleware/features';


const router = Router({ base: '/tenants' });

router.get('/me', async (request: TenantScopedRequest, env: Env) => {
  const tenant = await getTenantById(env, request.tenantId!);
  return JsonResponse.ok(tenant);
});

router.get('/me/users', async (request: TenantScopedRequest, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin'], 'list tenant users');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const users = await listTenantUsers(env, request.tenantId!);
  const invitations = await listTenantInvitations(env, request.tenantId!);
  return JsonResponse.ok({ users, invitations });
});

router.post('/me/invitations', async (request: TenantScopedRequest, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin'], 'create user invitation');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const payload = await request.json();
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const role = typeof payload.role === 'string' ? (payload.role as Role) : undefined;

  if (!email || !role) {
    return JsonResponse.error('Email and role are required', 400);
  }

  const invitation = await createTenantInvitation(env, request.tenantId!, email, role, request.userId);
  return JsonResponse.ok({ invitation }, { status: 201 });
});

router.delete('/me/invitations/:id', async (request: TenantScopedRequest & { params?: Record<string, string> }, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin'], 'delete user invitation');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const invitationId = request.params?.id;
  if (!invitationId) {
    return JsonResponse.error('Missing invitation id', 400);
  }

  await removeTenantInvitation(env, invitationId);
  return new Response(null, { status: 204 });
});

router.patch('/me/users/:id', async (request: TenantScopedRequest & { params?: Record<string, string> }, env: Env) => {
  const forbidden = requireRole(request, ['owner'], 'update user role');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const userId = request.params?.id;
  if (!userId) {
    return JsonResponse.error('Missing user id', 400);
  }

  const payload = await request.json();
  const role = typeof payload.role === 'string' ? (payload.role as Role) : undefined;
  if (!role) {
    return JsonResponse.error('Role is required', 400);
  }

  await updateTenantUserRole(env, userId, role);
  return JsonResponse.ok({ ok: true });
});

router.get('/me/plan', async (request: TenantScopedRequest, env: Env) => {
  const overview = await getPlanOverview(env, request.tenantId!);
  return JsonResponse.ok(overview);
});

const planUpdateSchema = z.object({
  planCode: z.enum(['free', 'basic', 'pro'])
});

router.post('/me/plan', async (request: TenantScopedRequest, env: Env) => {
  if (request.role && request.role !== 'admin') {
    return JsonResponse.error('Only administrators can change plans', 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = planUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return JsonResponse.error('Invalid payload', 400, parsed.error.flatten());
  }

  await assignTenantPlan(env, request.tenantId!, parsed.data.planCode);
  const overview = await getPlanOverview(env, request.tenantId!);
  return JsonResponse.ok(overview, { status: 202 });
});

export const tenantRouter = router;
