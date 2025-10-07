import { Router } from 'itty-router';
import { z } from 'zod';
import { JsonResponse } from '../lib/response';
import { fetchRecentAuditLogs, recordAuditLog } from '../services/audit-log-service';

const router = Router({ base: '/audit' });

const auditEventSchema = z.object({
  action: z.string().min(1),
  resource: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional()
});

router.get('/logs', async (request: TenantScopedRequest, env: Env) => {
  if (request.role !== 'admin') {
    return JsonResponse.error('Forbidden', 403);
  }

  const logs = await fetchRecentAuditLogs(env, request.tenantId!);
  return JsonResponse.ok({ logs });
});

router.post('/logs', async (request: TenantScopedRequest, env: Env) => {
  if (request.role !== 'admin') {
    return JsonResponse.error('Forbidden', 403);
  }

  const body = await request.json();
  const parsed = auditEventSchema.safeParse(body);
  if (!parsed.success) {
    return JsonResponse.error('Invalid payload', 400, parsed.error.flatten());
  }

  await recordAuditLog(env, {
    tenantId: request.tenantId ?? null,
    userId: request.userId ?? null,
    action: parsed.data.action,
    resource: parsed.data.resource,
    resourceId: parsed.data.resourceId ?? null,
    before: parsed.data.before,
    after: parsed.data.after
  });

  return JsonResponse.ok({ recorded: true });
});

export const auditRouter = router;
