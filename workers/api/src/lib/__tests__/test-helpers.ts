import type { KVNamespace } from '@cloudflare/workers-types';

export function fakeKv(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number; nx?: boolean }) {
      if (options?.nx && store.has(key)) {
        return false as const;
      }
      store.set(key, value);
      return true as const;
    },
    async delete(key: string) {
      store.delete(key);
    }
  } as unknown as KVNamespace;
}

export function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SUPABASE_URL: 'http://test.local',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    JWT_SECRET: 'jwt-secret',
    MULTITENANT_SIGNING_KEY: 'tenant-signing-key',
    IDEMP_KV: fakeKv(),
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_DEFAULT_PRICE_ID: 'price_test',
    TWILIO_ACCOUNT_SID: 'AC_TEST',
    TWILIO_AUTH_TOKEN: 'twilio-test',
    OPENAI_API_KEY: 'openai-test',
    ...overrides
  };
}
