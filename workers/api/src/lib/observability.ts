import * as Sentry from '@sentry/cloudflare';
import { createClient } from '@supabase/supabase-js';
import {
  LoggerContext,
  MetricRecord,
  RequestLogger,
  normalizeError,
  scrubMetadata
} from '@ai-hairdresser/shared';
import { JsonResponse } from './response';

type MetricInput = MetricRecord;

type LoggerFactory = (overrides?: Partial<LoggerContext>) => RequestLogger;

let sentryInitialized = false;
let sentryActive = false;

function getSentryInit() {
  return (Sentry as unknown as { init?: (options: Record<string, unknown>) => void }).init;
}

function getSentryAsyncRunner() {
  return (Sentry as unknown as {
    runWithAsyncContext?: <T>(callback: () => Promise<T>) => Promise<T>;
  }).runWithAsyncContext;
}

function sampleRateFromEnv(env: Env) {
  const raw = env.SENTRY_TRACES_SAMPLE_RATE ?? env.SENTRY_SAMPLE_RATE ?? '0.1';
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }
  return 0.1;
}

export function ensureSentry(env: Env) {
  if (sentryInitialized) {
    return;
  }
  sentryInitialized = true;
  if (!env.SENTRY_DSN) {
    return;
  }

  const init = getSentryInit();
  if (typeof init === 'function') {
    init({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT ?? env.WORKER_ENVIRONMENT ?? 'development',
      tracesSampleRate: sampleRateFromEnv(env),
      release: env.SENTRY_RELEASE,
      autoSessionTracking: false
    });
    sentryActive = true;
  }
}

function sentryEnabled() {
  return sentryActive;
}

function metricKey(metric: MetricInput) {
  return metric.dimension ? `${metric.metric}::${metric.dimension}` : metric.metric;
}

async function persistUsageMetrics(env: Env, tenantId: string, metrics: MetricInput[]) {
  if (!tenantId || metrics.length === 0) {
    return;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  const rows = metrics.map((metric) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    metric: metricKey(metric),
    value: metric.value,
    occurred_at: metric.occurredAt ?? new Date().toISOString()
  }));

  try {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await client.from('usage_metrics').insert(rows);
    if (error) {
      console.error('Failed to persist usage metrics', {
        error: normalizeError(error)
      });
    }
  } catch (error) {
    console.error('Unexpected metrics persistence failure', {
      error: normalizeError(error)
    });
  }
}

function createConsoleLogger(contextProvider: () => LoggerContext, metrics: MetricInput[]): RequestLogger {
  const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>) => {
    const base = contextProvider();
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined)),
      ...scrubMetadata(metadata)
    };

    switch (level) {
      case 'debug':
        console.debug(payload);
        break;
      case 'info':
        console.info(payload);
        break;
      case 'warn':
        console.warn(payload);
        break;
      case 'error':
        console.error(payload);
        break;
    }
  };

  const factory: LoggerFactory = (overrides = {}) =>
    createConsoleLogger(() => ({ ...contextProvider(), ...overrides }), metrics);

  return {
    debug: (message, metadata) => log('debug', message, metadata),
    info: (message, metadata) => log('info', message, metadata),
    warn: (message, metadata) => log('warn', message, metadata),
    error: (message, metadata) => log('error', message, metadata),
    metric: (metric, value, metadata) => {
      metrics.push({
        metric,
        value,
        dimension: metadata?.dimension,
        occurredAt: metadata?.occurredAt
      });
    },
    child: (overrides) => factory(overrides)
  };
}

export function captureWorkerException(error: unknown, request?: TenantScopedRequest, extra?: Record<string, unknown>) {
  if (!sentryEnabled()) {
    return;
  }

  Sentry.captureException(error, (scope) => {
    if (request?.requestId) {
      scope.setTag('request_id', request.requestId);
    }
    if (request?.tenantId) {
      scope.setTag('tenant_id', request.tenantId);
    }
    if (request?.userId) {
      scope.setUser({ id: request.userId });
    }
    if (extra) {
      scope.setContext('extra', scrubMetadata(extra));
    }
    return scope;
  });
}

