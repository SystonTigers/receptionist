import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import { normalizeError } from '@ai-hairdresser/shared';
import { createSystemLogger } from '../lib/observability';

type UsageMetricRow = {
  metric: string;
  value: number | string;
  occurred_at: string;
};

type ParsedMetric = {
  name: string;
  dimension?: string;
  value: number;
  occurredAt: string;
};

type DailyBucket = {
  date: string;
  value: number;
  samples: number;
};

export type ObservabilityAlert = {
  id: string;
  metric: string;
  observed: number;
  baseline?: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
};

export type ObservabilitySummary = {
  tenantId: string;
  timeframe: {
    start: string;
    end: string;
  };
  requests: Array<{ date: string; count: number }>;
  errorRate: Array<{ date: string; errors: number; requests: number; rate: number }>;
  latency: {
    p50: number;
    p95: number;
    average: number;
    samples: Array<{ occurredAt: string; value: number; route?: string }>;
    dailyAverage: Array<{ date: string; value: number }>;
  };
  messaging: {
    success: number;
    failure: number;
    failureRate: number;
    timeline: Array<{ date: string; success: number; failure: number }>;
  };
  alerts: ObservabilityAlert[];
};

function toNumber(value: number | string) {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMetric(row: UsageMetricRow): ParsedMetric {
  const [name, ...rest] = row.metric.split('::');
  const dimension = rest.length > 0 ? rest.join('::') : undefined;
  return {
    name,
    dimension,
    value: toNumber(row.value),
    occurredAt: row.occurred_at
  };
}

function groupByDay(metrics: ParsedMetric[], name: string, dimension?: string): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>();
  for (const metric of metrics) {
    if (metric.name !== name) continue;
    if (dimension && metric.dimension !== dimension) continue;
    const dateKey = dayjs(metric.occurredAt).startOf('day').format('YYYY-MM-DD');
    const bucket = buckets.get(dateKey) ?? { date: dateKey, value: 0, samples: 0 };
    bucket.value += metric.value;
    bucket.samples += 1;
    buckets.set(dateKey, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function combineDailySeries(
  base: DailyBucket[],
  overlay: DailyBucket[]
): Array<{ date: string; base: DailyBucket; overlay?: DailyBucket }> {
  const overlayMap = new Map<string, DailyBucket>();
  for (const item of overlay) {
    overlayMap.set(item.date, item);
  }
  const dates = new Set<string>([...base.map((item) => item.date), ...overlay.map((item) => item.date)]);
  return [...dates]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({
      date,
      base: base.find((item) => item.date === date) ?? { date, value: 0, samples: 0 },
      overlay: overlayMap.get(date)
    }));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function detectSpike(
  series: DailyBucket[],
  metric: string,
  title: string,
  unit = ''
): ObservabilityAlert | null {
  if (series.length < 4) {
    return null;
  }
  const ordered = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ordered[ordered.length - 1];
  const baselineSeries = ordered.slice(0, -1);
  const baseline = baselineSeries.reduce((acc, item) => acc + item.value, 0) / baselineSeries.length;
  if (latest.value <= 0 && baseline <= 0) {
    return null;
  }

  if (baseline === 0) {
    return {
      id: `${metric}-spike-${latest.date}`,
      metric,
      observed: latest.value,
      severity: 'critical',
      title,
      description: `Observed ${latest.value}${unit} with no historical baseline.`,
      baseline: 0
    };
  }

  const ratio = latest.value / baseline;
  if (ratio <= 1.5) {
    return null;
  }

  return {
    id: `${metric}-spike-${latest.date}`,
    metric,
    observed: latest.value,
    baseline,
    severity: ratio >= 2 ? 'critical' : 'warning',
    title,
    description: `Latest value ${latest.value.toFixed(2)}${unit} exceeds baseline ${baseline.toFixed(2)}${unit}.`
  };
}

function detectErrorRateSpike(series: Array<{ date: string; rate: number }>): ObservabilityAlert | null {
  if (series.length < 4) return null;
  const ordered = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ordered[ordered.length - 1];
  const history = ordered.slice(0, -1);
  const baseline = history.reduce((acc, item) => acc + item.rate, 0) / history.length;
  if (latest.rate <= 0.01) {
    return null;
  }
  if (baseline === 0 && latest.rate > 0.02) {
    return {
      id: `error-rate-${latest.date}`,
      metric: 'api.error_rate',
      observed: latest.rate,
      baseline,
      severity: 'critical',
      title: 'Error rate spike',
      description: `Error rate ${Math.round(latest.rate * 100)}% with no historical baseline.`
    };
  }
  if (baseline === 0) {
    return null;
  }
  const ratio = latest.rate / baseline;
  if (ratio <= 1.75) {
    return null;
  }
  return {
    id: `error-rate-${latest.date}`,
    metric: 'api.error_rate',
    observed: latest.rate,
    baseline,
    severity: ratio >= 2.5 ? 'critical' : 'warning',
    title: 'Error rate spike',
    description: `Latest error rate ${Math.round(latest.rate * 100)}% exceeds baseline ${Math.round(
      baseline * 100
    )}%.`
  };
}

export async function getObservabilitySummary(env: Env, tenantId: string): Promise<ObservabilitySummary> {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const rangeEnd = dayjs();
  const rangeStart = rangeEnd.subtract(14, 'day');

  const { data, error } = await client
    .from('usage_metrics')
    .select('metric, value, occurred_at')
    .eq('tenant_id', tenantId)
    .gte('occurred_at', rangeStart.toISOString())
    .order('occurred_at', { ascending: true })
    .limit(2000);

  if (error) {
    throw new Error(`Failed to load observability metrics: ${error.message}`);
  }

  const parsed = (data ?? []).map(parseMetric);

  const requestCounts = groupByDay(parsed, 'api.request.count');
  const errorCounts = groupByDay(parsed, 'api.request.error_count');

  const requestVolume = combineDailySeries(requestCounts, []).map((item) => ({
    date: item.date,
    count: item.base.value
  }));

  const errorRateSeries = combineDailySeries(requestCounts, errorCounts).map((item) => {
    const errors = item.overlay?.value ?? 0;
    const requests = item.base.value;
    const rate = requests > 0 ? errors / requests : 0;
    return {
      date: item.date,
      errors,
      requests,
      rate
    };
  });

  const latencySamples = parsed.filter((metric) => metric.name === 'api.request.duration_ms');
  const latencyValues = latencySamples.map((metric) => metric.value).filter((value) => Number.isFinite(value));
  const latencyDaily = groupByDay(parsed, 'api.request.duration_ms').map((bucket) => ({
    date: bucket.date,
    value: bucket.samples > 0 ? bucket.value / bucket.samples : 0
  }));

  const messagingSuccess = parsed.filter((metric) => metric.name === 'messaging.outbound.success');
  const messagingFailure = parsed.filter((metric) => metric.name === 'messaging.outbound.failure');
  const messagingTimeline = combineDailySeries(
    groupByDay(parsed, 'messaging.outbound.success'),
    groupByDay(parsed, 'messaging.outbound.failure')
  ).map((item) => ({
    date: item.date,
    success: item.base.value,
    failure: item.overlay?.value ?? 0
  }));

  const totalMessagingSuccess = messagingSuccess.reduce((acc, metric) => acc + metric.value, 0);
  const totalMessagingFailure = messagingFailure.reduce((acc, metric) => acc + metric.value, 0);
  const failureRate =
    totalMessagingSuccess + totalMessagingFailure > 0
      ? totalMessagingFailure / (totalMessagingSuccess + totalMessagingFailure)
      : 0;

  const alerts: ObservabilityAlert[] = [];
  const errorAlert = detectErrorRateSpike(errorRateSeries);
  if (errorAlert) {
    alerts.push(errorAlert);
  }
  const latencyAlert = detectSpike(
    latencyDaily.map((bucket) => ({ date: bucket.date, value: bucket.value, samples: 1 })),
    'api.request.latency',
    'Latency regression',
    'ms'
  );
  if (latencyAlert) {
    alerts.push(latencyAlert);
  }
  const messagingAlert = detectSpike(
    combineDailySeries(
      groupByDay(parsed, 'messaging.outbound.failure'),
      []
    ).map((item) => ({ date: item.date, value: item.base.value, samples: 1 })),
    'messaging.outbound.failure',
    'Messaging failures increased'
  );
  if (messagingAlert) {
    alerts.push(messagingAlert);
  }

  return {
    tenantId,
    timeframe: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString()
    },
    requests: requestVolume,
    errorRate: errorRateSeries,
    latency: {
      p50: percentile(latencyValues, 0.5),
      p95: percentile(latencyValues, 0.95),
      average: latencyValues.length
        ? latencyValues.reduce((acc, value) => acc + value, 0) / latencyValues.length
        : 0,
      samples: latencySamples.map((metric) => ({
        occurredAt: metric.occurredAt,
        value: metric.value,
        route: metric.dimension
      })),
      dailyAverage: latencyDaily
    },
    messaging: {
      success: totalMessagingSuccess,
      failure: totalMessagingFailure,
      failureRate,
      timeline: messagingTimeline
    },
    alerts
  };
}

export async function evaluateTenantAlerts(env: Env, tenantId: string) {
  try {
    const summary = await getObservabilitySummary(env, tenantId);
    return summary.alerts;
  } catch (error) {
    const logger = createSystemLogger({ component: 'observability.alerts', tenantId });
    logger.error('Failed to evaluate tenant alerts', { error: normalizeError(error) });
    return [];
  }
}

export async function runAnomalySweep(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const logger = createSystemLogger({ component: 'observability.sweep' });

  const { data: tenants, error } = await client.from('tenants').select('id');
  if (error) {
    logger.error('Unable to list tenants for observability sweep', { error: normalizeError(error) });
    return;
  }

  for (const tenant of tenants ?? []) {
    if (!tenant?.id) continue;
    const alerts = await evaluateTenantAlerts(env, tenant.id);
    for (const alert of alerts) {
      logger.warn('Anomaly detected', {
        tenantId: tenant.id,
        alert
      });
    }
  }
}

export async function getHealthSummary(env: Env) {
  const logger = createSystemLogger({ component: 'health' });
  const start = Date.now();
  let supabaseHealthy = false;
  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await client.from('tenants').select('id', { count: 'exact', head: true }).limit(1);
    supabaseHealthy = !error;
    if (error) {
      logger.warn('Supabase health check failed', { error: normalizeError(error) });
    }
  } catch (error) {
    logger.error('Supabase connectivity check threw', { error: normalizeError(error) });
  }

  return {
    ok: supabaseHealthy,
    timestamp: new Date().toISOString(),
    environment: env.WORKER_ENVIRONMENT ?? 'development',
    version: env.SYSTEM_VERSION ?? 'unknown',
    supabase: {
      ok: supabaseHealthy,
      latencyMs: Date.now() - start
    }
  };
}
