interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  MULTITENANT_SIGNING_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  OPENAI_API_KEY: string;
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
};
