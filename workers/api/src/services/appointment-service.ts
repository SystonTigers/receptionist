import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import { normalizeError, type RequestLogger } from '@ai-hairdresser/shared';

import { createSystemLogger } from '../lib/observability';
import { sendNotification, type NotificationChannel, type NotificationPayload } from './notification-service';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function listAppointments(env: Env, tenantId: string, logger?: RequestLogger) {
  const client = getClient(env);
  const { data, error } = await client
    .from('appointments')
    .select('id, start_time, end_time, status, service_id, client_id, stylist_id')
    .eq('tenant_id', tenantId)
    .order('start_time');

  if (error) {
    throw new Error(`Failed to fetch appointments: ${error.message}`);
  }

  logger?.info('Loaded appointments', { count: data?.length ?? 0 });
  return data ?? [];
}

export async function createAppointment(
  env: Env,
  tenantId: string,
  userId: string,
  payload: Record<string, unknown>,
  parentLogger?: RequestLogger
) {
  const client = getClient(env);
  const body = {
    ...payload,
    tenant_id: tenantId,
    created_by: userId
  };

  const logger =
    parentLogger?.child({ component: 'appointments.create', tenantId }) ??
    createSystemLogger({ component: 'appointments.create', tenantId });

  const { data, error } = await client.from('appointments').insert(body).select().single();

  if (error) {
    logger.error('Failed to create appointment', { error: normalizeError(error) });
    throw new Error(`Failed to create appointment: ${error.message}`);
  }

  if (data) {
    const emailTo =
      (payload?.notification as Record<string, unknown> | undefined)?.email ??
      (payload?.client as Record<string, unknown> | undefined)?.email ??
      (payload as Record<string, unknown>)?.clientEmail ??
      (payload as Record<string, unknown>)?.email;
    const smsTo =
      (payload?.notification as Record<string, unknown> | undefined)?.phone ??
      (payload?.client as Record<string, unknown> | undefined)?.phone ??
      (payload as Record<string, unknown>)?.clientPhone ??
      (payload as Record<string, unknown>)?.phone;

    const channels: NotificationChannel[] = [];
    if (typeof emailTo === 'string' && emailTo.trim()) {
      channels.push('email');
    }
    if (typeof smsTo === 'string' && smsTo.trim()) {
      channels.push('sms');
    }

    if (channels.length > 0) {
      const clientFirstName =
        (payload?.client as Record<string, unknown> | undefined)?.firstName ??
        (payload?.client as Record<string, unknown> | undefined)?.first_name ??
        (payload as Record<string, unknown>)?.clientFirstName ??
        undefined;
      const clientLastName =
        (payload?.client as Record<string, unknown> | undefined)?.lastName ??
        (payload?.client as Record<string, unknown> | undefined)?.last_name ??
        (payload as Record<string, unknown>)?.clientLastName ??
        undefined;

      const notificationPayload: NotificationPayload = {
        channels,
        to: {
          email: typeof emailTo === 'string' ? emailTo : undefined,
          phone: typeof smsTo === 'string' ? smsTo : undefined,
          name: [clientFirstName, clientLastName]
            .map((value) => (value ? String(value).trim() : ''))
            .filter((value) => value.length > 0)
            .join(' ') || undefined
        },
        data: {
          appointmentId: data.id,
          scheduledTime: data.start_time,
          clientFirstName: clientFirstName ? String(clientFirstName) : undefined,
          clientLastName: clientLastName ? String(clientLastName) : undefined
        }
      };

      try {
        const results = await sendNotification(env, tenantId, 'booking_confirmation', notificationPayload);
        const success = results.some((result) => result.success);

        if (!success) {
          logger.warn('Booking confirmation notification failed for all channels', {
            appointmentId: data.id,
            channels
          });
          logger.metric('messaging.outbound.failure', 1, { dimension: channels.join(',') });
        }
      } catch (notificationError) {
        logger.error('Unexpected error while sending booking notification', {
          appointmentId: data.id,
          error: normalizeError(notificationError)
        });
        logger.metric('messaging.outbound.failure', 1, { dimension: 'unknown' });
      }
    } else {
      logger.warn('No notification recipient provided for booking', { appointmentId: data.id });
    }
  }

  return data;
}

export async function getAvailability(env: Env, tenantId: string, payload: any, logger?: RequestLogger) {
  const { stylistId, serviceId, startDate, endDate } = payload ?? {};
  logger?.debug('Availability request', { tenantId, stylistId, serviceId, startDate, endDate });

  const slots: Array<{ startTime: string; endTime: string; isBlocked: boolean; reason?: string }> = [];
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
