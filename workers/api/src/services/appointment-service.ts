import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function listAppointments(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('appointments')
    .select('id, start_time, end_time, status, service_id, client_id, stylist_id')
    .eq('tenant_id', tenantId)
    .order('start_time');
  if (error) {
    throw new Error(`Failed to fetch appointments: ${error.message}`);
  }
  return data ?? [];
}

export async function createAppointment(env: Env, tenantId: string, userId: string, payload: any) {
  const client = getClient(env);
  const body = {
    ...payload,
    tenant_id: tenantId,
    created_by: userId
  };
  const { data, error } = await client.from('appointments').insert(body).select().single();
  if (error) {
    throw new Error(`Failed to create appointment: ${error.message}`);
  }
  return data;
}

export async function getAvailability(env: Env, tenantId: string, payload: any) {
  // TODO: Replace with advanced availability computation
  const { stylistId, serviceId, startDate, endDate } = payload;
  console.log('Availability request', { tenantId, stylistId, serviceId, startDate, endDate });
  const slots = [] as Array<{ startTime: string; endTime: string; isBlocked: boolean; reason?: string }>;
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  let cursor = start.clone();
  while (cursor.isBefore(end)) {
    const slotStart = cursor.toISOString();
    const slotEnd = cursor.add(30, 'minute').toISOString();
    slots.push({ startTime: slotStart, endTime: slotEnd, isBlocked: false });
    cursor = cursor.add(30, 'minute');
  }
  return slots;
}
