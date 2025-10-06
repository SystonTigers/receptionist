export class JsonResponse {
  static ok(data: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(data), {
      status: init.status ?? 200,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {})
      }
    });
  }

  static error(message: string, status = 400, details?: unknown) {
    return new Response(
      JSON.stringify({ error: message, details }),
      {
        status,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
}
