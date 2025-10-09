import { describe, expect, it } from 'vitest';

import { withIdempotency } from '../idempotency';
import { fakeEnv } from './test-helpers';

describe('withIdempotency', () => {
  it('blocks duplicate keys', async () => {
    const env = fakeEnv();
import type { KVNamespace } from '@cloudflare/workers-types';
import { describe, expect, it } from 'vitest';

import { withIdempotency } from '../idempotency';

function createFakeKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number; nx?: boolean }) {
      if (options?.nx && store.has(key)) {
        return false;
      }
      store.set(key, value);
      return true;
    },
    async delete(key: string) {
      store.delete(key);
    }
  } as unknown as KVNamespace;
}

describe('withIdempotency', () => {
  it('blocks duplicate keys', async () => {
    const env = { IDEMP_KV: createFakeKv() } as unknown as Env;
    const key = 'stripe:evt_1';

    const first = await withIdempotency(env, key, 60, async () => 'ok');
    const second = await withIdempotency(env, key, 60, async () => 'ok2');

    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value).toBe('ok');
    }
    expect(second.ok).toBe(false);
  });
});
