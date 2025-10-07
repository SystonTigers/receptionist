
import { normalizeError } from '@ai-hairdresser/shared';
import type { Role } from '@ai-hairdresser/shared';
import { JsonResponse } from '../lib/response';
import { verifyTenantToken } from '../lib/tenant-token';

const PUBLIC_PATHS = [/^\/healthz$/, /^\/auth\/signup$/, /^\/auth\/login$/, /^\/webhooks\//];

export async function withTenant(request: TenantScopedRequest, env: Env, _ctx: ExecutionContext) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return request;
  }

  const headerTenant = request.headers.get('x-tenant-id');
  const bearer = request.headers.get('authorization');
  let tenantId = headerTenant ?? undefined;

  if (!tenantId && bearer?.startsWith('Bearer ')) {
    try {
      const token = bearer.replace('Bearer ', '');
      const decoded = await verifyTenantToken(token, env.MULTITENANT_SIGNING_KEY);
      tenantId = decoded.tenantId;
      request.userId = decoded.sub;
      request.role = decoded.role as Role;
    } catch (err) {
      request.logger?.warn('Failed to decode tenant token', {
        error: normalizeError(err)
      });
    }
  }

  if (!tenantId) {
    request.logger?.warn('Missing tenant context for request', {
      path: url.pathname
    });
    return JsonResponse.error('Missing tenant context', 400);
  }

  request.tenantId = tenantId;
  request.logger?.metric('auth.tenant_context.applied', 1);
  return request;
}
