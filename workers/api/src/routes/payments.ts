import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { createDepositIntent, listTransactions } from '../services/payment-service';

const router = Router({ base: '/payments' });

router.post('/deposit-intent', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const intent = await createDepositIntent(env, request.tenantId!, payload);
  return JsonResponse.ok(intent, { status: 201 });
});

router.get('/transactions', async (request: TenantScopedRequest, env: Env) => {
  const transactions = await listTransactions(env, request.tenantId!);
  return JsonResponse.ok({ transactions });
});

export const paymentRouter = router;
