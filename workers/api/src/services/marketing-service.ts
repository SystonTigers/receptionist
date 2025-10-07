import { callOpenAI } from '../integrations/openai';

export async function generateAdCopy(env: Env, tenantId: string, payload: any) {
  console.log('Generate ad copy', { tenantId, payload });
  const prompt = `Salon: ${tenantId}. Theme: ${payload.theme ?? 'general'}.
Craft a social media post promoting ${payload.service ?? 'our services'}.`;
  const copy = await callOpenAI(env, tenantId, { prompt });
  return { copy };
}

export async function schedulePost(_env: Env, tenantId: string, payload: any) {
  console.log('Schedule post placeholder', { tenantId, payload });
  return { status: 'scheduled', runAt: payload.runAt ?? null };
}
