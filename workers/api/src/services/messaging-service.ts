import { normalizeError, type RequestLogger } from '@ai-hairdresser/shared';
import { RequestLogger, normalizeError } from '@ai-hairdresser/shared';

import { createTwilioClient } from '../integrations/twilio';
import { callOpenAI } from '../integrations/openai';
import { createSystemLogger } from '../lib/observability';
import { checkUsageQuota, recordUsageEvent } from './usage-service';

type OutboundPayload = {
  to: string;
  body: string;
  channel?: 'sms' | 'whatsapp';
};

export type InboundMessage = {
  provider: 'twilio';
  channel: 'sms' | 'whatsapp';
  messageId: string;
  tenantId: string | null;
  from: string;
  to: string;
  text: string;
  raw?: Record<string, unknown>;
};

export const mask = (value: string | null | undefined, show = 2) => {
  if (!value) return 'unknown';
  const normalized = value.replace(/[^\da-z+]/gi, '');
  if (normalized.length <= show) {
    return `${normalized}${'*'.repeat(Math.max(0, show - normalized.length))}`;
  }
  return `${normalized.slice(0, show)}${'*'.repeat(Math.max(0, normalized.length - show))}`;
};

export const safeLog = (message: InboundMessage) => ({
  provider: message.provider,
  channel: message.channel,
  messageId: message.messageId ? `***${message.messageId.slice(-6)}` : undefined,
  tenantId: message.tenantId ?? undefined,
  from: mask(message.from),
  to: mask(message.to),
  text: message.text.length > 256 ? `${message.text.slice(0, 256)}…` : message.text,
  raw: undefined
});

function extractTenantFromNumber(to: string): string | null {
  if (!to) return null;
  const normalized = to.replace(/^whatsapp:/i, '').trim();
  if (!normalized) return null;
  return null;
}

export function normalizeTwilio(params: URLSearchParams): InboundMessage {
  const fromRaw = params.get('From') ?? '';
  const toRaw = params.get('To') ?? '';
  const channel: 'sms' | 'whatsapp' =
    fromRaw.toLowerCase().startsWith('whatsapp:') || toRaw.toLowerCase().startsWith('whatsapp:') ? 'whatsapp' : 'sms';

  const messageId = params.get('MessageSid') ?? crypto.randomUUID();
  const text = params.get('Body') ?? '';
  const raw = Object.fromEntries(params.entries());
  const tenantHint = params.get('tenantId') ?? params.get('TenantId') ?? params.get('tenant_id');

  return {
    provider: 'twilio',
    channel,
    messageId,
    tenantId: tenantHint && tenantHint.trim() ? tenantHint.trim() : extractTenantFromNumber(toRaw),
    from: fromRaw.replace(/^whatsapp:/i, ''),
    to: toRaw.replace(/^whatsapp:/i, ''),
    text,
    raw
  };
}

export function normalizeInboundMessagePayload(payload: unknown): InboundMessage {
  if (payload instanceof URLSearchParams) {
    return normalizeTwilio(payload);
  }

  if (payload && typeof payload === 'object' && 'provider' in payload && 'messageId' in payload) {
    const candidate = payload as Partial<InboundMessage>;
    if (candidate.provider === 'twilio' && candidate.messageId && candidate.channel && candidate.from && candidate.to) {
      const record = candidate as Record<string, unknown>;
      const tenantCandidate =
        (typeof candidate.tenantId === 'string' && candidate.tenantId) ||
        (typeof record['tenant_id'] === 'string' && (record['tenant_id'] as string)) ||
        (typeof record['tenantId'] === 'string' && (record['tenantId'] as string)) ||
        undefined;
      return {
        provider: 'twilio',
        channel: candidate.channel,
        messageId: candidate.messageId,
        tenantId: tenantCandidate ?? extractTenantFromNumber(candidate.to),
        from: candidate.from,
        to: candidate.to,
        text: candidate.text ?? '',
        raw: candidate.raw ?? undefined
      };
    }
  }

  if (payload && typeof payload === 'object') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' || typeof value === 'number') {
        params.append(key, String(value));
      }
    }
    return normalizeTwilio(params);
  }

  throw new Error('Unsupported inbound message payload');
}

