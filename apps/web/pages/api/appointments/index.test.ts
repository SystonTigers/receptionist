import { createMocks } from 'node-mocks-http';
import handler from './index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('appointments API route', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_API_BASE_URL = originalEnv;
  });

  async function invoke(method: string, body?: unknown) {
    const { req, res } = createMocks({
      method,
      headers: {
        'x-tenant-id': 'tenant-123',
        authorization: 'Bearer token'
      },
      body
    });

    await handler(req, res);
    return { req, res };
  }

  it('returns appointments from the platform API', async () => {
    const json = vi.fn().mockResolvedValue({ appointments: [{ id: '1' }] });
    const fetchMock = vi.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      status: 200,
      json
    } as unknown as Response);

    const { res } = await invoke('GET');

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/appointments', {
      headers: {
        Authorization: 'Bearer token',
        'x-tenant-id': 'tenant-123',
        'x-platform-origin': 'next-web'
      }
    });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ appointments: [{ id: '1' }] });
  });

  it('bubbles upstream errors from the platform API', async () => {
    const json = vi.fn().mockResolvedValue({ error: 'Boom' });
    vi.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: false,
      status: 422,
      json
    } as unknown as Response);

    const { res } = await invoke('GET');

    expect(res._getStatusCode()).toBe(422);
    expect(res._getJSONData()).toEqual({ error: 'Boom' });
  });

  it('forwards POST requests to the platform API', async () => {
    const json = vi.fn().mockResolvedValue({ error: 'Method Not Allowed' });
    const fetchMock = vi.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: false,
      status: 405,
      json
    } as unknown as Response);

    const { res } = await invoke('POST', { foo: 'bar' });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
        'x-tenant-id': 'tenant-123',
        'x-platform-origin': 'next-web'
      },
      body: JSON.stringify({ foo: 'bar' })
    });
    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: 'Method Not Allowed' });
  });

  it.each([
    ['PATCH'],
    ['DELETE']
  ])('rejects %s requests with 405', async (method) => {
    const fetchMock = vi.spyOn(global, 'fetch' as never);

    const { res } = await invoke(method);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: 'Method Not Allowed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
