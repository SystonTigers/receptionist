
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

import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { stripHtml, maskEmail, sendEmailViaSendGrid } from '../integrations/sendgrid';
import { createTwilioClient } from '../integrations/twilio';

export type NotificationChannel = 'email' | 'sms';

type NotificationTemplateRecord = {
  id: string;
  tenant_id: string | null;
  type: string;
  channel: NotificationChannel;
  locale: string | null;
  subject_template: string | null;
  body_html_template: string | null;
  body_text_template: string | null;
  timezone: string | null;
  metadata: Record<string, unknown> | null;
};

type NotificationIdentityRecord = {
  config: Record<string, unknown> | null;
  provider: string;
};

type TenantRow = {
  id: string;
  name: string;
  settings: Record<string, unknown> | null;
};

export type NotificationPayload = {
  channels?: NotificationChannel[];
  to: {
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  };
  data?: Record<string, unknown>;
  locale?: string;
  timezone?: string;
};

export type NotificationResult = {
  channel: NotificationChannel;
  success: boolean;
  providerMessageId?: string;
  error?: string;
  templateId?: string | null;

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
async function fetchTenant(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from('tenants')
    .select('id, name, settings')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve tenant ${tenantId}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  return data as TenantRow;
}

async function fetchTemplates(
  client: SupabaseClient,
  tenantId: string,
  type: string,
  channel: NotificationChannel
) {
  const { data, error } = await client
    .from('notification_templates')
    .select(
      'id, tenant_id, type, channel, locale, subject_template, body_html_template, body_text_template, timezone, metadata'
    )
    .eq('type', type)
    .eq('channel', channel);

  if (error) {
    throw new Error(`Failed to load templates for ${type}/${channel}: ${error.message}`);
  }

  return (data ?? []) as NotificationTemplateRecord[];
}

function determineLocalePriority(payloadLocale?: string, tenantLocale?: string, fallbackLocale?: string) {
  const priorities = [payloadLocale, tenantLocale, fallbackLocale, 'default']
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  if (!priorities.includes('default')) {
    priorities.push('default');
  }

  return priorities;
}

function pickTemplate(
  templates: NotificationTemplateRecord[],
  tenantId: string,
  localePriority: string[]
) {
  let selected: NotificationTemplateRecord | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const template of templates) {
    const locale = (template.locale ?? 'default').toLowerCase();
    const localeIndex = localePriority.indexOf(locale);
    const matchedLocaleIndex = localeIndex === -1 ? localePriority.length : localeIndex;
    const tenantScore = template.tenant_id === tenantId ? 0 : 10;
    const score = tenantScore + matchedLocaleIndex;

    if (score < bestScore) {
      bestScore = score;
      selected = template;
    }
  }

  return selected;
}

function resolveLocale(
  template: NotificationTemplateRecord | null,
  payloadLocale?: string,
  tenantLocale?: string,
  fallbackLocale?: string
) {
  if (template?.locale && template.locale !== 'default') {
    return template.locale;
  }
  return payloadLocale ?? tenantLocale ?? fallbackLocale ?? 'en';
}

function resolveTimezone(
  template: NotificationTemplateRecord | null,
  payloadTimezone?: string,
  tenantTimezone?: string,
  fallbackTimezone?: string
) {
  return payloadTimezone ?? template?.timezone ?? tenantTimezone ?? fallbackTimezone ?? 'UTC';
}

function renderTemplateString(template: string, variables: Record<string, unknown>) {
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key: string) => {
    const path = key.split('.');
    let value: unknown = variables;
    for (const segment of path) {
      if (value && typeof value === 'object' && segment in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[segment];
      } else {
        value = undefined;
        break;
      }
    }
    return value !== undefined && value !== null ? String(value) : '';
  });
}

function renderTemplate(
  template: NotificationTemplateRecord,
  variables: Record<string, unknown>
) {
  const subject = template.subject_template
    ? renderTemplateString(template.subject_template, variables)
    : undefined;
  const html = template.body_html_template
    ? renderTemplateString(template.body_html_template, variables)
    : undefined;
  const text = template.body_text_template
    ? renderTemplateString(template.body_text_template, variables)
    : undefined;

  const resolvedHtml = html ?? (text ? text.replace(/\n/g, '<br />') : '');
  const resolvedText = text ?? stripHtml(resolvedHtml);

  if (!resolvedHtml && !resolvedText) {
    throw new Error('Template is empty after rendering');
  }

  return { subject, html: resolvedHtml, text: resolvedText };
}

