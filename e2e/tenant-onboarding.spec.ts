import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  E2E_TENANT_EMAIL,
  E2E_TENANT_ID,
  E2E_TENANT_NAME,
  E2E_TENANT_SLUG,
  createE2EServicesSeed
} from '../apps/web/lib/e2e-test-data';

const TENANT_CONTACT_PHONE = '+447000000000';
type ServiceSeed = ReturnType<typeof createE2EServicesSeed>[number];

async function stubExternalVendors(page: Page) {
  await page.route('https://api.stripe.com/**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ id: 'pi_test_123', status: 'succeeded' }) })
  );
  await page.route('https://api.twilio.com/**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ sid: 'tw_test_123', status: 'queued' }) })
  );
  await page.route('https://api.openai.com/**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ id: 'chatcmpl_test', choices: [] }) })
  );
}

test.describe('Tenant onboarding and booking journeys', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'x-e2e-role',
        value: 'admin',
        url: 'http://127.0.0.1:3000',
        path: '/',
        httpOnly: false
      }
    ]);

    await stubExternalVendors(page);

    await page.addInitScript(
      ({ tenantId, servicesSeed, tenantEmail }: { tenantId: string; servicesSeed: ServiceSeed[]; tenantEmail: string }) => {
        const servicesState = servicesSeed.map((service: ServiceSeed) => ({
          ...service
        }));

      const tenantSettings = {
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

      const supabaseMock = {
        auth: {
          async getSession() {
            return {
              data: {
                session: {
                  access_token: 'browser-e2e-token',
                  user: {
                    email: tenantEmail,
                    user_metadata: {
                      tenant_id: tenantId,
                      role: 'admin',
                      timezone: 'Europe/London'
                    }
                  }
                }
              },
              error: null
            };
          }
        },
        from(table: string) {
          if (table === 'services') {
            return {
              async upsert(payload: any[]) {
                payload.forEach((entry) => {
                  const targetId = entry.id ?? `svc-${Math.random().toString(36).slice(2, 8)}`;
                  const existingIndex = servicesState.findIndex((service) => service.id === targetId);
                  const nextRecord = {
                    id: targetId,
                    tenant_id: tenantId,
                    name: entry.name,
                    duration_minutes: entry.duration_minutes ?? entry.durationMinutes,
                    price: entry.price
                  };
                  if (existingIndex >= 0) {
                    servicesState[existingIndex] = nextRecord;
                  } else {
                    servicesState.push(nextRecord);
                  }
                });
                return { data: servicesState, error: null };
              },
              delete() {
                return {
                  async in(_: string, ids: string[]) {
                    ids.forEach((id) => {
                      const index = servicesState.findIndex((service) => service.id === id);
                      if (index >= 0) {
                        servicesState.splice(index, 1);
                      }
                    });
                    return { data: null, error: null };
                  }
                };
              },
              select() {
                return {
                  eq() {
                    return {
                      async order() {
                        return { data: servicesState, error: null };
                      }
                    };
                  }
                };
              }
            };
          }

          if (table === 'tenant_settings') {
            return {
              async upsert(entry: any) {
                Object.assign(tenantSettings, {
                  timezone: entry.timezone,
                  business_hours: entry.business_hours,
                  sms_reminders_enabled: entry.sms_reminders_enabled,
                  email_reminders_enabled: entry.email_reminders_enabled,
                  reminder_lead_time_minutes: entry.reminder_lead_time_minutes,
                  primary_color: entry.primary_color,
                  logo_url: entry.logo_url ?? null
                });
                return { data: tenantSettings, error: null };
              }
            };
          }

          return {
            select() {
              return {
                eq() {
                  return {
                    async order() {
                      return { data: [], error: null };
                    },
                    async maybeSingle() {
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
        },
        storage: {
          from() {
            return {
              async upload() {
                return { data: { path: 'logos/mock.png' }, error: null };
              },
              getPublicUrl(path: string) {
                return { data: { publicUrl: `https://cdn.test/${path}` } };
              }
            };
          }
        }
      };

        (window as unknown as { __supabaseClientOverride: typeof supabaseMock }).__supabaseClientOverride = supabaseMock;
        (window as unknown as { __e2eServicesState: typeof servicesState }).__e2eServicesState = servicesState;
      }, { tenantId: E2E_TENANT_ID, servicesSeed: createE2EServicesSeed(), tenantEmail: E2E_TENANT_EMAIL });
  });

  test('completes signup, configuration, booking confirmation and reminder flow', async ({ page }) => {
    const servicesSeed = createE2EServicesSeed();

    await page.route('**/api/auth/signup', async (route, request) => {
      const payload = await request.postDataJSON();
      expect(payload.tenantName).toBe('E2E Hair Studio');
      expect(payload.email).toBe(E2E_TENANT_EMAIL);
      route.fulfill({ status: 200, body: JSON.stringify({ tenantId: E2E_TENANT_ID }) });
    });

    await page.route('**/api/dashboard/summary', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          upcomingAppointments: 4,
          pendingConfirmations: 1,
          pendingMessages: 2,
          revenueLast30d: 1480,
          pendingDeposits: 1,
          collectedDeposits: 6
        })
      })
    );

    await page.route('**/api/tenants/me', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: E2E_TENANT_ID,
          name: E2E_TENANT_NAME,
          slug: E2E_TENANT_SLUG,
          contactEmail: E2E_TENANT_EMAIL,
          contactPhone: TENANT_CONTACT_PHONE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          settings: {
            defaultDepositType: 'fixed',
            defaultDepositValue: 2000,
            depositsEnabled: true,
            timezone: 'Europe/London',
            locale: 'en-GB',
            cancellationPolicy: '24h notice required.'
          }
        })
      })
    );

    await page.route('**/api/bookings', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ id: 'booking_test', status: 'pending', remindersScheduled: true })
      })
    );

    await page.goto('/auth/signup');
    await page.getByLabel('Salon name').fill(E2E_TENANT_NAME);
    await page.getByLabel('Admin email').fill(E2E_TENANT_EMAIL);
    await page.getByLabel('Admin password').fill('A-secure-passw0rd');
    await page.getByLabel('Contact phone').fill(TENANT_CONTACT_PHONE);
    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.getByRole('button', { name: 'Sign up' }).click()
    ]);

    await expect(page.getByRole('heading', { name: 'Tenant overview' })).toBeVisible();
    await expect(page.getByText('Upcoming appointments')).toBeVisible();
    await expect(page.getByText('£1480.00')).toBeVisible();

    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Tenant settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Add service' }).click();
    const newServiceName = 'Balayage Glow';
    const lastCard = page.locator('.service-card').last();
    await lastCard.getByLabel('Name').fill(newServiceName);
    await lastCard.getByLabel('Duration (minutes)').fill('120');
    await lastCard.getByLabel('Price (£)').fill('110');
    await page.getByRole('spinbutton', { name: 'Reminder lead time (minutes)' }).fill('90');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved successfully.')).toBeVisible();

    const serviceCount = await page.evaluate(() => {
      return (window as unknown as { __e2eServicesState: ReturnType<typeof createE2EServicesSeed> }).__e2eServicesState.length;
    });
    expect(serviceCount).toBeGreaterThan(servicesSeed.length);

    await page.goto(`/book/${E2E_TENANT_SLUG}`);
    await expect(page.getByRole('heading', { name: E2E_TENANT_NAME })).toBeVisible();
    await page.locator('select[name="serviceId"]').selectOption(servicesSeed[0].id);
    const firstSlot = page.locator('.slot-grid .slot').first();
    await firstSlot.waitFor();
    await firstSlot.click();
    await page.getByLabel('Full name').fill('Alex Client');
    await page.getByLabel('Email').fill('alex.client@example.com');
    await page.getByLabel('Phone').fill('+447123123123');
    await page.getByLabel('Notes (optional)').fill('Please add a hydrating treatment.');
    await page.getByRole('button', { name: 'Request appointment' }).click();

    await expect(page.getByRole('heading', { name: 'Booking request received' })).toBeVisible();
    await expect(
      page.getByText('A member of the team will confirm the appointment shortly.')
    ).toBeVisible();
  });

  test('surface payment failure during booking checkout', async ({ page }) => {
    await page.route('**/api/bookings', (route) =>
      route.fulfill({
        status: 402,
        body: JSON.stringify({ error: 'Payment failed: card declined.' })
      })
    );

    await page.goto(`/book/${E2E_TENANT_SLUG}`);
    await page.getByLabel('Full name').fill('Jordan Client');
    await page.getByLabel('Email').fill('jordan.client@example.com');
    const slot = page.locator('.slot-grid .slot').first();
    await slot.waitFor();
    await slot.click();
    await page.getByRole('button', { name: 'Request appointment' }).click();

    await expect(page.getByText('Payment failed: card declined.')).toBeVisible();
  });

  test('communicates over-quota errors when booking volume exceeded', async ({ page }) => {
    await page.route('**/api/bookings', (route) =>
      route.fulfill({ status: 429, body: JSON.stringify({ error: 'Tenant quota exceeded.' }) })
    );

    await page.goto(`/book/${E2E_TENANT_SLUG}`);
    await page.getByLabel('Full name').fill('Taylor Client');
    await page.getByLabel('Email').fill('taylor.client@example.com');
    const quotaSlot = page.locator('.slot-grid .slot').first();
    await quotaSlot.waitFor();
    await quotaSlot.click();
    await page.getByRole('button', { name: 'Request appointment' }).click();

    await expect(page.getByText('Tenant quota exceeded.')).toBeVisible();
  });

  test('blocks non-admin access to privileged settings areas', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'x-e2e-role',
        value: 'stylist',
        url: 'http://127.0.0.1:3000',
        path: '/' ,
        httpOnly: false
      }
    ]);

    await page.goto('/admin/settings');
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
