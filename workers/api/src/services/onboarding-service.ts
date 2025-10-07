import dayjs from 'dayjs';
import { createClient } from '@supabase/supabase-js';
import { queueNotification, NotificationTemplate } from './notification-service';

type TenantRow = {
  id: string;
  name: string;
  contact_email: string;
  created_at: string;
  settings: Record<string, unknown> | null;
};

type OnboardingProgressRow = {
  tenant_id: string;
  branding_completed_at: string | null;
  services_completed_at: string | null;
  first_booking_completed_at: string | null;
  first_booking_conversion_days: number | null;
  last_nudged_at: string | null;
  last_step_reminded: string | null;
};

type OnboardingSteps = {
  brandingComplete: boolean;
  servicesComplete: boolean;
  firstBookingComplete: boolean;
  firstBookingAt?: string | null;
};

const NUDGE_INTERVAL_HOURS = 48;

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeSettingsBranding(settings: Record<string, unknown> | null | undefined) {
  if (!settings || typeof settings !== 'object') return null;
  const branding = (settings as Record<string, unknown>).branding;
  return typeof branding === 'object' && branding ? (branding as Record<string, unknown>) : null;
}

export function evaluateOnboardingSteps(
  settings: Record<string, unknown> | null,
  servicesCount: number,
  firstBooking: { start_time: string | null } | null
): OnboardingSteps {
  const branding = normalizeSettingsBranding(settings);
  const brandingComplete = Boolean(branding && (branding.logoUrl || branding.primaryColor));
  const servicesComplete = servicesCount > 0;
  const firstBookingAt = firstBooking?.start_time ?? null;
  const firstBookingComplete = Boolean(firstBookingAt);

  return {
    brandingComplete,
    servicesComplete,
    firstBookingComplete,
    firstBookingAt
  };
}

function buildWelcomeTemplateContent(template: NotificationTemplate, tenantName: string) {
  switch (template) {
    case 'welcome_day_0':
      return {
        subject: `Welcome to Receptionist, ${tenantName}!`,
        body: `Hi ${tenantName},\n\nThanks for joining Receptionist. Let's get you set up today — start by customising your branding so clients recognise you straight away.`
      };
    case 'welcome_day_1':
      return {
        subject: 'Need a hand finishing setup?',
        body: `Hi ${tenantName},\n\nYou're almost there! Add your core services so the assistant can take bookings for you.`
      };
    case 'welcome_day_7':
      return {
        subject: 'Ready for your first booking?',
        body: `Hi ${tenantName},\n\nOne week in! If you haven't already, create a test booking to see the full flow in action. Reply to this email if you need help.`
      };
    default:
      return {
        subject: 'Quick tip to finish setup',
        body: `Hi ${tenantName},\n\nJump back into Receptionist to wrap up your onboarding tasks.`
      };
  }
}

function buildNudgeContent(step: keyof Pick<OnboardingSteps, 'brandingComplete' | 'servicesComplete' | 'firstBookingComplete'>, tenantName: string) {
  switch (step) {
    case 'brandingComplete':
      return {
        template: 'nudge_branding' as NotificationTemplate,
        subject: 'Add your salon branding',
        body: `Hi ${tenantName},\n\nUpload your logo and pick your colours so clients get a polished experience when booking.`
      };
    case 'servicesComplete':
      return {
        template: 'nudge_services' as NotificationTemplate,
        subject: 'List your key services',
        body: `Hi ${tenantName},\n\nCreate at least one service so we can start taking bookings for you.`
      };
    case 'firstBookingComplete':
      return {
        template: 'nudge_first_booking' as NotificationTemplate,
        subject: 'Time to take your first booking',
        body: `Hi ${tenantName},\n\nTry creating a booking in the calendar so you can see how Receptionist handles the flow end-to-end.`
      };
    default:
      return {
        template: 'nudge_branding' as NotificationTemplate,
        subject: 'Complete your setup',
        body: `Hi ${tenantName},\n\nJump back into Receptionist to wrap up your onboarding tasks.`
      };
  }
}

export async function initializeTenantOnboarding(env: Env, tenant: { id: string; name: string; contactEmail: string }) {
  const client = getClient(env);
  const now = new Date();
  const welcomeTemplates: Array<{ template: NotificationTemplate; offsetDays: number }> = [
    { template: 'welcome_day_0', offsetDays: 0 },
    { template: 'welcome_day_1', offsetDays: 1 },
    { template: 'welcome_day_7', offsetDays: 7 }
  ];

  for (const item of welcomeTemplates) {
    const sendAt = dayjs(now).add(item.offsetDays, 'day').toDate();
    const content = buildWelcomeTemplateContent(item.template, tenant.name);
    await queueNotification(env, tenant.id, {
      template: item.template,
      recipient: tenant.contactEmail,
      sendAt,
      subject: content.subject,
      body: content.body
    });
  }

  await client
    .from('tenant_onboarding_progress')
    .upsert(
      {
        tenant_id: tenant.id,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      },
      { onConflict: 'tenant_id' }
    );
}

