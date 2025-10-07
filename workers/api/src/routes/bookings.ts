import { Router } from 'itty-router';
import { z } from 'zod';
import {
  bookingCreateSchema,
  bookingUpdateSchema
} from '@ai-hairdresser/shared';
import { JsonResponse } from '../lib/response';
import {
  cancelBooking,
  createBooking,
  listBookings,
  updateBooking
} from '../services/booking-service';
import { requireRole } from '../lib/authorization';

const router = Router({ base: '/bookings' });

const listBookingsQuerySchema = z.object({
  start_time: z.string().datetime().optional()
});

type RequestWithParams = TenantScopedRequest & { params?: Record<string, string> };

router.get('/', async (request: TenantScopedRequest, env: Env) => {
  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams);
  const parsedQuery = listBookingsQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return JsonResponse.error('Invalid query parameters', 400, parsedQuery.error.flatten());
  }

  const bookings = await listBookings(env, request.tenantId!, {
    startTime: parsedQuery.data.start_time
  });

  return JsonResponse.ok({ bookings });
});

router.post('/', async (request: TenantScopedRequest, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin', 'staff'], 'create booking');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const body = await request.json();
  const parsed = bookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return JsonResponse.error('Invalid payload', 400, parsed.error.flatten());
  }

  if (!request.userId) {
    return JsonResponse.error('Missing user context', 401);
  }

  const { booking, checkoutUrl } = await createBooking(env, request.tenantId!, request.userId, parsed.data);
  return JsonResponse.ok({ booking, checkoutUrl }, { status: 201 });
});

router.patch('/:id', async (request: RequestWithParams, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin', 'staff'], 'update booking');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const bookingId = request.params?.id;
  if (!bookingId) {
    return JsonResponse.error('Missing booking id', 400);
  }

  const body = await request.json();
  const parsed = bookingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return JsonResponse.error('Invalid payload', 400, parsed.error.flatten());
  }

  const booking = await updateBooking(env, request.tenantId!, bookingId, parsed.data);
  return JsonResponse.ok({ booking });
});

router.delete('/:id', async (request: RequestWithParams, env: Env) => {
  const forbidden = requireRole(request, ['owner', 'admin', 'staff'], 'cancel booking');
  if (forbidden instanceof Response) {
    return forbidden;
  }

  const bookingId = request.params?.id;
  if (!bookingId) {
    return JsonResponse.error('Missing booking id', 400);
  }

  const booking = await cancelBooking(env, request.tenantId!, bookingId);
  return JsonResponse.ok({ booking });
});

export const bookingRouter = router;
