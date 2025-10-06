import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';

/**
 * Shared fetch wrapper that attaches tenant + auth headers.
 */
export async function apiFetch<T>(path: string, options: RequestInit & { tenantId?: string } = {}) {
  const supabase = createBrowserSupabaseClient();
  const session = (await supabase.auth.getSession()).data.session;
  const tenantId = options.tenantId ?? session?.user.user_metadata?.tenant_id;
  if (!tenantId) {
    throw new Error('Missing tenant context');
  }

  const body =
    options.body && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : (options.body as BodyInit | null | undefined);

  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      'x-tenant-id': tenantId,
      Authorization: session ? `Bearer ${session.access_token}` : ''
    }
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error ?? 'API error');
  }

  return (await res.json()) as T;
}
