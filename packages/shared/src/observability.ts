export type LoggerContext = {
  requestId: string;
  tenantId?: string;
  userId?: string;
  route?: string;
  component?: string;
  environment?: string;
};

export type LogMetadata = Record<string, unknown>;

export type MetricRecord = {
  metric: string;
  value: number;
  dimension?: string;
  occurredAt?: string;
};

export interface RequestLogger {
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
  metric(metric: string, value: number, metadata?: { dimension?: string; occurredAt?: string }): void;
  child(context: Partial<LoggerContext>): RequestLogger;
}

export type NormalizedError = {
  name?: string;
  message: string;
  stack?: string;
  cause?: string;
};

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? error.cause.message : undefined
    };
  }

  if (typeof error === 'object' && error !== null) {
    return {
      message: 'Unexpected error object',
      stack: JSON.stringify(error)
    };
  }

  return {
    message: typeof error === 'string' ? error : String(error)
  };
}

export function scrubMetadata(metadata: LogMetadata | undefined) {
  if (!metadata) return {} as LogMetadata;
  const cleaned: LogMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (value instanceof Error) {
      cleaned[key] = normalizeError(value);
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      try {
        cleaned[key] = JSON.parse(JSON.stringify(value));
      } catch (_err) {
        cleaned[key] = String(value);
      }
      continue;
    }
    cleaned[key] = value as unknown;
  }
  return cleaned;
}
