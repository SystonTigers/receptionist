import { Router } from 'itty-router';
import { z } from 'zod';
import { JsonResponse } from '../lib/response';
import { generateAssistantSuggestion } from '../services/assistant-service';

const router = Router({ base: '/assist' });

const assistPayloadSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  context: z
    .object({
      clientName: z.string().optional(),
      intent: z.string().optional(),
      bookingHistory: z
        .array(
          z.union([
            z.string(),
            z.object({
              date: z.string().optional(),
              service: z.string().optional(),
              notes: z.string().optional()
            })
          ])
        )
        .optional(),
      notes: z.string().optional(),
      metadata: z.record(z.any()).optional()
    })
    .optional()
});

type RequestWithParams = TenantScopedRequest & { params?: Record<string, string> };

router.post('/', async (request: TenantScopedRequest, env: Env) => {
  const body = await request.json().catch(() => null);
  if (!body) {
    return JsonResponse.error('Invalid JSON body', 400);
  }

  const parsed = assistPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return JsonResponse.error('Invalid payload', 400, parsed.error.flatten());
  }

  const result = await generateAssistantSuggestion(env, request.tenantId!, parsed.data);
  return JsonResponse.ok(result);
});

router.post('/:tenantId', async (request: RequestWithParams, env: Env) => {
  const { tenantId: paramTenant } = request.params ?? {};
  if (!paramTenant) {
    return JsonResponse.error('Missing tenant identifier', 400);
  }

  const effectiveTenant = request.tenantId ?? paramTenant;
  if (request.tenantId && request.tenantId !== paramTenant) {
    return JsonResponse.error('Tenant mismatch', 403);
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return JsonResponse.error('Invalid JSON body', 400);
  }

  const parsed = assistPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return JsonResponse.error('Invalid payload', 400, parsed.error.flatten());
  }

  const result = await generateAssistantSuggestion(env, effectiveTenant, parsed.data);
  return JsonResponse.ok(result);
});

export const assistRouter = router;
