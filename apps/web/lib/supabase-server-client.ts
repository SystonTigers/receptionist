import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse, GetServerSidePropsContext } from 'next';
import { isServerE2ETestEnvironment } from './e2e-flags';
import { createE2EServerSupabase } from './e2e-supabase-server';

type ServerContext =
  | GetServerSidePropsContext
  | { req: NextApiRequest; res: NextApiResponse };

/**
 * Create a Supabase client that is safe to use during SSR/Server handlers.
 */
export function createSupabaseServerClient(ctx: ServerContext) {
  if (isServerE2ETestEnvironment()) {
    return createE2EServerSupabase(ctx) as unknown as ReturnType<typeof createPagesServerClient>;
  }

  return createPagesServerClient(ctx);
}

