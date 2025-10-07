import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

declare global {
  interface Window {
    __supabaseClientOverride?: SupabaseClient;
  }
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window !== 'undefined' && window.__supabaseClientOverride) {
    return window.__supabaseClientOverride;
  }

  if (!cachedClient) {
    cachedClient = createBrowserSupabaseClient({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    });
  }

  return cachedClient;
}
