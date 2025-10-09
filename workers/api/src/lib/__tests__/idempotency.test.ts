import { describe, expect, it } from 'vitest';

import { withIdempotency } from '../idempotency';
import { fakeEnv } from './test-helpers';

describe('withIdempotency', () => {
  it('blocks duplicate keys', async () => {
    const env = fakeEnv();
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
