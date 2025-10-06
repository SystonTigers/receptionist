import { createTwilioClient } from '../integrations/twilio';
import { callOpenAI } from '../integrations/openai';

type OutboundPayload = {
  to: string;
  body: string;
  channel?: 'sms' | 'whatsapp';
};

export async function sendOutboundMessage(env: Env, tenantId: string, payload: OutboundPayload) {
  if (!payload?.to || !payload?.body) {
    throw new Error('Missing recipient or message body');
  }

  const client = createTwilioClient(env);
  console.log('Queue outbound message', { tenantId, to: payload.to, channel: payload.channel ?? 'sms' });

  const channel = payload.channel ?? 'sms';
  const result =
    channel === 'whatsapp'
      ? await client.sendWhatsapp(payload.to, payload.body)
      : await client.sendSms(payload.to, payload.body);

  return { status: 'queued', sid: result.sid, channel };
}

export async function handleInboundMessage(env: Env, payload: any) {
  console.log('Inbound message payload', payload);
  const aiResponse = await callOpenAI(env, {
    prompt: `Client message: ${payload.body}. Respond as a helpful salon receptionist.`
  });
  return {
    action: 'respond',
    aiResponse,
    fallback: payload.body?.includes('agent')
  };
}
