import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import {
  TENANT_USAGE_LIMITS,
  type TenantTier,
  type UsageLimitDefinition,
  type UsageMeasurement,
  type UsageOverview,
  type UsageQuotaState
} from '@ai-hairdresser/shared';
import { JsonResponse } from '../lib/response';

type UsageEventRow = {
  quantity?: number | string | null;
  metadata?: Record<string, unknown> | null;
  occurred_at?: string | null;
};

type UsageEventAggregateRow = UsageEventRow & {
  event_type: string;
};

const tenantTierCache = new Map<string, TenantTier>();

function getClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function getMeasurementValue(row: UsageEventRow, measurement: UsageMeasurement): number {
  if (measurement === 'tokens') {
    const meta = row.metadata ?? {};
    const tokenValue = normalizeNumber((meta as Record<string, unknown>).tokens as number | string | null | undefined, -1);
    if (tokenValue >= 0) {
      return tokenValue;
    }
  }

  const quantity = normalizeNumber(row.quantity ?? null, 0);
  return quantity > 0 ? quantity : 1;
}

async function getTenantTier(client: SupabaseClient, tenantId: string): Promise<TenantTier> {
  const cached = tenantTierCache.get(tenantId);
  if (cached) {
    return cached;
  }

  const { data, error } = await client.from('tenants').select('tier').eq('id', tenantId).single();
  if (error) {
    throw new Error(`Failed to resolve tenant tier: ${error.message}`);
  }

  const tier = (data?.tier as TenantTier | undefined) ?? 'starter';
  tenantTierCache.set(tenantId, tier);
  return tier;
}

function getLimitMap(tier: TenantTier) {
  return TENANT_USAGE_LIMITS[tier] ?? {};
}

async function calculateUsage(
  client: SupabaseClient,
  tenantId: string,
  eventType: string,
  definition: UsageLimitDefinition,
  reference: Date
) {
  const periodStart = dayjs(reference).startOf(definition.period).toISOString();
  const { data, error } = await client
    .from('usage_events')
    .select('quantity, metadata')
    .eq('tenant_id', tenantId)
    .eq('event_type', eventType)
    .gte('occurred_at', periodStart);

  if (error) {
    throw new Error(`Failed to calculate usage for ${eventType}: ${error.message}`);
  }

  const total = (data ?? []).reduce((sum, row) => sum + getMeasurementValue(row as UsageEventRow, definition.measurement), 0);

  return { total, periodStart };
}

async function resolveLimit(
  client: SupabaseClient,
  tenantId: string,
  eventType: string
): Promise<{ tier: TenantTier; definition?: UsageLimitDefinition }> {
  const tier = await getTenantTier(client, tenantId);
  const limit = getLimitMap(tier)[eventType];
  return { tier, definition: limit };
}

export async function checkUsageQuota(
  env: Env,
  tenantId: string,
  eventType: string,
  amount: number,
  reference: Date = new Date()
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const client = getClient(env);
  const { definition } = await resolveLimit(client, tenantId, eventType);
  if (!definition || definition.limit === null) {
    return;
  }

  const { total } = await calculateUsage(client, tenantId, eventType, definition, reference);
  if (total + amount > definition.limit) {
    throw JsonResponse.error(
      `${definition.label} quota exceeded`,
      429,
      {
        limit: definition.limit,
        used: total,
        attempted: amount
      }
    );
  }
}

