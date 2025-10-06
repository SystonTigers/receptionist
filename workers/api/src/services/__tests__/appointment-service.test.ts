import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppointment, listAppointments } from '../appointment-service';

const fromMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: fromMock
  }))
}));

const env = { SUPABASE_URL: 'url', SUPABASE_SERVICE_ROLE_KEY: 'key' } as Env;

afterEach(() => {
  vi.clearAllMocks();
});

describe('listAppointments', () => {
  it('scopes queries to the tenant', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order
    };
    fromMock.mockReturnValueOnce(builder);

    const result = await listAppointments(env, 'tenant-1');

    expect(fromMock).toHaveBeenCalledWith('appointments');
    expect(builder.select).toHaveBeenCalledWith(
      'id, start_time, end_time, status, service_id, client_id, stylist_id'
    );
    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(order).toHaveBeenCalledWith('start_time');
    expect(result).toEqual([{ id: '1' }]);
  });

  it('throws when supabase returns an error', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order
    };
    fromMock.mockReturnValueOnce(builder);

    await expect(listAppointments(env, 'tenant-1')).rejects.toThrow(/Failed to fetch appointments/);
  });
});

describe('createAppointment', () => {
  it('adds tenant and user scoping before inserting', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: '1' }, error: null });
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single
    };
    fromMock.mockReturnValueOnce(builder);

    const payload = { service_id: 'service', start_time: '2024-03-01T10:00', end_time: '2024-03-01T11:00' };
    const result = await createAppointment(env, 'tenant-1', 'user-1', payload);

    expect(builder.insert).toHaveBeenCalledWith({
      ...payload,
      tenant_id: 'tenant-1',
      created_by: 'user-1'
    });
    expect(builder.select).toHaveBeenCalled();
    expect(single).toHaveBeenCalled();
    expect(result).toEqual({ id: '1' });
  });

  it('throws when insert fails', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'bad insert' } });
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single
    };
    fromMock.mockReturnValueOnce(builder);

    await expect(
      createAppointment(env, 'tenant-1', 'user-1', { service_id: 'svc', start_time: '2024', end_time: '2024' })
    ).rejects.toThrow(/Failed to create appointment/);
  });
});