function withSentryScope(request: TenantScopedRequest) {
  if (!sentryEnabled()) {
    return;
  }
  Sentry.setTag('request_id', request.requestId ?? 'unknown');
  if (request.tenantId) {
    Sentry.setTag('tenant_id', request.tenantId);
  }
  if (request.userId) {
    Sentry.setUser({ id: request.userId });
  }
}

export function withObservability<T extends (...args: any[]) => Promise<any>>(handler: T) {
  return async function observabilityWrapper(request: Request, env: Env, ctx: ExecutionContext) {
    ensureSentry(env);

    const scoped = request as TenantScopedRequest;
    const url = new URL(request.url);
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const metrics: MetricInput[] = [];

    scoped.requestId = requestId;

    const logger = createConsoleLogger(
      () => ({
        requestId,
        tenantId: scoped.tenantId,
        userId: scoped.userId,
        route: url.pathname,
        environment: env.WORKER_ENVIRONMENT ?? 'development'
      }),
      metrics
    );

    scoped.logger = logger;

    const start = Date.now();

    const runner = getSentryAsyncRunner();
    const execute: <T>(cb: () => Promise<T>) => Promise<T> =
      typeof runner === 'function' ? runner : async <T>(cb: () => Promise<T>) => cb();

    return execute(async () => {
      withSentryScope(scoped);
      let status = 200;
      try {
        const response = await handler(scoped, env, ctx);
        if (response instanceof Response) {
          status = response.status;
          response.headers.set('x-request-id', requestId);
          return finalize(response);
        }
        status = 200;
        return finalize(JsonResponse.ok(response));
      } catch (error) {
        status = 500;
        logger.error('Request processing failed', { error: normalizeError(error) });
        captureWorkerException(error, scoped, { route: url.pathname, method: request.method });
        throw error;
      } finally {
        const tenantId = scoped.tenantId;
        const durationMs = Date.now() - start;
        const dimension = `${request.method ?? 'GET'} ${url.pathname}`;
        metrics.push({ metric: 'api.request.count', value: 1 });
        metrics.push({ metric: 'api.request.count', value: 1, dimension });
        metrics.push({ metric: 'api.request.duration_ms', value: durationMs });
        metrics.push({ metric: 'api.request.duration_ms', value: durationMs, dimension });
        if (status >= 400) {
          metrics.push({ metric: 'api.request.error_count', value: 1 });
          metrics.push({ metric: 'api.request.error_count', value: 1, dimension });
        }

        logger.info('Request completed', {
          status,
          durationMs,
          route: url.pathname,
          method: request.method
        });

        withSentryScope(scoped);

        if (tenantId && metrics.length > 0) {
          ctx.waitUntil(persistUsageMetrics(env, tenantId, [...metrics]));
        }

        if (sentryEnabled()) {
          ctx.waitUntil(Sentry.flush(2000));
        }
      }
    });

    function finalize(response: Response) {
      response.headers.set('x-request-id', requestId);
      return response;
    }
  };
}

export function createSystemLogger(context: Partial<LoggerContext> = {}) {
  const metrics: MetricInput[] = [];
  const base: LoggerContext = {
    requestId: crypto.randomUUID(),
    ...context
  } as LoggerContext;
  return createConsoleLogger(() => base, metrics);
}

export function recordMetric(metrics: MetricInput[], metric: MetricInput) {
  metrics.push(metric);
}

export function formatMetricName(metric: string, dimension?: string) {
  return dimension ? `${metric}::${dimension}` : metric;
}

export async function flushMetrics(env: Env, tenantId: string, metrics: MetricInput[]) {
  await persistUsageMetrics(env, tenantId, metrics);
}