export async function sendOutboundMessage(env: Env, tenantId: string, payload: OutboundPayload, parentLogger?: RequestLogger) {
export type NormalizedInboundMessage = {
  raw: Record<string, unknown>;
  body?: string;
  from?: string;
  to?: string;
  channel?: 'sms' | 'whatsapp' | 'voice';
  messageSid?: string;
  tenantId?: string | null;
};

function maskRecipient(recipient?: string) {
  if (!recipient) {
    return 'unknown';
  }
  const stripped = recipient.replace(/[^\d]+/g, '');
  if (stripped.length <= 4) {
    return `***${stripped}`;
  }
  return `***${stripped.slice(-4)}`;
}

function detectChannel(raw: Record<string, unknown>, from?: string, to?: string): NormalizedInboundMessage['channel'] {
  if (raw.CallSid || raw.CallStatus || raw.CallDuration) {
    return 'voice';
  }
  const channelHint = typeof raw.Channel === 'string' ? raw.Channel : typeof raw.channel === 'string' ? raw.channel : undefined;
  if (channelHint && channelHint.toLowerCase().includes('whatsapp')) {
    return 'whatsapp';
  }
  if (from?.toLowerCase().startsWith('whatsapp:') || to?.toLowerCase().startsWith('whatsapp:')) {
    return 'whatsapp';
  }
  return from || to ? 'sms' : undefined;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

export function normalizeInboundMessagePayload(payload: unknown): NormalizedInboundMessage {
  if (payload && typeof payload === 'object' && 'raw' in (payload as Record<string, unknown>)) {
    return payload as NormalizedInboundMessage;
  }

  const raw = payload && typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const body = coerceString(raw.Body ?? raw.body ?? raw.Message ?? raw.message);
  const from = coerceString(raw.From ?? raw.from ?? raw.Caller ?? raw.caller);
  const to = coerceString(raw.To ?? raw.to ?? raw.Recipient ?? raw.recipient);
  const messageSid = coerceString(
    raw.MessageSid ?? raw.SmsMessageSid ?? raw.SmsSid ?? raw.CallSid ?? raw.CallSid ?? raw.EventSid ?? raw.sid ?? raw.SID
  );
  const tenantCandidate = raw.tenantId ?? raw.TenantId ?? raw.tenant_id;
  const tenantId = typeof tenantCandidate === 'string' && tenantCandidate.length > 0 ? tenantCandidate : null;

  const channel = detectChannel(raw, from, to);

  return {
    raw,
    body,
    from,
    to,
    channel,
    messageSid,
    tenantId
  };
}

export async function sendOutboundMessage(
  env: Env,
  tenantId: string,
  payload: OutboundPayload,
  parentLogger?: RequestLogger
) {
  if (!payload?.to || !payload?.body) {
    throw new Error('Missing recipient or message body');
  }

  const logger =
    parentLogger?.child({ component: 'messaging.outbound', tenantId }) ??
    createSystemLogger({ component: 'messaging.outbound', tenantId });

  logger.info('Queue outbound message', { tenantId, to: mask(payload.to), channel: payload.channel ?? 'sms' });
  logger.info('Queue outbound message', { tenantId, to: maskRecipient(payload.to), channel: payload.channel ?? 'sms' });

  await checkUsageQuota(env, tenantId, 'message.sent', 1);

  const client = createTwilioClient(env, logger);
  const channel = payload.channel ?? 'sms';
  try {
    const result =
      channel === 'whatsapp'
        ? await client.sendWhatsapp(payload.to, payload.body)
        : await client.sendSms(payload.to, payload.body);

    await recordUsageEvent(env, tenantId, 'message.sent', {
      metadata: {
        channel,
        hasRecipient: Boolean(payload.to)
      }
    });

    return { status: 'queued', sid: result.sid, channel };
  } catch (error) {
    logger.error('Failed to send outbound message', { error: normalizeError(error) });
    throw error;
  }
}

function isInboundMessage(value: unknown): value is InboundMessage {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>).provider === 'twilio' &&
      typeof (value as Record<string, unknown>).messageId === 'string'
  );
}

export async function handleInboundMessage(env: Env, payload: unknown, parentLogger?: RequestLogger) {
  const message = isInboundMessage(payload) ? (payload as InboundMessage) : normalizeInboundMessagePayload(payload);

  const logger =
    parentLogger?.child({ component: 'messaging.inbound', channel: message.channel }) ??
    createSystemLogger({ component: 'messaging.inbound', channel: message.channel });

  logger.info('Inbound message received', safeLog(message));

  const trimmedBody = message.text.trim();
function isNormalizedInboundMessage(value: unknown): value is NormalizedInboundMessage {
  return Boolean(value && typeof value === 'object' && 'raw' in (value as Record<string, unknown>));
}

export async function handleInboundMessage(env: Env, payload: unknown, parentLogger?: RequestLogger) {
  const message = isNormalizedInboundMessage(payload) ? (payload as NormalizedInboundMessage) : normalizeInboundMessagePayload(payload);

  const logger =
    parentLogger?.child({ component: 'messaging.inbound', channel: message.channel ?? 'unknown' }) ??
    createSystemLogger({ component: 'messaging.inbound', channel: message.channel ?? 'unknown' });

  logger.info('Inbound message received', {
    from: maskRecipient(message.from),
    to: maskRecipient(message.to),
    channel: message.channel ?? 'unknown',
    messageSid: message.messageSid ? `***${message.messageSid.slice(-6)}` : undefined
  });

  const trimmedBody = message.body?.trim() ?? '';
  const prompt =
    trimmedBody.length > 0
      ? `Client message: ${trimmedBody}. Respond as a helpful salon receptionist.`
      : 'Respond as a helpful salon receptionist acknowledging the incoming message.';

  const aiResponse = await callOpenAI(env, message.tenantId ?? null, { prompt });

  logger.debug('Generated AI response for inbound message', {
    messageId: message.messageId ? `***${message.messageId.slice(-6)}` : undefined
    messageSid: message.messageSid ? `***${message.messageSid.slice(-6)}` : undefined
  });

  return {
    action: 'respond',
    aiResponse,
    fallback: trimmedBody.toLowerCase().includes('agent'),
    messageSid: message.messageId
    messageSid: message.messageSid
  };
}
