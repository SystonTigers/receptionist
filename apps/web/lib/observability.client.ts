import * as Sentry from '@sentry/nextjs';
import { scrubMetadata } from '@ai-hairdresser/shared';

let browserInitialized = false;

function parseSampleRate(raw?: string) {
  if (!raw) return 0.1;
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }
  return 0.1;
}

export function initBrowserObservability() {
  if (browserInitialized) return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: parseSampleRate(process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE)
  });
  browserInitialized = true;
}

export function setBrowserUserContext(context: { id?: string; tenantId?: string } | null) {
  if (!browserInitialized) return;
  if (context?.tenantId) {
    Sentry.setTag('tenant_id', context.tenantId);
  }
  if (context && context.id) {
    Sentry.setUser({ id: context.id, tenantId: context.tenantId });
  } else {
    Sentry.setUser(null);
  }
}

export function captureBrowserException(error: unknown, metadata?: Record<string, unknown>) {
  if (!browserInitialized) return;
  Sentry.captureException(error, (scope) => {
    if (metadata) {
      scope.setContext('extra', scrubMetadata(metadata));
    }
    return scope;
  });
}
