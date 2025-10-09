export async function withIdempotency<T>(
  env: Env,
  key: string,
  ttlSeconds = 24 * 60 * 60,
  work: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; reason: 'duplicate' }> {
  const ns = env.IDEMP_KV;
  const hold = (await (ns.put as unknown as (
    key: string,
    value: string,
    options?: { expirationTtl?: number; nx?: boolean }
  ) => Promise<boolean | void>)(key, '1', { expirationTtl: ttlSeconds, nx: true })) ?? undefined;

  if (hold === false) {
    return { ok: false, reason: 'duplicate' } as const;
  }

  try {
    const value = await work();
    await ns.put(`${key}:done`, '1', { expirationTtl: ttlSeconds });
    return { ok: true, value } as const;
  } catch (error) {
    throw error;
  }
}
