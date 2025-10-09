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
    messageSid: message.messageSid ? `***${message.messageSid.slice(-6)}` : undefined
  });

  return {
    action: 'respond',
    aiResponse,
    fallback: trimmedBody.toLowerCase().includes('agent'),
    messageSid: message.messageSid
  };
}
