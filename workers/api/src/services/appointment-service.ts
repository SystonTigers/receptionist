import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import { normalizeError, RequestLogger } from '@ai-hairdresser/shared';
import { sendBookingNotification } from '../integrations/twilio';
import { createSystemLogger } from '../lib/observability';

import { sendNotification, type NotificationPayload, type NotificationChannel } from './notification-service';

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
  payload: any,
  parentLogger?: RequestLogger
) {
  const client = getClient(env);
  const body = {
    ...payload,
    tenant_id: tenantId,
    created_by: userId
  };
  const logger = parentLogger?.child({ component: 'appointments.create', tenantId }) ??
    createSystemLogger({ component: 'appointments.create', tenantId });
  const { data, error } = await client.from('appointments').insert(body).select().single();
  if (error) {
    logger.error('Failed to create appointment', { error: normalizeError(error) });
    throw new Error(`Failed to create appointment: ${error.message}`);
  }
  if (data) {
    const emailTo = payload?.notification?.email ?? payload?.client?.email ?? payload?.clientEmail ?? payload?.email;
    const smsTo = payload?.notification?.phone ?? payload?.client?.phone ?? payload?.clientPhone ?? payload?.phone;
    if (emailTo || smsTo) {
      const channels: NotificationChannel[] = [];
      if (emailTo) channels.push('email');
      if (smsTo) channels.push('sms');

      const clientFirstName =
        payload?.client?.firstName ?? payload?.client?.first_name ?? payload?.clientFirstName ?? undefined;
      const clientLastName =
        payload?.client?.lastName ?? payload?.client?.last_name ?? payload?.clientLastName ?? undefined;

      const notificationPayload: NotificationPayload = {
        channels,
        to: {
          email: emailTo ?? undefined,
          phone: smsTo ?? undefined,
          name: [clientFirstName, clientLastName]
            .filter((value) => Boolean(value && String(value).trim()))
            .join(' ')
            .trim() || undefined
        },
        data: {
          appointmentId: data.id,
          scheduledTime: data.start_time,
          clientFirstName: clientFirstName ?? undefined,
          clientLastName: clientLastName ?? undefined
        }
      };

      try {
        const result = await sendBookingNotification(env, notificationTo, message, logger);
        if (!result.success) {
          logger.warn('Booking notification ultimately failed', {
            appointmentId: data.id,
            recipient: notificationTo ? `***${String(notificationTo).slice(-4)}` : 'unknown'
        const results = await sendNotification(env, tenantId, 'booking_confirmation', notificationPayload);
        const success = results.some((result) => result.success);
        if (!success) {
          console.error('Booking confirmation notification failed for all channels', {
            appointmentId: data.id,
            channels
          });
          logger.metric('messaging.outbound.failure', 1, { dimension: 'sms' });
        }
      } catch (notificationError) {
        logger.error('Unexpected error while sending booking notification', {
          appointmentId: data.id,
          error: normalizeError(notificationError)
        });
        logger.metric('messaging.outbound.failure', 1, { dimension: 'sms' });
      }
    } else {
      logger.warn('No notification recipient provided for booking', { appointmentId: data.id });
    }
  }
  return data;
}

export async function getAvailability(env: Env, tenantId: string, payload: any, logger?: RequestLogger) {
  // TODO: Replace with advanced availability computation
  const { stylistId, serviceId, startDate, endDate } = payload;
  logger?.debug('Availability request', { tenantId, stylistId, serviceId, startDate, endDate });
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
