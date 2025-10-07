export const SYSTEM_ROLES = ['owner', 'admin', 'staff', 'viewer'] as const;
export const DEFAULT_TIMEZONE = 'Europe/London';
export const SUPPORTED_CHANNELS = ['sms', 'whatsapp', 'voice'] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const AUDIT_RESOURCE_TYPES = [
  'tenant',
  'user',
  'client',
  'stylist',
  'service',
  'appointment',
  'message',
  'payment'
] as const;

export const FEATURE_CODES = ['deposits_enabled', 'ai_assistant_enabled', 'team_accounts'] as const;
export const PLAN_CODES = ['free', 'basic', 'pro'] as const;
