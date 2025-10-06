import { createClient } from '@supabase/supabase-js';
import type {
  Booking,
  BookingCreateInput,
  BookingUpdateInput
} from '@ai-hairdresser/shared';

interface BookingRow {
  id: string;
  tenant_id: string;
  client_id: string;
  service_id: string;
  stylist_id?: string | null;
  start_time: string;
  end_time?: string | null;
  status: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
}

const BOOKING_COLUMNS =
  'id, tenant_id, client_id, service_id, stylist_id, start_time, end_time, status, notes, metadata, created_by, created_at, updated_at, cancelled_at';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    serviceId: row.service_id,
    stylistId: row.stylist_id ?? undefined,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    status: row.status as Booking['status'],
    notes: row.notes ?? undefined,
    metadata: row.metadata ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at ?? undefined
  };
}

export interface ListBookingsOptions {
  startTime?: string;
}

export async function listBookings(env: Env, tenantId: string, options: ListBookingsOptions = {}) {
  const client = getClient(env);
  let query = client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('start_time', { ascending: true });

  if (options.startTime) {
    query = query.gte('start_time', options.startTime);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list bookings: ${error.message}`);
  }

  return (data ?? []).map((row) => mapBooking(row as BookingRow));
}

export async function createBooking(
  env: Env,
  tenantId: string,
  userId: string,
  input: BookingCreateInput
) {
  const client = getClient(env);
  const now = new Date().toISOString();
  const insertPayload = {
    tenant_id: tenantId,
    client_id: input.clientId,
    service_id: input.serviceId,
    stylist_id: input.stylistId ?? null,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    status: input.status ?? 'pending',
    notes: input.notes ?? null,
    metadata: input.metadata ?? null,
    created_by: userId,
    updated_at: now
  };

  const { data, error } = await client
    .from('bookings')
    .insert(insertPayload)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create booking: ${error?.message ?? 'Unknown error'}`);
  }

  return mapBooking(data as BookingRow);
}

export async function updateBooking(
  env: Env,
  tenantId: string,
  bookingId: string,
  input: BookingUpdateInput
) {
  const client = getClient(env);
  const updates: Record<string, unknown> = {};

  if (input.clientId !== undefined) updates.client_id = input.clientId;
  if (input.serviceId !== undefined) updates.service_id = input.serviceId;
  if (input.stylistId !== undefined) updates.stylist_id = input.stylistId ?? null;
  if (input.startTime !== undefined) updates.start_time = input.startTime;
  if (input.endTime !== undefined) updates.end_time = input.endTime ?? null;
  if (input.status !== undefined) updates.status = input.status;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
  if (input.metadata !== undefined) updates.metadata = input.metadata ?? null;

  updates.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('bookings')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', bookingId)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update booking: ${error?.message ?? 'Unknown error'}`);
  }

  return mapBooking(data as BookingRow);
}

export async function cancelBooking(env: Env, tenantId: string, bookingId: string) {
  const client = getClient(env);
  const timestamp = new Date().toISOString();
  const { data, error } = await client
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: timestamp, updated_at: timestamp })
    .eq('tenant_id', tenantId)
    .eq('id', bookingId)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to cancel booking: ${error?.message ?? 'Unknown error'}`);
  }

  return mapBooking(data as BookingRow);
}
