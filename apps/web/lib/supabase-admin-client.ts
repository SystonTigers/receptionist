import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isServerE2ETestEnvironment } from './e2e-flags';
import { createE2EAdminSupabase } from './e2e-supabase-server';

let cachedClient: SupabaseClient | null = null;
let cachedE2EClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (isServerE2ETestEnvironment()) {
    if (!cachedE2EClient) {
      cachedE2EClient = createE2EAdminSupabase() as unknown as SupabaseClient;
    }
    return cachedE2EClient;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  return cachedClient;
}
