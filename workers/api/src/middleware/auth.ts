import { decodeJwt } from 'jose';
import type { Role } from '@ai-hairdresser/shared';
import { JsonResponse } from '../lib/response';

const PUBLIC_PATHS = [/^\/healthz$/, /^\/auth\/signup$/, /^\/auth\/login$/, /^\/webhooks\//];

export async function withAuth(request: TenantScopedRequest, _env: Env, _ctx: ExecutionContext) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.some((pattern) => pattern.test(url.pathname))) {
    return request;
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return JsonResponse.error('Unauthorized', 401);
  }

  try {
    const token = authorization.replace('Bearer ', '');
    const claims = decodeJwt(token);
    request.userId = claims.sub;
    const claimRole = (claims.role as string | undefined) ?? undefined;
    request.role = (claimRole as Role | undefined) ?? 'viewer';
    request.tenantId = (claims['tenantId'] as string) ?? request.tenantId;
    return request;
  } catch (error) {
    console.warn('Auth decode failed', error);
    return JsonResponse.error('Unauthorized', 401);
  }
}
