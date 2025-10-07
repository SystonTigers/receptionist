import { createTwilioClient } from '../integrations/twilio';
import { callOpenAI } from '../integrations/openai';

import { RequestLogger, normalizeError } from '@ai-hairdresser/shared';
import { createSystemLogger } from '../lib/observability';

import { checkUsageQuota, recordUsageEvent } from './usage-service';


type OutboundPayload = {
  to: string;
  body: string;
  channel?: 'sms' | 'whatsapp';
};

export async function sendOutboundMessage(
  env: Env,
  tenantId: string,
  payload: OutboundPayload,
  parentLogger?: RequestLogger
) {
  if (!payload?.to || !payload?.body) {
    throw new Error('Missing recipient or message body');
  }


  const logger = parentLogger?.child({ component: 'messaging.outbound', tenantId }) ??
    createSystemLogger({ component: 'messaging.outbound', tenantId });
  const client = createTwilioClient(env, logger);
  logger.info('Queue outbound message', { tenantId, to: payload.to ? `***${String(payload.to).slice(-4)}` : 'unknown' });

  await checkUsageQuota(env, tenantId, 'message.sent', 1);
  const client = createTwilioClient(env);
  console.log('Queue outbound message', { tenantId, to: payload.to, channel: payload.channel ?? 'sms' })

  const channel = payload.channel ?? 'sms';
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
}

export async function handleInboundMessage(env: Env, payload: any, parentLogger?: RequestLogger) {
  const logger = parentLogger?.child({ component: 'messaging.inbound' }) ??
    createSystemLogger({ component: 'messaging.inbound' });
  logger.info('Inbound message payload received', {
    to: payload?.to ? `***${String(payload.to).slice(-4)}` : 'unknown'
  });
  const aiResponse = await callOpenAI(env, {
export async function handleInboundMessage(env: Env, payload: any) {
  console.log('Inbound message payload', payload);
  const aiResponse = await callOpenAI(env, payload?.tenantId ?? null, {
    prompt: `Client message: ${payload.body}. Respond as a helpful salon receptionist.`
  });
  logger.debug('Generated AI response for inbound message');
  return {
    action: 'respond',
    aiResponse,
    fallback: payload.body?.includes('agent')
  };
}
