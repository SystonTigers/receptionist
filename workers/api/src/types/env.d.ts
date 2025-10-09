import type { RequestLogger } from '@ai-hairdresser/shared';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { FeatureCode, TenantPlanAccess, Role } from '@ai-hairdresser/shared';

declare global {
  interface Env {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    JWT_SECRET: string;
    MULTITENANT_SIGNING_KEY: string;
    IDEMP_KV: KVNamespace;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_DEFAULT_PRICE_ID: string;
    STRIPE_BILLING_PORTAL_RETURN_URL?: string;
    TWILIO_ACCOUNT_SID: string;
    TWILIO_AUTH_TOKEN: string;
    SENDGRID_API_KEY?: string;
    NOTIFICATION_DEFAULT_FROM_EMAIL?: string;
    NOTIFICATION_DEFAULT_FROM_NAME?: string;
    NOTIFICATION_FALLBACK_LOCALE?: string;
    NOTIFICATION_FALLBACK_TIMEZONE?: string;
    OPENAI_API_KEY: string;
    BOOKING_DEPOSIT_SUCCESS_URL?: string;
    BOOKING_DEPOSIT_CANCEL_URL?: string;
    DEFAULT_CURRENCY?: string;
    SUPABASE_DB_HOST?: string;
    SUPABASE_DB_NAME?: string;
    SUPABASE_DB_USER?: string;
    SUPABASE_DB_PASSWORD?: string;
    SUPABASE_DB_PORT?: string;
    WORKER_ENVIRONMENT?: string;
    SENTRY_DSN?: string;
    SENTRY_ENVIRONMENT?: string;
    SENTRY_SAMPLE_RATE?: string;
    SENTRY_TRACES_SAMPLE_RATE?: string;
    SENTRY_RELEASE?: string;
    SYSTEM_VERSION?: string;
  }

  interface TenantScopedRequest extends Request {
    tenantId?: string;
    userId?: string;
    role?: Role;
    requestId?: string;
    logger?: RequestLogger;
    subscription?: {
      status: string;
      planId: string;
      startDate?: string | null;
      nextBillingDate?: string | null;
      delinquent: boolean;
    };
    featureAccess?: TenantPlanAccess;
    hasFeature?: (feature: FeatureCode) => boolean;
  }
type Role = import('@ai-hairdresser/shared').Role;

import type { FeatureCode, TenantPlanAccess } from '@ai-hairdresser/shared';


interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  MULTITENANT_SIGNING_KEY: string;
  IDEMP_KV: KVNamespace;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_DEFAULT_PRICE_ID: string;
  STRIPE_BILLING_PORTAL_RETURN_URL?: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  SENDGRID_API_KEY?: string;
  NOTIFICATION_DEFAULT_FROM_EMAIL?: string;
  NOTIFICATION_DEFAULT_FROM_NAME?: string;
  NOTIFICATION_FALLBACK_LOCALE?: string;
  NOTIFICATION_FALLBACK_TIMEZONE?: string;
  OPENAI_API_KEY: string;
  BOOKING_DEPOSIT_SUCCESS_URL?: string;
  BOOKING_DEPOSIT_CANCEL_URL?: string;
  DEFAULT_CURRENCY?: string;
  SUPABASE_DB_HOST?: string;
  SUPABASE_DB_NAME?: string;
  SUPABASE_DB_USER?: string;
  SUPABASE_DB_PASSWORD?: string;
  SUPABASE_DB_PORT?: string;
  WORKER_ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_SAMPLE_RATE?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  SENTRY_RELEASE?: string;
  SYSTEM_VERSION?: string;
}

export {};
