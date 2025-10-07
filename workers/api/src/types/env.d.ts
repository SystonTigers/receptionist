interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  MULTITENANT_SIGNING_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_DEFAULT_PRICE_ID: string;
  STRIPE_BILLING_PORTAL_RETURN_URL?: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
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
}

type TenantScopedRequest = Request & {
  tenantId?: string;
  userId?: string;
  role?: string;
  subscription?: {
    status: string;
    planId: string;
    startDate?: string | null;
    nextBillingDate?: string | null;
    delinquent: boolean;
  };
};
