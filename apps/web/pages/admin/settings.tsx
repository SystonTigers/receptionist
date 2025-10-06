import { useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTenant } from '@/hooks/useTenant';
import { createSupabaseServerClient } from '@/lib/supabase-server-client';
import { DEFAULT_TIMEZONE } from '@ai-hairdresser/shared';

type ServiceFormValue = {
  id?: string;
  name: string;
  durationMinutes: number;
  price: number;
};

type BusinessHourFormValue = {
  weekday: number;
  openTime: string;
  closeTime: string;
  closed: boolean;
};

type TenantSettingsFormValues = {
  services: ServiceFormValue[];
  businessHours: BusinessHourFormValue[];
  timezone: string;
  smsRemindersEnabled: boolean;
  emailRemindersEnabled: boolean;
  reminderLeadTimeMinutes: number;
  primaryColor: string;
  logoUrl: string | null;
};

type TenantSettingsPageProps = {
  tenantId: string;
  initialValues: TenantSettingsFormValues;
};

const TIME_REGEX = /^\d{2}:\d{2}$/;

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Service name is required'),
  durationMinutes: z.coerce
    .number({ invalid_type_error: 'Duration is required' })
    .int('Duration must be a whole number of minutes')
    .min(5, 'Minimum duration is 5 minutes')
    .max(480, 'Duration cannot exceed 480 minutes'),
  price: z.coerce
    .number({ invalid_type_error: 'Price is required' })
    .min(0, 'Price cannot be negative')
});

const businessHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    openTime: z.string().regex(TIME_REGEX, 'Use HH:mm format'),
    closeTime: z.string().regex(TIME_REGEX, 'Use HH:mm format'),
    closed: z.boolean()
  })
  .superRefine((value, ctx) => {
    if (!value.closed) {
      if (value.openTime >= value.closeTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Close time must be after open time',
          path: ['closeTime']
        });
      }
    }
  });

const tenantSettingsSchema = z.object({
  services: z.array(serviceSchema),
  businessHours: z
    .array(businessHourSchema)
    .length(7, 'All 7 days must have hours configured'),
  timezone: z.string().min(1, 'Timezone is required'),
  smsRemindersEnabled: z.boolean(),
  emailRemindersEnabled: z.boolean(),
  reminderLeadTimeMinutes: z.coerce
    .number({ invalid_type_error: 'Reminder lead time is required' })
    .int('Reminder lead time must be a whole number of minutes')
    .min(0, 'Reminder lead time cannot be negative')
    .max(1440, 'Reminder lead time cannot exceed 24 hours'),
  primaryColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/i, 'Use a valid hex colour'),
  logoUrl: z.string().url().nullable().optional()
});

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Denver',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney'
];

const STORAGE_BUCKET = 'salon-assets';

function getDefaultBusinessHours(): BusinessHourFormValue[] {
  return WEEKDAY_LABELS.map((_, index) => ({
    weekday: index,
    openTime: '09:00',
    closeTime: '17:00',
    closed: index === 0 || index === 6
  }));
}

function normaliseTimeString(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  if (TIME_REGEX.test(value)) {
    return value;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.slice(0, 5);
  }
  return fallback;
}

function getTimezoneOptions(): string[] {
  const intlWithSupport = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  if (typeof intlWithSupport.supportedValuesOf === 'function') {
    try {
      const values = intlWithSupport.supportedValuesOf('timeZone');
      if (Array.isArray(values) && values.length > 0) {
        return values;
      }
    } catch (error) {
      console.warn('Unable to load dynamic timezones, using fallback', error);
    }
  }

  return FALLBACK_TIMEZONES;
}

