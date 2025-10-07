import { normalizeError } from '@ai-hairdresser/shared';
import { JsonResponse } from '../lib/response';
import { captureWorkerException } from '../lib/observability';

export function withErrorHandling<T extends (...args: any[]) => Promise<Response | any>>(handler: T) {
  return async function (request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const result = await handler(request, env, ctx);
      if (result instanceof Response) {
        return result;
      }
      return JsonResponse.ok(result);
    } catch (error) {
      const scoped = request as TenantScopedRequest;
      scoped.logger?.error('Unhandled error', { error: normalizeError(error) });
      captureWorkerException(error, scoped);
      return JsonResponse.error('Internal server error', 500);
    }
  };
}
