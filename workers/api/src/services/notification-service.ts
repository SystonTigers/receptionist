import { createClient } from '@supabase/supabase-js';

type NotificationChannel = 'email' | 'sms';
export type NotificationTemplate =
  | 'welcome_day_0'
  | 'welcome_day_1'
  | 'welcome_day_7'
  | 'nudge_branding'
  | 'nudge_services'
  | 'nudge_first_booking';

type NotificationJobRow = {
  id: string;
  tenant_id: string;
  channel: NotificationChannel;
  template: NotificationTemplate;
  recipient: string;
  subject: string | null;
  payload: Record<string, unknown> | null;
  send_at: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number | null;
};

type QueueNotificationInput = {
  template: NotificationTemplate;
  recipient: string;
  sendAt: Date | string;
  channel?: NotificationChannel;
  subject?: string;
  body: string;
};

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function toIsoDate(input: Date | string) {
  return input instanceof Date ? input.toISOString() : new Date(input).toISOString();
}

export async function queueNotification(env: Env, tenantId: string, input: QueueNotificationInput) {
  const client = getClient(env);
  const sendAt = toIsoDate(input.sendAt);
  const payload = { body: input.body };
  const now = new Date().toISOString();

  const { data, error } = await client
    .from('notification_jobs')
    .upsert(
      {
        tenant_id: tenantId,
        channel: input.channel ?? 'email',
        template: input.template,
        recipient: input.recipient,
        subject: input.subject ?? null,
        payload,
        send_at: sendAt,
        status: 'pending',
        attempts: 0,
        sent_at: null,
        last_error: null,
        updated_at: now
      },
      { onConflict: 'tenant_id,template' }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to queue notification ${input.template}: ${error.message}`);
  }

  return data;
}

async function dispatchEmail(job: NotificationJobRow & { payload: Record<string, unknown> | null }) {
  const body = typeof job.payload?.body === 'string' ? job.payload?.body : JSON.stringify(job.payload ?? {});
  console.log('Dispatching onboarding email', {
    tenantId: job.tenant_id,
    template: job.template,
    to: job.recipient,
    subject: job.subject,
    preview: body?.slice?.(0, 120)
  });
}

async function dispatchNotification(job: NotificationJobRow) {
  if (job.channel === 'email') {
    await dispatchEmail(job as NotificationJobRow & { payload: Record<string, unknown> | null });
    return;
  }

  console.log('Notification channel not implemented, skipping', {
    id: job.id,
    tenantId: job.tenant_id,
    channel: job.channel
  });
}

export async function processNotificationQueue(env: Env, limit = 25) {
  const client = getClient(env);
  const nowIso = new Date().toISOString();
  const { data: due, error } = await client
    .from('notification_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', nowIso)
    .order('send_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load notification queue: ${error.message}`);
  }

  for (const job of due ?? []) {
    const claim = await client
      .from('notification_jobs')
      .update({
        status: 'sending',
        attempts: (job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (claim.error || !claim.data) {
      continue;
    }

    try {
      await dispatchNotification({ ...job, status: 'sending', attempts: (job.attempts ?? 0) + 1 });
      await client
        .from('notification_jobs')
        .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null })
        .eq('id', job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client
        .from('notification_jobs')
        .update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      console.error('Notification dispatch failed', { id: job.id, tenantId: job.tenant_id, message });
    }
  }
}
