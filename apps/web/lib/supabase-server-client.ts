import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse, GetServerSidePropsContext } from 'next';

type ServerContext =
  | GetServerSidePropsContext
  | { req: NextApiRequest; res: NextApiResponse };

/**
 * Create a Supabase client that is safe to use during SSR/Server handlers.
 */
export function createSupabaseServerClient(ctx: ServerContext) {
  return createPagesServerClient(ctx);
}

