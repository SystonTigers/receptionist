import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { SupabaseProvider } from '@/lib/supabase-provider';
import { initBrowserObservability, setBrowserUserContext } from '@/lib/observability.client';
import { FeatureFlagProvider } from '@/lib/feature-flags';
import '@/styles/globals.css';

function ObservabilityInitializer() {
  const supabase = useSupabaseClient();
  useEffect(() => {
    initBrowserObservability();
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        setBrowserUserContext({ id: user.id, tenantId: user.user_metadata?.tenant_id });
      }
    });
  }, [supabase]);
  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SupabaseProvider>
      <ObservabilityInitializer />
      <Component {...pageProps} />
      <FeatureFlagProvider>
        <Component {...pageProps} />
      </FeatureFlagProvider>
    </SupabaseProvider>
  );
}