export default function AdminSettingsPage({ tenantId, initialValues }: TenantSettingsPageProps) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { tenant } = useTenant();
  const servicesToDelete = useRef<string[]>([]);
  const [timezoneOptions] = useState<string[]>(() => getTimezoneOptions());
  const [logoUploading, setLogoUploading] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    reset,
    setValue
  } = useForm<TenantSettingsFormValues>({
    resolver: zodResolver(tenantSettingsSchema),
    defaultValues: initialValues
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'services'
  });

  const businessHours = watch('businessHours');
  const logoUrl = watch('logoUrl');

  const handleRemoveService = (index: number) => {
    const service = fields[index];
    if (service?.id) {
      if (!servicesToDelete.current.includes(service.id)) {
        servicesToDelete.current.push(service.id);
      }
    }
    remove(index);
  };

  const handleLogoChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFormMessage(null);
    setLogoUploading(true);

    try {
      const extension = file.name.split('.').pop() ?? 'png';
      const path = `logos/${tenantId}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'image/png'
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl }
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

      setValue('logoUrl', publicUrl, { shouldDirty: true });
      setFormMessage({ type: 'success', message: 'Logo uploaded successfully.' });
    } catch (error) {
      console.error('Failed to upload logo', error);
      setFormMessage({ type: 'error', message: 'Failed to upload logo. Please try again.' });
    } finally {
      setLogoUploading(false);
      event.target.value = '';
    }
  };

  const onSubmit = handleSubmit(async (rawValues) => {
    setFormMessage(null);
    const parsed = tenantSettingsSchema.safeParse(rawValues);

    if (!parsed.success) {
      setFormMessage({ type: 'error', message: 'Please correct the highlighted fields.' });
      return;
    }

    try {
      const values = parsed.data;

      const { error: settingsError } = await supabase.from('tenant_settings').upsert(
        {
          tenant_id: tenantId,
          timezone: values.timezone,
          business_hours: values.businessHours,
          sms_reminders_enabled: values.smsRemindersEnabled,
          email_reminders_enabled: values.emailRemindersEnabled,
          reminder_lead_time_minutes: values.reminderLeadTimeMinutes,
          primary_color: values.primaryColor,
          logo_url: values.logoUrl,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'tenant_id' }
      );

      if (settingsError) {
        throw settingsError;
      }

      if (servicesToDelete.current.length > 0) {
        const { error: deleteError } = await supabase
          .from('services')
          .delete()
          .in('id', servicesToDelete.current);

        if (deleteError) {
          throw deleteError;
        }

        servicesToDelete.current = [];
      }

      const servicePayload = values.services.map((service) => ({
        ...(service.id ? { id: service.id } : {}),
        tenant_id: tenantId,
        name: service.name,
        duration_minutes: service.durationMinutes,
        price: service.price
      }));

      if (servicePayload.length > 0) {
        const { error: serviceUpsertError } = await supabase
          .from('services')
          .upsert(servicePayload, { onConflict: 'id' });

        if (serviceUpsertError) {
          throw serviceUpsertError;
        }
      }

      const { data: refreshedServices, error: refreshError } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      if (refreshError) {
        throw refreshError;
      }

      const nextValues: TenantSettingsFormValues = {
        ...values,
        services: (refreshedServices ?? []).map((service) => ({
          id: service.id,
          name: service.name ?? '',
          durationMinutes: service.duration_minutes ?? 30,
          price: service.price ?? 0
        }))
      };

      reset(nextValues);
      setFormMessage({ type: 'success', message: 'Settings saved successfully.' });
    } catch (error) {
      console.error('Failed to save settings', error);
      setFormMessage({ type: 'error', message: 'Failed to save settings. Please try again.' });
    }
  });

  return (
    <>
      <Head>
        <title>Tenant Settings | AI Hairdresser Receptionist</title>
      </Head>
      <main className="settings">
        <header>
          <div>
            <h1>Tenant settings</h1>
            <p>Manage services and preferences for {tenant?.name ?? 'your salon'}.</p>
          </div>
          <button className="primary" type="button" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save settings'}
          </button>
        </header>

        {formMessage && (
          <p className={`message ${formMessage.type}`}>{formMessage.message}</p>
        )}

        <form className="form" onSubmit={onSubmit}>
          <section>
            <h2>Services</h2>
            <p className="section-hint">Create, update or remove the services your salon offers.</p>
            <div className="services-grid">
              {fields.length === 0 && <p className="empty">No services yet. Add your first service below.</p>}
              {fields.map((field, index) => (
                <div key={field.id} className="service-card">
                  <div className="service-row">
                    <label>
                      <span>Name</span>
                      <input type="text" {...register(`services.${index}.name` as const)} />
                      {errors.services?.[index]?.name && (
                        <p className="field-error">{errors.services?.[index]?.name?.message}</p>
                      )}
                    </label>
                    <label>
                      <span>Duration (minutes)</span>
                      <input type="number" min={5} {...register(`services.${index}.durationMinutes` as const)} />
                      {errors.services?.[index]?.durationMinutes && (
                        <p className="field-error">{errors.services?.[index]?.durationMinutes?.message}</p>
                      )}
                    </label>
                    <label>
                      <span>Price (£)</span>
                      <input type="number" min={0} step="0.01" {...register(`services.${index}.price` as const)} />
                      {errors.services?.[index]?.price && (
                        <p className="field-error">{errors.services?.[index]?.price?.message}</p>
                      )}
                    </label>
                  </div>
                  <div className="service-actions">
                    <button type="button" className="danger" onClick={() => handleRemoveService(index)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                append({
                  name: '',
                  durationMinutes: 30,
                  price: 0
                })
              }
            >
              Add service
            </button>
          </section>

          <section>
            <h2>Business hours</h2>
            <p className="section-hint">Set the weekly operating hours for your salon.</p>
            <div className="hours-grid">
              {businessHours?.map((hour, index) => (
                <div key={hour.weekday} className="hours-row">
                  <div className="day-label">{WEEKDAY_LABELS[hour.weekday]}</div>
                  <label>
                    <span>Open</span>
                    <input
                      type="time"
                      {...register(`businessHours.${index}.openTime` as const)}
                      disabled={hour.closed}
                    />
                    {errors.businessHours?.[index]?.openTime && (
                      <p className="field-error">{errors.businessHours?.[index]?.openTime?.message}</p>
                    )}
                  </label>
                  <label>
                    <span>Close</span>
                    <input
                      type="time"
                      {...register(`businessHours.${index}.closeTime` as const)}
                      disabled={hour.closed}
                    />
                    {errors.businessHours?.[index]?.closeTime && (
                      <p className="field-error">{errors.businessHours?.[index]?.closeTime?.message}</p>
                    )}
                  </label>
                  <label className="closed-toggle">
                    <input type="checkbox" {...register(`businessHours.${index}.closed` as const)} />
                    <span>Closed</span>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>Preferences</h2>
            <p className="section-hint">Timezone, reminders and branding.</p>
            <div className="preferences-grid">
              <label>
                <span>Timezone</span>
                <select {...register('timezone')}>
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                {errors.timezone && <p className="field-error">{errors.timezone.message}</p>}
              </label>
              <label>
                <span>Reminder lead time (minutes)</span>
                <input type="number" min={0} max={1440} {...register('reminderLeadTimeMinutes')} />
                {errors.reminderLeadTimeMinutes && (
                  <p className="field-error">{errors.reminderLeadTimeMinutes.message}</p>
                )}
              </label>
              <fieldset>
                <legend>Reminder channels</legend>
                <label className="checkbox">
                  <input type="checkbox" {...register('smsRemindersEnabled')} />
                  <span>SMS reminders</span>
                </label>
                <label className="checkbox">
                  <input type="checkbox" {...register('emailRemindersEnabled')} />
                  <span>Email reminders</span>
                </label>
                {(errors.smsRemindersEnabled || errors.emailRemindersEnabled) && (
                  <p className="field-error">Select which reminders you want to send.</p>
                )}
              </fieldset>
              <label>
                <span>Primary colour</span>
                <input type="color" {...register('primaryColor')} />
                {errors.primaryColor && <p className="field-error">{errors.primaryColor.message}</p>}
              </label>
              <div className="logo-upload">
                <span>Salon logo</span>
                {logoUrl ? (
                  <div className="logo-preview">
                    <img src={logoUrl} alt="Salon logo" />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setValue('logoUrl', null, { shouldDirty: true })}
                    >
                      Remove logo
                    </button>
                  </div>
                ) : (
                  <label className="upload-button">
                    <input type="file" accept="image/*" onChange={handleLogoChange} disabled={logoUploading} />
                    <span>{logoUploading ? 'Uploading…' : 'Upload logo'}</span>
                  </label>
                )}
                {errors.logoUrl && <p className="field-error">{errors.logoUrl.message}</p>}
              </div>
            </div>
          </section>

          <footer className="form-footer">
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save settings'}
            </button>
          </footer>
        </form>
      </main>
      <style jsx>{`
        .settings {
          padding: 2rem;
          display: grid;
          gap: 2rem;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }
        header h1 {
          margin: 0;
        }
        header p {
          margin: 0.4rem 0 0;
          color: #475569;
        }
        .form {
          display: grid;
          gap: 2.5rem;
        }
        section {
          background: white;
          padding: 1.75rem;
          border-radius: 12px;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
          display: grid;
          gap: 1.5rem;
        }
        section h2 {
          margin: 0;
        }
        .section-hint {
          margin: 0;
          color: #64748b;
        }
        .services-grid {
          display: grid;
          gap: 1rem;
        }
        .service-card {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 1rem;
          display: grid;
          gap: 1rem;
          background: #f8fafc;
        }
        .service-row {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        label {
          display: grid;
          gap: 0.4rem;
          font-weight: 500;
        }
        label span,
        legend,
        .day-label {
          color: #0f172a;
        }
        input[type='text'],
        input[type='number'],
        input[type='time'],
        select {
          padding: 0.6rem 0.75rem;
          border-radius: 8px;
          border: 1px solid #cbd5f5;
          font-size: 0.95rem;
        }
        input[type='color'] {
          width: 60px;
          height: 40px;
          border: none;
          background: none;
          padding: 0;
        }
        fieldset {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 0.75rem 1rem 1rem;
          display: grid;
          gap: 0.5rem;
        }
        .checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 500;
        }
        .service-actions {
          display: flex;
          justify-content: flex-end;
        }
        .hours-grid {
          display: grid;
          gap: 0.75rem;
        }
        .hours-row {
          display: grid;
          grid-template-columns: 120px repeat(2, minmax(140px, 1fr)) 120px;
          gap: 1rem;
          align-items: center;
        }
        .day-label {
          font-weight: 600;
        }
        .closed-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 500;
        }
        .preferences-grid {
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .logo-upload {
          display: grid;
          gap: 0.75rem;
        }
        .logo-preview {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          align-items: flex-start;
        }
        .logo-preview img {
          max-width: 180px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
        }
        .upload-button {
          border: 1px dashed #94a3b8;
          border-radius: 10px;
          padding: 0.75rem 1.25rem;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          color: #475569;
        }
        .upload-button input[type='file'] {
          display: none;
        }
        .primary,
        .secondary,
        .danger {
          border: none;
          border-radius: 10px;
          padding: 0.6rem 1.2rem;
          font-weight: 600;
          cursor: pointer;
        }
        .primary {
          background: #2563eb;
          color: white;
        }
        .secondary {
          background: white;
          color: #2563eb;
          border: 1px solid #2563eb;
        }
        .danger {
          background: white;
          color: #b91c1c;
          border: 1px solid #b91c1c;
        }
        .primary:disabled,
        .secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .field-error {
          color: #b91c1c;
          font-size: 0.85rem;
          margin: 0;
        }
        .message {
          margin: 0;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          font-weight: 500;
        }
        .message.success {
          background: #dcfce7;
          color: #166534;
        }
        .message.error {
          background: #fee2e2;
          color: #991b1b;
        }
        .empty {
          margin: 0;
          color: #94a3b8;
          font-style: italic;
        }
        .form-footer {
          display: flex;
          justify-content: flex-end;
        }
        @media (max-width: 768px) {
          header {
            flex-direction: column;
            align-items: flex-start;
          }
          .hours-row {
            grid-template-columns: 1fr;
          }
          .service-row {
            grid-template-columns: 1fr;
          }
          .preferences-grid {
            grid-template-columns: 1fr;
          }
          .form-footer {
            justify-content: stretch;
          }
          .form-footer .primary {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<TenantSettingsPageProps> = async (ctx) => {
  const supabase = createSupabaseServerClient(ctx);
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false
      }
    };
  }

  const role = session.user.user_metadata?.role as string | undefined;
  if (role && role !== 'admin') {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false
      }
    };
  }

  const tenantId = session.user.user_metadata?.tenant_id as string | undefined;

  if (!tenantId) {
    return {
      notFound: true
    };
  }

  const { data: servicesData } = await supabase
    .from('services')
    .select('id, name, duration_minutes, price')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  const defaultHours = getDefaultBusinessHours();

  const { data: settingsData } = await supabase
    .from('tenant_settings')
    .select(
      'timezone, business_hours, sms_reminders_enabled, email_reminders_enabled, reminder_lead_time_minutes, primary_color, logo_url'
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const timezone =
    settingsData?.timezone ??
    (session.user.user_metadata?.timezone as string | undefined) ??
    DEFAULT_TIMEZONE;

  const rawBusinessHours = Array.isArray(settingsData?.business_hours)
    ? (settingsData.business_hours as Array<Record<string, unknown>>)
    : [];

  const businessHours = defaultHours.map((defaultHour) => {
    const match = rawBusinessHours.find((entry) => {
      const weekdayCandidate = [
        entry['weekday'],
        entry['day'],
        entry['dayOfWeek'],
        entry['day_of_week']
      ].find((value) => typeof value === 'number') as number | undefined;
      return weekdayCandidate === defaultHour.weekday;
    });

    if (!match) {
      return defaultHour;
    }

    const openTimeCandidate = [match['openTime'], match['open_time'], match['start']].find(
      (value) => typeof value === 'string'
    ) as string | undefined;

    const closeTimeCandidate = [match['closeTime'], match['close_time'], match['end']].find(
      (value) => typeof value === 'string'
    ) as string | undefined;

    const closedCandidate = [match['closed'], match['is_closed']].find(
      (value) => typeof value === 'boolean'
    ) as boolean | undefined;

    return {
      weekday: defaultHour.weekday,
      openTime: normaliseTimeString(openTimeCandidate, defaultHour.openTime),
      closeTime: normaliseTimeString(closeTimeCandidate, defaultHour.closeTime),
      closed: closedCandidate ?? defaultHour.closed
    } satisfies BusinessHourFormValue;
  });

  const initialValues: TenantSettingsFormValues = {
    services: (servicesData ?? []).map((service) => ({
      id: service.id,
      name: service.name ?? '',
      durationMinutes: service.duration_minutes ?? 30,
      price: service.price ?? 0
    })),
    businessHours,
    timezone,
    smsRemindersEnabled: Boolean(settingsData?.sms_reminders_enabled ?? false),
    emailRemindersEnabled: Boolean(settingsData?.email_reminders_enabled ?? false),
    reminderLeadTimeMinutes: settingsData?.reminder_lead_time_minutes ?? 60,
    primaryColor: settingsData?.primary_color ?? '#2563eb',
    logoUrl: settingsData?.logo_url ?? null
  };

  return {
    props: {
      tenantId,
      initialValues
    }
  };
};

