export const SYSTEM_ROLES = ['admin', 'staff', 'stylist'] as const;
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