function localizeVariables(
  variables: Record<string, unknown>,
  locale: string,
  timezone: string
) {
  const localized = { ...variables } as Record<string, unknown>;
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone
  });

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.valueOf())) {
        localized[`${key}Localized`] = formatter.format(date);
      }
    }
  }

  localized.locale = locale;
  localized.timezone = timezone;

  return localized;
}

async function fetchEmailIdentity(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from('notification_identities')
    .select('provider, config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'sendgrid')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch notification identity: ${error.message}`);
  }

  return (data as NotificationIdentityRecord | null) ?? null;
}

function parseEmailIdentity(
  identity: NotificationIdentityRecord | null,
  env: Env
) {
  const config = identity?.config ?? {};
  const fromEmail = typeof config.fromEmail === 'string' ? config.fromEmail : env.NOTIFICATION_DEFAULT_FROM_EMAIL;
  const fromName = typeof config.fromName === 'string' ? config.fromName : env.NOTIFICATION_DEFAULT_FROM_NAME;
  const replyTo = typeof config.replyTo === 'string' ? config.replyTo : undefined;
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey : env.SENDGRID_API_KEY;

  return {
    apiKey,
    fromEmail,
    fromName,
    replyTo,
    source: identity ? 'tenant' : 'global'
  } as const;
}

function maskPhone(phone: string | null | undefined) {
  if (!phone) return 'unknown';
  const digits = phone.replace(/\D+/g, '');
  if (!digits) return 'unknown';
  return digits.length <= 4 ? `***${digits}` : `***${digits.slice(-4)}`;
}

