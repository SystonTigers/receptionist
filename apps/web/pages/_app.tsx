import type { AppProps } from 'next/app';
import { SupabaseProvider } from '@/lib/supabase-provider';
import { FeatureFlagProvider } from '@/lib/feature-flags';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SupabaseProvider>
      <FeatureFlagProvider>
        <Component {...pageProps} />
      </FeatureFlagProvider>
    </SupabaseProvider>
  );
}
