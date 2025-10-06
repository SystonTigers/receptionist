import { JsonResponse } from '../lib/response';

export function withErrorHandling<T extends (...args: any[]) => Promise<Response | any>>(handler: T) {
  return async function (request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const result = await handler(request, env, ctx);
      if (result instanceof Response) {
        return result;
      }
      return JsonResponse.ok(result);
    } catch (error) {
      console.error('Unhandled error', error);
      return JsonResponse.error('Internal server error', 500);
    }
  };
}
