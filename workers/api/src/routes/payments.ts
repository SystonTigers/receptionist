import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { createDepositIntent, listTransactions } from '../services/payment-service';
import { requireRole } from '../lib/authorization';

const router = Router({ base: '/payments' });

router.post('/deposit-intent', async (request: TenantScopedRequest, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin', 'staff'], 'create deposit intent');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const payload = await request.json();
  const intent = await createDepositIntent(env, request.tenantId!, payload);
  return JsonResponse.ok(intent, { status: 201 });
});

router.get('/transactions', async (request: TenantScopedRequest, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin'], 'view financial transactions');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const transactions = await listTransactions(env, request.tenantId!);
  return JsonResponse.ok({ transactions });
});

export const paymentRouter = router;
