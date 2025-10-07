import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import {
  generateAdCopy,
  schedulePost,
  createReferralCode,
  listReferralCodes,
  redeemReferralCode
} from '../services/marketing-service';

const router = Router({ base: '/marketing' });

router.post('/generate', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const result = await generateAdCopy(env, request.tenantId!, payload);
  return JsonResponse.ok(result);
});

router.post('/schedule', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const result = await schedulePost(env, request.tenantId!, payload);
  return JsonResponse.ok(result, { status: 202 });
});

router.post('/referrals', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const result = await createReferralCode(env, request.tenantId!, payload);
  return JsonResponse.ok(result, { status: 201 });
});

router.get('/referrals', async (request: TenantScopedRequest, env: Env) => {
  const codes = await listReferralCodes(env, request.tenantId!);
  return JsonResponse.ok({ codes });
});

router.post('/referrals/redeem', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const result = await redeemReferralCode(env, request.tenantId!, payload);
  return JsonResponse.ok(result);
});

export const marketingRouter = router;
