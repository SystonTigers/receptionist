import { callOpenAI } from '../integrations/openai';
import { createClient } from '@supabase/supabase-js';

type ReferralCodeRow = {
  id: string;
  tenant_id: string;
  code: string;
  reward_type: 'percentage' | 'fixed_amount' | 'credit';
  reward_value: number;
  max_redemptions: number | null;
  redemption_count: number | null;
  expires_at: string | null;
};

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

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

function generateReferralCode(base?: string) {
  if (base) {
    return base.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  }
  return Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
}

export async function createReferralCode(env: Env, tenantId: string, payload: any) {
  const client = getClient(env);
  const code = generateReferralCode(payload?.code);
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    code,
    reward_type: payload?.rewardType ?? 'percentage',
    reward_value: Number(payload?.rewardValue ?? 10),
    max_redemptions: payload?.maxRedemptions ?? null,
    redemption_count: 0,
    expires_at: payload?.expiresAt ?? null,
    created_at: now,
    updated_at: now
  };

  const { data, error } = await client.from('tenant_referral_codes').insert(record).select().single();
  if (error) {
    throw new Error(`Failed to create referral code: ${error.message}`);
  }
  return data as ReferralCodeRow;
}

export async function listReferralCodes(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('tenant_referral_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(`Failed to list referral codes: ${error.message}`);
  }
  return data ?? [];
}

export async function redeemReferralCode(env: Env, tenantId: string, payload: any) {
  if (!payload?.code) {
    throw new Error('Missing referral code');
  }
  const client = getClient(env);
  const code = generateReferralCode(payload.code);
  const { data: record, error } = await client
    .from('tenant_referral_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('code', code)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load referral code: ${error.message}`);
  }
  if (!record) {
    throw new Error('Referral code not found');
  }
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    throw new Error('Referral code expired');
  }
  if (
    record.max_redemptions !== null &&
    typeof record.max_redemptions === 'number' &&
    typeof record.redemption_count === 'number' &&
    record.redemption_count >= record.max_redemptions
  ) {
    throw new Error('Referral code fully redeemed');
  }

  const updatedCount = (record.redemption_count ?? 0) + 1;
  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from('tenant_referral_codes')
    .update({ redemption_count: updatedCount, updated_at: now })
    .eq('id', record.id);
  if (updateError) {
    throw new Error(`Failed to update referral code: ${updateError.message}`);
  }

  await client.from('tenant_referral_redemptions').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    referral_code_id: record.id,
    invitee_email: payload?.inviteeEmail ?? null,
    invitee_tenant_id: payload?.inviteeTenantId ?? null,
    redeemed_at: now
  });

  return {
    code: record.code,
    reward: {
      type: record.reward_type,
      value: record.reward_value
    },
    redemptionCount: updatedCount,
    maxRedemptions: record.max_redemptions
  };
}
