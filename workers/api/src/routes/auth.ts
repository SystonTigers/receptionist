import { Router } from 'itty-router';
import { z } from 'zod';
import { JsonResponse } from '../lib/response';
import { createTenantWithAdmin, authenticateUser, acceptInvitation } from '../services/auth-service';

const router = Router({ base: '/auth' });

const signupSchema = z.object({
  tenantName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional()
});

router.post('/signup', async (request: TenantScopedRequest, env: Env) => {
  const body = await request.json();
  const parseResult = signupSchema.safeParse(body);
  if (!parseResult.success) {
    return JsonResponse.error('Invalid payload', 400, parseResult.error.flatten());
  }

  const result = await createTenantWithAdmin(parseResult.data, env);
  return JsonResponse.ok(result, { status: 201 });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

router.post('/login', async (request: TenantScopedRequest, env: Env) => {
  const body = await request.json();
  const parseResult = loginSchema.safeParse(body);
  if (!parseResult.success) {
    return JsonResponse.error('Invalid payload', 400, parseResult.error.flatten());
  }
  const result = await authenticateUser(parseResult.data, env);
  return JsonResponse.ok(result);
});

router.post('/accept-invite', async (request: TenantScopedRequest, env: Env) => {
  const body = await request.json();
  const result = await acceptInvitation(body, env);
  return JsonResponse.ok(result, { status: 201 });
});

export const authRouter = router;
