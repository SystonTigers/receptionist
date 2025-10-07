import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { PropsWithChildren, useState } from 'react';
import { getSupabaseBrowserClient } from './supabase-browser-client';

export function SupabaseProvider({ children }: PropsWithChildren) {
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  const [supabaseClient] = useState(() => getSupabaseBrowserClient());

  return (
    <SessionContextProvider supabaseClient={supabaseClient}>{children}</SessionContextProvider>
  );
}