async function hashIdentifier(value: string | null | undefined) {
  if (!value) return null;
  try {
    const cryptoApi = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
    if (cryptoApi?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(value);
      const digest = await cryptoApi.subtle.digest('SHA-256', data);
      const bytes = Array.from(new Uint8Array(digest));
      return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch (error) {
    console.warn('Unable to hash identifier', { message: error instanceof Error ? error.message : String(error) });
  }
  return null;
}

async function logNotification(
  client: SupabaseClient,
  payload: {
    tenantId: string;
    type: string;
    channel: NotificationChannel;
    provider: string;
    templateId?: string | null;
    status: 'queued' | 'sent' | 'failed';
    recipient: string | null | undefined;
    locale: string;
    timezone: string;
    error?: string;
    metadata?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    providerMessageId?: string;
  }
) {
  const recipientHash = await hashIdentifier(payload.recipient ?? undefined);
  const recipientHint = payload.channel === 'email' ? maskEmail(payload.recipient) : maskPhone(payload.recipient);

  try {
    await client.from('notification_logs').insert({
      tenant_id: payload.tenantId,
      notification_type: payload.type,
      channel: payload.channel,
      provider: payload.provider,
      template_id: payload.templateId ?? null,
      status: payload.status,
      recipient_hash: recipientHash,
      recipient_hint: recipientHint,
      locale: payload.locale,
      timezone: payload.timezone,
      error: payload.error,
      metadata: payload.metadata ?? {},
      payload: payload.payload ?? null,
      provider_message_id: payload.providerMessageId ?? null
    });
  } catch (error) {
    console.error('Failed to log notification event', {
      tenantId: payload.tenantId,
      type: payload.type,
      channel: payload.channel,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function sendSms(env: Env, to: string, body: string) {
  const client = createTwilioClient(env);
  const maxAttempts = 3;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const response = await client.sendSms(to, body);
      return { success: true, providerMessageId: response?.sid };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = 250 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return { success: false, error: lastError };
}

export async function sendNotification(
  env: Env,
  tenantId: string,
  type: string,
  payload: NotificationPayload
) {
  const client = getClient(env);
  const tenant = await fetchTenant(client, tenantId);
  const tenantSettings = (tenant.settings ?? {}) as Record<string, unknown>;
  const tenantLocale = typeof tenantSettings.locale === 'string' ? tenantSettings.locale : undefined;
  const tenantTimezone = typeof tenantSettings.timezone === 'string' ? tenantSettings.timezone : undefined;
  const fallbackLocale = env.NOTIFICATION_FALLBACK_LOCALE ?? 'en';
  const fallbackTimezone = env.NOTIFICATION_FALLBACK_TIMEZONE ?? 'UTC';

  const channels = (payload.channels && payload.channels.length > 0 ? payload.channels : ['email']) as NotificationChannel[];
  const results: NotificationResult[] = [];

  for (const channel of channels) {
    let template: NotificationTemplateRecord | null = null;
    let localeForTemplate = payload.locale ?? tenantLocale ?? fallbackLocale;
    let timezoneForTemplate = payload.timezone ?? tenantTimezone ?? fallbackTimezone;

    try {
      const localePriority = determineLocalePriority(payload.locale, tenantLocale, fallbackLocale);
      const templates = await fetchTemplates(client, tenantId, type, channel);
      template = pickTemplate(templates, tenantId, localePriority);

      if (!template) {
        throw new Error(`No template configured for ${type}/${channel}`);
      }

      localeForTemplate = resolveLocale(template, payload.locale, tenantLocale, fallbackLocale);
      timezoneForTemplate = resolveTimezone(template, payload.timezone, tenantTimezone, fallbackTimezone);

      const variables = {
        ...(payload.data ?? {}),
        tenant: {
          id: tenant.id,
          name: tenant.name
        },
        recipient: {
          name: payload.to?.name ?? undefined,
          email: payload.to?.email ?? undefined,
          phone: payload.to?.phone ?? undefined
        }
      };

      const localizedVariables = localizeVariables(variables, localeForTemplate, timezoneForTemplate);
      const rendered = renderTemplate(template, localizedVariables);

      if (channel === 'email') {
        const recipientEmail = payload.to?.email ?? undefined;
        if (!recipientEmail) {
          throw new Error('Email recipient is missing');
        }

        const identityRecord = await fetchEmailIdentity(client, tenantId);
        const identity = parseEmailIdentity(identityRecord, env);

        if (!identity.apiKey) {
          throw new Error('SendGrid API key is not configured');
        }

        if (!identity.fromEmail) {
          throw new Error('Sender email address is not configured');
        }

        const dispatchResult = await sendEmailViaSendGrid(identity.apiKey, {
          from: {
            email: identity.fromEmail,
            name: identity.fromName ?? undefined
          },
          to: {
            email: recipientEmail,
            name: payload.to?.name ?? undefined
          },
          subject: rendered.subject ?? type.replace(/_/g, ' '),
          html: rendered.html,
          text: rendered.text,
          replyTo: identity.replyTo
            ? {
                email: identity.replyTo
              }
            : undefined
        });

        const success = dispatchResult.success;
        const errorMessage = success
          ? undefined
          : dispatchResult.error instanceof Error
            ? dispatchResult.error.message
            : dispatchResult.error
              ? String(dispatchResult.error)
              : 'Unknown error';

        await logNotification(client, {
          tenantId,
          type,
          channel,
          provider: 'sendgrid',
          templateId: template.id,
          status: success ? 'sent' : 'failed',
          recipient: recipientEmail,
          locale: localeForTemplate,
          timezone: timezoneForTemplate,
          error: errorMessage,
          metadata: {
            identitySource: identity.source,
            replyTo: identity.replyTo ?? undefined
          },
          payload: payload.data,
          providerMessageId: success ? dispatchResult.messageId ?? 'accepted' : undefined
        });

        results.push({
          channel,
          success,
          error: errorMessage,
          providerMessageId: success ? dispatchResult.messageId ?? 'accepted' : undefined,
          templateId: template.id
        });
      } else if (channel === 'sms') {
        const recipientPhone = payload.to?.phone ?? undefined;
        if (!recipientPhone) {
          throw new Error('SMS recipient is missing');
        }

        const smsBody = rendered.text ?? stripHtml(rendered.html);
        const dispatchResult = await sendSms(env, recipientPhone, smsBody);

        const success = dispatchResult.success;
        const errorMessage = success
          ? undefined
          : dispatchResult.error instanceof Error
            ? dispatchResult.error.message
            : dispatchResult.error
              ? String(dispatchResult.error)
              : 'Unknown error';

        await logNotification(client, {
          tenantId,
          type,
          channel,
          provider: 'twilio',
          templateId: template.id,
          status: success ? 'sent' : 'failed',
          recipient: recipientPhone,
          locale: localeForTemplate,
          timezone: timezoneForTemplate,
          error: errorMessage,
          metadata: {},
          payload: payload.data,
          providerMessageId: dispatchResult.providerMessageId
        });

        results.push({
          channel,
          success,
          error: errorMessage,
          providerMessageId: dispatchResult.providerMessageId,
          templateId: template.id
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Notification dispatch failure', {
        tenantId,
        type,
        channel,
        locale: localeForTemplate,
        timezone: timezoneForTemplate,
        error: message
      });

      await logNotification(client, {
        tenantId,
        type,
        channel,
        provider: channel === 'email' ? 'sendgrid' : 'twilio',
        templateId: template?.id ?? null,
        status: 'failed',
        recipient: channel === 'email' ? payload.to?.email ?? null : payload.to?.phone ?? null,
        locale: localeForTemplate,
        timezone: timezoneForTemplate,
        error: message,
        metadata: { stage: 'pre-dispatch' },
        payload: payload.data
      });

      results.push({
        channel,
        success: false,
        error: message,
        templateId: template?.id ?? null
      });
    }
  }

  return results;
}
