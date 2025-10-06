import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { withTenant } from '../tenant';

vi.mock('../../lib/tenant-token', () => ({
  verifyTenantToken: vi.fn(async () => ({ tenantId: 'tenant-from-token', sub: 'user-1', role: 'admin' }))
}));

const { verifyTenantToken } = await import('../../lib/tenant-token');
const mockVerifyTenantToken = verifyTenantToken as unknown as Mock;

describe('withTenant middleware', () => {
  const env = { MULTITENANT_SIGNING_KEY: 'secret' } as Env;
  const ctx = {} as ExecutionContext;
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  afterEach(() => {
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it('allows public paths without tenant enforcement', async () => {
    const request = new Request('https://example.com/healthz');
    const result = await withTenant(request as TenantScopedRequest, env, ctx);

    expect(result).toBe(request);
  });

  it('rejects requests without tenant context', async () => {
    const request = new Request('https://example.com/appointments', { headers: {} });
    const response = await withTenant(request as TenantScopedRequest, env, ctx);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
  });

  it('populates tenant context from headers', async () => {
    const request = new Request('https://example.com/appointments', {
      headers: { 'x-tenant-id': 'tenant-123' }
    });

    const result = (await withTenant(request as TenantScopedRequest, env, ctx)) as TenantScopedRequest;

    expect(result.tenantId).toBe('tenant-123');
  });

  it('decodes tenant context from bearer tokens', async () => {
    mockVerifyTenantToken.mockResolvedValueOnce({ tenantId: 'tenant-456', sub: 'user-99', role: 'staff' });
    const request = new Request('https://example.com/appointments', {
      headers: { authorization: 'Bearer token' }
    });

    const result = (await withTenant(request as TenantScopedRequest, env, ctx)) as TenantScopedRequest;

    expect(mockVerifyTenantToken).toHaveBeenCalledWith('token', 'secret');
    expect(result.tenantId).toBe('tenant-456');
    expect(result.userId).toBe('user-99');
    expect(result.role).toBe('staff');
  });

  it('falls back to error when bearer token decoding fails', async () => {
    mockVerifyTenantToken.mockRejectedValueOnce(new Error('invalid token'));
    const request = new Request('https://example.com/appointments', {
      headers: { authorization: 'Bearer badtoken' }
    });

    const response = await withTenant(request as TenantScopedRequest, env, ctx);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
  });
});
