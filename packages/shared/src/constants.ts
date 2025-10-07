import type { TenantTier, UsageLimitDefinition } from './types';

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

type LimitMap = Record<string, UsageLimitDefinition>;

function unlimited(definition: UsageLimitDefinition): UsageLimitDefinition {
  return { ...definition, limit: null };
}

const bookingLimit: UsageLimitDefinition = {
  label: 'Bookings created',
  period: 'month',
  limit: 100,
  measurement: 'events'
};

const messagingLimit: UsageLimitDefinition = {
  label: 'Outbound messages',
  period: 'month',
  limit: 500,
  measurement: 'events'
};

const aiLimit: UsageLimitDefinition = {
  label: 'AI tokens',
  period: 'month',
  limit: 50000,
  measurement: 'tokens'
};

const apiLimit: UsageLimitDefinition = {
  label: 'API calls',
  period: 'day',
  limit: 3000,
  measurement: 'events'
};

export const TENANT_USAGE_LIMITS: Record<TenantTier, LimitMap> = {
  starter: {
    'booking.created': bookingLimit,
    'message.sent': messagingLimit,
    'ai.request': aiLimit,
    'api.call': apiLimit
  },
  growth: {
    'booking.created': { ...bookingLimit, limit: 400 },
    'message.sent': { ...messagingLimit, limit: 2000 },
    'ai.request': { ...aiLimit, limit: 200000 },
    'api.call': { ...apiLimit, limit: 10000 }
  },
  scale: {
    'booking.created': unlimited(bookingLimit),
    'message.sent': unlimited(messagingLimit),
    'ai.request': unlimited(aiLimit),
    'api.call': unlimited(apiLimit)
  }
};
