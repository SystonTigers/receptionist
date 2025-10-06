import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import dayjs from 'dayjs';
import clsx from 'clsx';

type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number | null;
};

type Branding = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  logoUrl: string | null;
};

type BookingConfig = {
  startHour: number;
  endHour: number;
  intervalMinutes: number;
  daysToShow: number;
  timezone: string;
};

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  branding: Branding;
  bookingConfig: BookingConfig;
};

type BookingPageProps = {
  tenant: TenantInfo;
  services: ServiceOption[];
};

type BookingState = 'idle' | 'submitting' | 'success' | 'error';

type UpcomingDay = {
  label: string;
  iso: string;
  weekday: string;
  date: string;
};

const DEFAULT_BRANDING: Branding = {
  primaryColor: '#1f2937',
  accentColor: '#f97316',
  backgroundColor: '#f8fafc',
  textColor: '#111827',
  logoUrl: null
};

const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  startHour: 9,
  endHour: 17,
  intervalMinutes: 30,
  daysToShow: 14,
  timezone: 'Europe/London'
};

function normalizeBranding(settings: Record<string, unknown> | null | undefined): Branding {
  const branding = (settings?.branding ?? {}) as Record<string, string | undefined>;
  return {
    primaryColor: branding.primaryColor ?? DEFAULT_BRANDING.primaryColor,
    accentColor: branding.accentColor ?? DEFAULT_BRANDING.accentColor,
    backgroundColor: branding.backgroundColor ?? DEFAULT_BRANDING.backgroundColor,
    textColor: branding.textColor ?? DEFAULT_BRANDING.textColor,
    logoUrl: branding.logoUrl ?? null
  };
}

function normalizeBookingConfig(settings: Record<string, unknown> | null | undefined): BookingConfig {
  const booking = (settings?.booking ?? {}) as Record<string, unknown>;
  return {
    startHour: typeof booking.startHour === 'number' ? booking.startHour : DEFAULT_BOOKING_CONFIG.startHour,
    endHour: typeof booking.endHour === 'number' ? booking.endHour : DEFAULT_BOOKING_CONFIG.endHour,
    intervalMinutes:
      typeof booking.intervalMinutes === 'number' ? booking.intervalMinutes : DEFAULT_BOOKING_CONFIG.intervalMinutes,
    daysToShow:
      typeof booking.daysToShow === 'number' ? booking.daysToShow : DEFAULT_BOOKING_CONFIG.daysToShow,
    timezone: typeof booking.timezone === 'string' ? booking.timezone : DEFAULT_BOOKING_CONFIG.timezone
  };
}

function generateUpcomingDays(daysToShow: number): UpcomingDay[] {
  return Array.from({ length: Math.max(daysToShow, 1) }, (_, index) => {
    const date = dayjs().add(index, 'day');
    return {
      label: date.format('ddd D MMM'),
      iso: date.format('YYYY-MM-DD'),
      weekday: date.format('ddd'),
      date: date.format('D MMM')
    };
  });
}

function generateTimeSlots(isoDate: string, config: BookingConfig, durationMinutes: number): string[] {
  const date = dayjs(isoDate);
  const start = date.hour(config.startHour).minute(0).second(0);
  const end = date.hour(config.endHour).minute(0).second(0);
  const interval = Math.max(config.intervalMinutes, 10);
  const slots: string[] = [];

  for (let cursor = start; cursor.isBefore(end); cursor = cursor.add(interval, 'minute')) {
    const slotEnd = cursor.add(durationMinutes, 'minute');
    if (slotEnd.isAfter(end)) {
      break;
    }
    slots.push(cursor.format('HH:mm'));
  }

  return slots;
}