async function fetchTenantData(env: Env) {
  const client = getClient(env);
  const { data, error } = await client.from('tenants').select('id, name, contact_email, created_at, settings');
  if (error) {
    throw new Error(`Failed to load tenants for onboarding sweep: ${error.message}`);
  }
  return (data ?? []) as TenantRow[];
}

async function fetchProgressMap(env: Env) {
  const client = getClient(env);
  const { data, error } = await client.from('tenant_onboarding_progress').select('*');
  if (error) {
    throw new Error(`Failed to load onboarding progress: ${error.message}`);
  }

  const map = new Map<string, OnboardingProgressRow>();
  for (const row of data ?? []) {
    map.set(row.tenant_id, row as OnboardingProgressRow);
  }
  return map;
}

async function fetchServicesCount(env: Env, tenantId: string) {
  const client = getClient(env);
  const { count, error } = await client
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) {
    throw new Error(`Failed to count services for tenant ${tenantId}: ${error.message}`);
  }
  return count ?? 0;
}

async function fetchFirstBooking(env: Env, tenantId: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('appointments')
    .select('start_time')
    .eq('tenant_id', tenantId)
    .in('status', ['confirmed', 'completed'])
    .order('start_time', { ascending: true })
    .limit(1);
  if (error) {
    throw new Error(`Failed to load first booking for tenant ${tenantId}: ${error.message}`);
  }
  return (data?.[0] as { start_time: string } | undefined) ?? null;
}

async function upsertProgress(env: Env, tenantId: string, updates: Partial<OnboardingProgressRow>) {
  const client = getClient(env);
  await client
    .from('tenant_onboarding_progress')
    .upsert(
      {
        tenant_id: tenantId,
        ...updates,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'tenant_id' }
    );
}

async function insertUsageMetric(env: Env, tenantId: string, value: number) {
  const client = getClient(env);
  await client.from('usage_metrics').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    metric: 'onboarding_conversion',
    value,
    occurred_at: new Date().toISOString()
  });
}

export async function runTenantOnboardingSweep(env: Env) {
  const tenants = await fetchTenantData(env);
  const progressMap = await fetchProgressMap(env);
  const now = dayjs();

  for (const tenant of tenants) {
    const progress = progressMap.get(tenant.id) ?? null;
    const servicesCount = await fetchServicesCount(env, tenant.id);
    const firstBooking = await fetchFirstBooking(env, tenant.id);
    const steps = evaluateOnboardingSteps(tenant.settings ?? {}, servicesCount, firstBooking);

    const updates: Partial<OnboardingProgressRow> = {};
    if (steps.brandingComplete && !progress?.branding_completed_at) {
      updates.branding_completed_at = now.toISOString();
    }
    if (steps.servicesComplete && !progress?.services_completed_at) {
      updates.services_completed_at = now.toISOString();
    }
    if (steps.firstBookingComplete && !progress?.first_booking_completed_at) {
      const bookingAt = steps.firstBookingAt ? dayjs(steps.firstBookingAt) : now;
      updates.first_booking_completed_at = bookingAt.toISOString();
      const conversionDays = bookingAt.diff(dayjs(tenant.created_at), 'day');
      updates.first_booking_conversion_days = conversionDays >= 0 ? conversionDays : 0;
    }

    const incompleteSteps: Array<keyof Pick<OnboardingSteps, 'brandingComplete' | 'servicesComplete' | 'firstBookingComplete'>> = [];
    if (!steps.brandingComplete) incompleteSteps.push('brandingComplete');
    if (!steps.servicesComplete) incompleteSteps.push('servicesComplete');
    if (!steps.firstBookingComplete) incompleteSteps.push('firstBookingComplete');

    if (Object.keys(updates).length > 0) {
      await upsertProgress(env, tenant.id, updates);
    }

    await insertUsageMetric(env, tenant.id, steps.firstBookingComplete ? 1 : 0);

    if (incompleteSteps.length === 0) {
      continue;
    }

    const lastNudgedAt = progress?.last_nudged_at ? dayjs(progress.last_nudged_at) : null;
    if (lastNudgedAt && now.diff(lastNudgedAt, 'hour') < NUDGE_INTERVAL_HOURS) {
      continue;
    }

    const stepKey = incompleteSteps[0];
    const nudge = buildNudgeContent(stepKey, tenant.name);
    await queueNotification(env, tenant.id, {
      template: nudge.template,
      recipient: tenant.contact_email,
      sendAt: now.toDate(),
      subject: nudge.subject,
      body: nudge.body
    });

    await upsertProgress(env, tenant.id, {
      last_nudged_at: now.toISOString(),
      last_step_reminded: stepKey
    });
  }
}
