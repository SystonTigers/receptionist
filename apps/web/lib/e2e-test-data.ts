export const E2E_TENANT_ID = 'tenant_e2e';
export const E2E_TENANT_SLUG = 'e2e-salon';
export const E2E_TENANT_NAME = 'E2E Hair Studio';
export const E2E_TENANT_EMAIL = 'owner@e2e.test';

export function createE2EServicesSeed() {
  return [
    { id: 'svc-cut', tenant_id: E2E_TENANT_ID, name: 'Signature Cut & Finish', duration_minutes: 45, price: 55 },
    { id: 'svc-colour', tenant_id: E2E_TENANT_ID, name: 'Colour Refresh', duration_minutes: 60, price: 75 }
  ];
}

export function createE2ETenantSettingsSeed() {
  return {
    timezone: 'Europe/London',
    business_hours: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      openTime: weekday === 0 ? '00:00' : '09:00',
      closeTime: weekday === 0 ? '00:00' : '18:00',
      closed: weekday === 0
    })),
    sms_reminders_enabled: true,
    email_reminders_enabled: true,
    reminder_lead_time_minutes: 120,
    primary_color: '#2563eb',
    logo_url: null
  };
}

export function createE2EPublicSettingsSeed() {
  return {
    branding: {
      primaryColor: '#1f2937',
      accentColor: '#f97316',
      backgroundColor: '#f8fafc',
      textColor: '#111827',
      logoUrl: null
    },
    booking: {
      startHour: 9,
      endHour: 17,
      intervalMinutes: 30,
      daysToShow: 7,
      timezone: 'Europe/London'
    }
  };
}

export function createE2ETenantRecord() {
  return {
    id: E2E_TENANT_ID,
    name: E2E_TENANT_NAME,
    slug: E2E_TENANT_SLUG,
    contact_email: E2E_TENANT_EMAIL,
    settings: createE2EPublicSettingsSeed()
  };
}
