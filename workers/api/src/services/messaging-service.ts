import { createTwilioClient } from '../integrations/twilio';
import { callOpenAI } from '../integrations/openai';

export async function sendOutboundMessage(env: Env, tenantId: string, payload: any) {
  const client = createTwilioClient(env);
  console.log('Queue outbound message', { tenantId, payload });
  if (payload.channel === 'whatsapp') {
    // TODO: Send via WhatsApp messaging service
  } else {
    // TODO: Send via SMS
  }
  return { status: 'queued' };
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