export default function PublicBookingPage({ tenant, services }: BookingPageProps) {
  const themeStyles = {
    '--brand-primary': tenant.branding.primaryColor,
    '--brand-accent': tenant.branding.accentColor,
    '--brand-background': tenant.branding.backgroundColor,
    '--brand-text': tenant.branding.textColor
  } as CSSProperties;

  const [bookingState, setBookingState] = useState<BookingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const upcomingDays = useMemo(() => generateUpcomingDays(tenant.bookingConfig.daysToShow), [tenant.bookingConfig.daysToShow]);
  const [selectedDateIso, setSelectedDateIso] = useState<string>(upcomingDays[0]?.iso ?? dayjs().format('YYYY-MM-DD'));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id ?? '');

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? services[0] ?? null,
    [selectedServiceId, services]
  );

  const slotOptions = useMemo(() => {
    if (!selectedService) {
      return [];
    }
    return generateTimeSlots(selectedDateIso, tenant.bookingConfig, selectedService.durationMinutes || 30);
  }, [selectedService, selectedDateIso, tenant.bookingConfig]);

  const isSubmitting = bookingState === 'submitting';
  const hasSubmitted = bookingState === 'success';

  const priceFormatter = useMemo(
    () => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
    []
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedService) {
      setErrorMessage('Select a service to continue.');
      return;
    }
    if (!selectedSlot) {
      setErrorMessage('Select a time slot to continue.');
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const clientName = (formData.get('clientName') ?? '').toString().trim();
    const clientEmail = (formData.get('clientEmail') ?? '').toString().trim();
    const clientPhone = (formData.get('clientPhone') ?? '').toString().trim();
    const notes = (formData.get('notes') ?? '').toString().trim();

    if (!clientName) {
      setErrorMessage('Please provide your name.');
      return;
    }

    if (!clientEmail && !clientPhone) {
      setErrorMessage('Please provide either an email address or phone number.');
      return;
    }

    const startDateTime = dayjs(`${selectedDateIso}T${selectedSlot}`);
    if (!startDateTime.isValid()) {
      setErrorMessage('Invalid time slot selected.');
      return;
    }

    const endDateTime = startDateTime.add(selectedService.durationMinutes || 30, 'minute');

    setBookingState('submitting');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: tenant.slug,
          clientName,
          clientEmail,
          clientPhone,
          serviceId: selectedService.id,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          timezone: tenant.bookingConfig.timezone,
          notes: notes || undefined
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload && payload.error) || 'Unable to submit booking');
      }

      setBookingState('success');
      setSelectedSlot(null);
      form.reset();
    } catch (error) {
      setBookingState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit booking');
    }
  };

  return (
    <div className="booking-page" style={themeStyles}>
      <Head>
        <title>{tenant.name} | Book an appointment</title>
        <meta name="description" content={`Book an appointment with ${tenant.name}`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="booking-card">
        <header className="booking-header">
          {tenant.branding.logoUrl ? (
            <img src={tenant.branding.logoUrl} alt={`${tenant.name} logo`} className="booking-logo" />
          ) : (
            <span className="booking-initials">{tenant.name.charAt(0)}</span>
          )}
          <div>
            <h1>{tenant.name}</h1>
            <p>Book your next visit in a few taps.</p>
          </div>
        </header>

        {hasSubmitted ? (
          <section className="confirmation">
            <h2>Booking request received</h2>
            <p>
              Thank you, we&apos;ve sent your request to {tenant.name}. A member of the team will confirm the
              appointment shortly.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setBookingState('idle');
                setSelectedSlot(null);
                setSelectedDateIso(upcomingDays[0]?.iso ?? dayjs().format('YYYY-MM-DD'));
              }}
            >
              Make another booking
            </button>
          </section>
        ) : (
          <form className="booking-form" onSubmit={handleSubmit}>
            <section>
              <h2>Select a service</h2>
              {services.length === 0 ? (
                <p className="empty">This tenant has no services available.</p>
              ) : (
                <select
                  name="serviceId"
                  value={selectedService?.id ?? ''}
                  onChange={(event) => {
                    setSelectedServiceId(event.target.value);
                    setSelectedSlot(null);
                    setErrorMessage(null);
                  }}
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.price !== null ? ` — ${priceFormatter.format(Number(service.price))}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </section>

            <section>
              <h2>Choose a day</h2>
              <div className="day-selector" role="list">
                {upcomingDays.map((day) => (
                  <button
                    key={day.iso}
                    type="button"
                    role="listitem"
                    className={clsx('day-button', { selected: day.iso === selectedDateIso })}
                    onClick={() => {
                      setSelectedDateIso(day.iso);
                      setSelectedSlot(null);
                      setErrorMessage(null);
                    }}
                  >
                    <span className="day-weekday">{day.weekday}</span>
                    <span className="day-date">{day.date}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Pick a time</h2>
              {slotOptions.length === 0 ? (
                <p className="empty">No time slots available. Try another day or service.</p>
              ) : (
                <div className="slot-grid">
                  {slotOptions.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={clsx('slot', { selected: slot === selectedSlot })}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setErrorMessage(null);
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2>Your details</h2>
              <label>
                Full name
                <input name="clientName" type="text" placeholder="Jane Doe" required />
              </label>
              <div className="contact-row">
                <label>
                  Email
                  <input name="clientEmail" type="email" placeholder="you@example.com" />
                </label>
                <label>
                  Phone
                  <input name="clientPhone" type="tel" placeholder="07123 456789" />
                </label>
              </div>
              <label>
                Notes (optional)
                <textarea name="notes" rows={3} placeholder="Anything we should know?" />
              </label>
            </section>

            {errorMessage && <p className="error" role="alert">{errorMessage}</p>}

            <button type="submit" className="primary" disabled={isSubmitting || services.length === 0}>
              {isSubmitting ? 'Sending request…' : 'Request appointment'}
            </button>
          </form>
        )}
      </main>
      <style jsx>{`
        .booking-page {
          min-height: 100vh;
          background: var(--brand-background);
          display: flex;
          justify-content: center;
          padding: 2rem 1.5rem;
          color: var(--brand-text);
        }
        .booking-card {
          width: 100%;
          max-width: 720px;
          background: #ffffff;
          border-radius: 24px;
          padding: 2rem;
          box-shadow: 0 20px 60px rgba(15, 23, 42, 0.15);
        }
        .booking-header {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          margin-bottom: 2rem;
        }
        .booking-logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
        }
        .booking-initials {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: var(--brand-primary);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1.5rem;
        }
        h1 {
          margin: 0;
          font-size: 1.8rem;
        }
        h2 {
          margin: 0 0 0.75rem;
          font-size: 1.1rem;
        }
        p {
          margin: 0;
          color: #475569;
        }
        .booking-form section {
          margin-bottom: 1.75rem;
        }
        select,
        input,
        textarea {
          width: 100%;
          border-radius: 12px;
          border: 1px solid #cbd5f5;
          padding: 0.75rem;
          font-size: 1rem;
          margin-top: 0.5rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        select:focus,
        input:focus,
        textarea:focus {
          outline: none;
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
        }
        .contact-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        .day-selector {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
          margin-bottom: -0.5rem;
        }
        .day-selector::-webkit-scrollbar {
          display: none;
        }
        .day-button {
          min-width: 90px;
          padding: 0.75rem 0.5rem;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          background: #ffffff;
          color: #0f172a;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
        }
        .day-button.selected {
          border-color: var(--brand-primary);
          background: var(--brand-primary);
          color: #ffffff;
        }
        .day-weekday {
          font-weight: 600;
        }
        .slot-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          gap: 0.75rem;
        }
        .slot {
          padding: 0.75rem 0.5rem;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          background: #ffffff;
          font-weight: 500;
        }
        .slot.selected {
          border-color: var(--brand-primary);
          background: var(--brand-primary);
          color: #ffffff;
        }
        .primary {
          background: var(--brand-primary);
          color: #ffffff;
          border: none;
          border-radius: 999px;
          padding: 0.85rem 1.5rem;
          font-size: 1rem;
          font-weight: 600;
          width: 100%;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .primary:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px rgba(79, 70, 229, 0.2);
        }
        .error {
          color: #dc2626;
          margin: -0.25rem 0 1rem;
        }
        .empty {
          color: #64748b;
          margin: 0;
        }
        .confirmation {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          text-align: center;
        }
        @media (min-width: 640px) {
          .contact-row {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<BookingPageProps> = async (ctx) => {
  const tenantSlugParam = ctx.params?.tenantSlug;
  const tenantSlug = typeof tenantSlugParam === 'string' ? tenantSlugParam : Array.isArray(tenantSlugParam) ? tenantSlugParam[0] : '';

  if (!tenantSlug) {
    return { notFound: true };
  }

  try {
    ctx.res.setHeader('X-Frame-Options', 'ALLOWALL');
    ctx.res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
  } catch (error) {
    // Ignore header errors in environments that do not support mutation.
  }

  try {
    const { getSupabaseServiceClient } = await import('@/lib/supabase-admin-client');
    const supabase = getSupabaseServiceClient();

    const { data: tenantRecord, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, slug, contact_email, settings')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tenantError) {
      console.error('Failed to fetch tenant for public booking', tenantError);
      return { notFound: true };
    }

    if (!tenantRecord) {
      return { notFound: true };
    }

    const { data: servicesData, error: servicesError } = await supabase
      .from('services')
      .select('id, name, duration_minutes, price')
      .eq('tenant_id', tenantRecord.id)
      .order('name', { ascending: true });

    if (servicesError) {
      console.error('Failed to fetch services for public booking', servicesError);
      return { notFound: true };
    }

    const settings = (tenantRecord.settings ?? {}) as Record<string, unknown>;

    const tenant: TenantInfo = {
      id: tenantRecord.id,
      name: tenantRecord.name,
      slug: tenantRecord.slug,
      contactEmail: tenantRecord.contact_email,
      branding: normalizeBranding(settings),
      bookingConfig: normalizeBookingConfig(settings)
    };

    const services: ServiceOption[] = (servicesData ?? []).map((service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      price: typeof service.price === 'number' ? service.price : service.price === null ? null : Number(service.price)
    }));

    return { props: { tenant, services } };
  } catch (error) {
    console.error('Unexpected error preparing booking page', error);
    return { notFound: true };
  }
};
