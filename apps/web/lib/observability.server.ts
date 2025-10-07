import * as Sentry from '@sentry/nextjs';
import { normalizeError, LoggerContext, RequestLogger, scrubMetadata } from '@ai-hairdresser/shared';
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';

type ContextProvider = () => LoggerContext;

let serverInitialized = false;

function parseSampleRate(raw?: string) {
  if (!raw) return 0.1;
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed;
  }
  return 0.1;
}

export function initServerObservability() {
  if (serverInitialized) return;
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: parseSampleRate(
      process.env.SENTRY_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE ?? '0.1'
    )
  });
  serverInitialized = true;
}

function createLogger(provider: ContextProvider): RequestLogger {
  const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>) => {
    const base = provider();
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

  return {
    debug: (message, metadata) => log('debug', message, metadata),
    info: (message, metadata) => log('info', message, metadata),
    warn: (message, metadata) => log('warn', message, metadata),
    error: (message, metadata) => log('error', message, metadata),
    metric: () => {
      /* no-op metrics on server */
    },
    child: (overrides) => createLogger(() => ({ ...provider(), ...overrides }))
  };
}

export function withApiObservability(handler: NextApiHandler): NextApiHandler {
  return async function observabilityAwareHandler(req: NextApiRequest, res: NextApiResponse) {
    initServerObservability();

    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    const tenantId = (req.headers['x-tenant-id'] as string) ?? (req.query.tenantId as string | undefined);
    const route = req.url?.split('?')[0];
    const logger = createLogger(() => ({
      requestId,
      tenantId,
      route,
      component: 'next-api'
    }));

    req.requestId = requestId;
    req.tenantId = tenantId;
    req.logger = logger;
    res.setHeader('x-request-id', requestId);

    const start = Date.now();

    return Sentry.withScope(async (scope) => {
      scope.setTag('request_id', requestId);
      if (tenantId) {
        scope.setTag('tenant_id', tenantId);
      }

      try {
        const result = await handler(req, res);
        logger.info('API route completed', { status: res.statusCode, durationMs: Date.now() - start });
        return result;
      } catch (error) {
        logger.error('API route failed', { error: normalizeError(error), durationMs: Date.now() - start });
        if (serverInitialized) {
          Sentry.captureException(error);
        }
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal Server Error', requestId });
        }
        return undefined;
      }
    });
  };
}
