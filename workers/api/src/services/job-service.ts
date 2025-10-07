import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import { detectSuspiciousPatterns, listAuditLogsSince } from './audit-log-service';
import { recordUsageEvent } from './usage-service';

import { sendNotification, type NotificationPayload } from './notification-service';

type TenantRecord = {
  id: string;
};

type ClientContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type BookingRecord = {
  id: string;
  tenant_id: string;
  start_time: string;
  status: string;
  client: ClientContact | null;
};

type BookingNotification = {
  tenantId: string;
  bookingId: string;
  scheduledTime: string;
  channels: Array<'sms' | 'email'>;
  client?: ClientContact | null;
};

function getClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

async function listTenants(client: SupabaseClient) {
  const { data, error } = await client.from('tenants').select('id');
  if (error) {
    throw new Error(`Failed to fetch tenants: ${error.message}`);
  }
  return (data ?? []) as TenantRecord[];
}

async function listUpcomingBookings(
  client: SupabaseClient,
  tenantId: string,
  windowStart: string,
  windowEnd: string
) {
  const { data, error } = await client
    .from('appointments')
    .select(
      `id, tenant_id, start_time, status, client:clients(id, first_name, last_name, email, phone)`
    )
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'confirmed'])
    .gte('start_time', windowStart)
    .lt('start_time', windowEnd);

  if (error) {
    throw new Error(`Failed to fetch bookings for tenant ${tenantId}: ${error.message}`);
  }

  return (data ?? []) as BookingRecord[];
}

async function sendBookingNotification(env: Env, notification: BookingNotification) {
  const payload: NotificationPayload = {
    channels: notification.channels,
    to: {
      email: notification.client?.email ?? undefined,
      phone: notification.client?.phone ?? undefined,
      name: [notification.client?.first_name, notification.client?.last_name]
        .filter((value) => Boolean(value && value.trim()))
        .join(' ')
        .trim() || undefined
    },
    data: {
      bookingId: notification.bookingId,
      scheduledTime: notification.scheduledTime,
      clientFirstName: notification.client?.first_name ?? undefined,
      clientLastName: notification.client?.last_name ?? undefined
    }
  };

  const results = await sendNotification(env, notification.tenantId, 'booking_reminder', payload);
  const successful = results.filter((result) => result.success);

  console.log('Reminder notification dispatch results', {
    tenantId: notification.tenantId,
    bookingId: notification.bookingId,
    channels: notification.channels,
    dispatched: successful.map((result) => result.channel),
    failed: results.filter((result) => !result.success).map((result) => result.channel)
  });

  if (successful.length === 0) {
    const errors = results.map((result) => result.error).filter(Boolean);
    throw new Error(errors.join('; ') || 'All notification channels failed');
  }

  return results;
  await recordUsageEvent(env, notification.tenantId, 'reminder.queued', {
    metadata: {
      bookingId: notification.bookingId,
      channels: notification.channels
    }
  });
}

export async function sendReminderMessages(env: Env) {
  const client = getClient(env);
  const windowStart = new Date().toISOString();
  const windowEnd = dayjs(windowStart).add(24, 'hour').toISOString();

  const summary = {
    tenantsProcessed: 0,
    bookingsReviewed: 0,
    remindersQueued: 0,
    bookingsMissingContact: 0,
    reminderFailures: 0,
    tenantsWithErrors: 0
  };

  console.log('Starting reminder sweep', {
    environment: env.WORKER_ENVIRONMENT ?? 'unknown',
    windowStart,
    windowEnd
  });

  const tenants = await listTenants(client);

  for (const tenant of tenants) {
    summary.tenantsProcessed += 1;

    try {
      const bookings = await listUpcomingBookings(client, tenant.id, windowStart, windowEnd);
      summary.bookingsReviewed += bookings.length;

      for (const booking of bookings) {
        const channels: Array<'sms' | 'email'> = [];
        const contact = booking.client;
        if (contact?.phone) channels.push('sms');
        if (contact?.email) channels.push('email');

        if (channels.length === 0) {
          summary.bookingsMissingContact += 1;
          continue;
        }

        try {
          await sendBookingNotification(env, {
            tenantId: tenant.id,
            bookingId: booking.id,
            scheduledTime: booking.start_time,
            channels,
            client: contact
          });
          summary.remindersQueued += 1;
        } catch (error) {
          summary.reminderFailures += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error('Reminder notification failure', {
            tenantId: tenant.id,
            bookingId: booking.id,
            message
          });
        }
      }
    } catch (error) {
      summary.tenantsWithErrors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error('Reminder sweep tenant failure', { tenantId: tenant.id, message });
    }
  }

  console.log('Reminder sweep summary', summary);
}

export async function monitorSecurityEvents(env: Env) {
  const windowEnd = new Date().toISOString();
  const windowStart = dayjs(windowEnd).subtract(1, 'hour').toISOString();

  try {
    const logs = await listAuditLogsSince(env, windowStart);
    const alerts = detectSuspiciousPatterns(logs, windowStart, windowEnd);

    for (const alert of alerts) {
      console.warn('Security alert detected', alert);
    }

    console.log('Security monitoring summary', {
      windowStart,
      windowEnd,
      logsReviewed: logs.length,
      alertsGenerated: alerts.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Security monitoring failed', { windowStart, windowEnd, message });
  }
}

export async function purgeExpiredData(env: Env) {
  console.log('TODO: purge expired data per GDPR requirements');
}
