import { Router } from 'itty-router';
import { JsonResponse } from '../lib/response';
import { listAppointments, createAppointment, getAvailability } from '../services/appointment-service';

const router = Router({ base: '/appointments' });

router.get('/', async (request: TenantScopedRequest, env: Env) => {
  const appointments = await listAppointments(env, request.tenantId!);
  return JsonResponse.ok({ appointments });
});

router.post('/', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const appointment = await createAppointment(env, request.tenantId!, request.userId!, payload);
  return JsonResponse.ok({ appointment }, { status: 201 });
});

router.post('/availability', async (request: TenantScopedRequest, env: Env) => {
  const payload = await request.json();
  const slots = await getAvailability(env, request.tenantId!, payload);
  return JsonResponse.ok({ slots });
});

export const appointmentRouter = router;