interface RecordUsageOptions {
  quantity?: number;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export async function recordUsageEvent(
  env: Env,
  tenantId: string,
  eventType: string,
  options: RecordUsageOptions = {}
) {
  const client = getClient(env);
  const payload = {
    tenant_id: tenantId,
    event_type: eventType,
    quantity: options.quantity ?? 1,
    metadata: options.metadata ?? {},
    occurred_at: options.occurredAt ?? new Date().toISOString()
  };

  const { error } = await client.from('usage_events').insert(payload);
  if (error) {
    throw new Error(`Failed to record usage event: ${error.message}`);
  }
}

function buildMetricMetadata(
  tier: TenantTier,
  eventType: string,
  definition: UsageLimitDefinition | undefined,
  period: 'day' | 'month',
  periodStart: string
) {
  return {
    tier,
    eventType,
    period,
    periodStart,
    limit: definition?.limit ?? null,
    measurement: definition?.measurement ?? 'events'
  } satisfies Record<string, unknown>;
}

export async function aggregateUsageMetrics(env: Env) {
  const client = getClient(env);
  const tenants = await client.from('tenants').select('id, tier');
  if (tenants.error) {
    throw new Error(`Failed to load tenants for usage aggregation: ${tenants.error.message}`);
  }

  const monthStart = dayjs().startOf('month');
  const dayStart = dayjs().startOf('day');

  for (const tenant of tenants.data ?? []) {
    const tenantId = tenant.id as string;
    const tier = (tenant.tier as TenantTier | undefined) ?? 'starter';
    tenantTierCache.set(tenantId, tier);

    const { data, error } = await client
      .from('usage_events')
      .select('event_type, quantity, metadata, occurred_at')
      .eq('tenant_id', tenantId)
      .gte('occurred_at', monthStart.toISOString());

    if (error) {
      console.error('Usage aggregation failed to load events', { tenantId, message: error.message });
      continue;
    }

    const monthlyTotals = new Map<string, number>();
    const dailyTotals = new Map<string, number>();

    for (const row of data ?? []) {
      const aggregateRow = row as UsageEventAggregateRow;
      const definition = getLimitMap(tier)[aggregateRow.event_type];
      const measurement = definition?.measurement ?? 'events';
      const value = getMeasurementValue(aggregateRow, measurement);
      const existing = monthlyTotals.get(aggregateRow.event_type) ?? 0;
      monthlyTotals.set(aggregateRow.event_type, existing + value);

      if (aggregateRow.occurred_at && dayjs(aggregateRow.occurred_at).isSameOrAfter(dayStart)) {
        const dayExisting = dailyTotals.get(aggregateRow.event_type) ?? 0;
        dailyTotals.set(aggregateRow.event_type, dayExisting + value);
      }
    }

    const limitMap = getLimitMap(tier);

    const metricsPayload = [
      {
        tenant_id: tenantId,
        metric: 'usage.bookings.month',
        value: monthlyTotals.get('booking.created') ?? 0,
        metadata: buildMetricMetadata(tier, 'booking.created', limitMap['booking.created'], 'month', monthStart.toISOString()),
        occurred_at: monthStart.toISOString()
      },
      {
        tenant_id: tenantId,
        metric: 'usage.messages.month',
        value: monthlyTotals.get('message.sent') ?? 0,
        metadata: buildMetricMetadata(tier, 'message.sent', limitMap['message.sent'], 'month', monthStart.toISOString()),
        occurred_at: monthStart.toISOString()
      },
      {
        tenant_id: tenantId,
        metric: 'usage.ai.month.tokens',
        value: monthlyTotals.get('ai.request') ?? 0,
        metadata: buildMetricMetadata(tier, 'ai.request', limitMap['ai.request'], 'month', monthStart.toISOString()),
        occurred_at: monthStart.toISOString()
      },
      {
        tenant_id: tenantId,
        metric: 'usage.api.day',
        value: dailyTotals.get('api.call') ?? 0,
        metadata: buildMetricMetadata(tier, 'api.call', limitMap['api.call'], 'day', dayStart.toISOString()),
        occurred_at: dayStart.toISOString()
      }
    ];

    const { error: upsertError } = await client
      .from('usage_metrics')
      .upsert(metricsPayload, { onConflict: 'tenant_id,metric,occurred_at' });

    if (upsertError) {
      console.error('Failed to upsert usage metrics', { tenantId, message: upsertError.message });
    }
  }
}

export async function getUsageOverview(env: Env, tenantId: string): Promise<UsageOverview> {
  const client = getClient(env);
  const tier = await getTenantTier(client, tenantId);
  const limitMap = getLimitMap(tier);
  const now = new Date();

  const quotas: UsageQuotaState[] = [];
  for (const [eventType, definition] of Object.entries(limitMap)) {
    const { total } = await calculateUsage(client, tenantId, eventType, definition, now);
    const remaining =
      definition.limit === null ? null : Math.max(definition.limit - total, 0);
    quotas.push({
      eventType,
      label: definition.label,
      period: definition.period,
      measurement: definition.measurement,
      used: total,
      limit: definition.limit,
      remaining
    });
  }

  const { data, error } = await client
    .from('usage_metrics')
    .select('id, metric, value, metadata, occurred_at')
    .eq('tenant_id', tenantId)
    .order('occurred_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to fetch usage metrics: ${error.message}`);
  }

  const metrics = (data ?? []).map((row) => ({
    id: row.id as string,
    tenantId,
    metric: row.metric as string,
    value: normalizeNumber(row.value as number | string | null | undefined, 0),
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    occurredAt: row.occurred_at as string
  }));

  return { tier, quotas, metrics };
}
