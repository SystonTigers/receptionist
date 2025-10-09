import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { listAppointments, createAppointment, getAvailability } from '../services/appointment-service';

const router = Router({ base: '/appointments' });

router.get('/', async (request: TenantScopedRequest, env: Env) => {
  const appointments = await listAppointments(env, request.tenantId!, request.logger);
  return JsonResponse.ok({ appointments });
});

router.post('/', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return JsonResponse.error('Invalid JSON body', 400);
  }

  const appointment = await createAppointment(
    env,
    request.tenantId!,
    request.userId!,
    payload as Record<string, unknown>,
    request.logger
  );
  return JsonResponse.ok({ appointment }, { status: 201 });
});

router.post('/availability', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return JsonResponse.error('Invalid JSON body', 400);
  }

  const slots = await getAvailability(env, request.tenantId!, payload as Record<string, unknown>, request.logger);
  return JsonResponse.ok({ slots });
});

export const appointmentRouter = router;
