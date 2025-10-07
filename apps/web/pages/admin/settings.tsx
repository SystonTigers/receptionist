import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useTenant } from '@/hooks/useTenant';
import { createSupabaseServerClient } from '@/lib/supabase-server-client';
import type { Role } from '@ai-hairdresser/shared';
import { DEFAULT_TIMEZONE } from '@ai-hairdresser/shared';
import { logAuditEvent } from '@/lib/audit-log-client';
import { useTenantUsers } from '@/hooks/useTenantUsers';

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

const ROLE_OPTIONS: Role[] = ['owner', 'admin', 'staff', 'viewer'];

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

function cloneSettings(value: TenantSettingsFormValues): TenantSettingsFormValues {
  return JSON.parse(JSON.stringify(value)) as TenantSettingsFormValues;
}

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
  const lastSavedValues = useRef<TenantSettingsFormValues>(cloneSettings(initialValues));

  useEffect(() => {
    lastSavedValues.current = cloneSettings(initialValues);
  }, [initialValues]);
  const { users: teamUsers, invitations, loading: usersLoading, error: usersError, mutate: mutateTenantUsers } =
    useTenantUsers();
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('staff');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [teamMessage, setTeamMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [roleUpdatingUser, setRoleUpdatingUser] = useState<string | null>(null);
  const [removingInvitation, setRemovingInvitation] = useState<string | null>(null);
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = (data.user?.user_metadata?.role as Role | undefined) ?? null;
      setCurrentUserRole(role);
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    if (!copiedInvitationId) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const timer = window.setTimeout(() => setCopiedInvitationId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copiedInvitationId]);

  const pendingInvitations = useMemo(
    () => invitations.filter((invite) => invite.status === 'pending'),
    [invitations]
  );

  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin';
  const canEditRoles = currentUserRole === 'owner';
  const inviteRoleOptions = canEditRoles ? ROLE_OPTIONS : ROLE_OPTIONS.filter((role) => role !== 'owner');

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

  const handleInviteSubmit = async () => {
    if (!canInvite) {
      setInviteStatus({ type: 'error', message: 'You do not have permission to invite users.' });
      return;
    }

    const normalisedEmail = inviteEmail.trim().toLowerCase();
    if (!normalisedEmail) {
      setInviteStatus({ type: 'error', message: 'Enter an email address.' });
      return;
    }

    setInviteStatus(null);
    setTeamMessage(null);
    setInviteSubmitting(true);

    try {
      const response = await fetch('/api/tenants/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: normalisedEmail, role: inviteRole })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? 'Failed to send invitation');
      }

      setInviteStatus({ type: 'success', message: 'Invitation sent successfully.' });
      setInviteEmail('');
      await mutateTenantUsers();
    } catch (error) {
      console.error('Invite create error', error);
      setInviteStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send invitation.'
      });
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: Role) => {
    const existing = teamUsers.find((user) => user.id === userId);
    if (existing?.role === role) {
      return;
    }

    setTeamMessage(null);
    setRoleUpdatingUser(userId);

    try {
      const response = await fetch(`/api/tenants/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? 'Failed to update role');
      }

      setTeamMessage({ type: 'success', message: 'Role updated successfully.' });
      await mutateTenantUsers();
    } catch (error) {
      console.error('Role update error', error);
      setTeamMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update role.'
      });
    } finally {
      setRoleUpdatingUser(null);
    }
  };

  const handleRemoveInvitation = async (invitationId: string) => {
    setTeamMessage(null);
    setRemovingInvitation(invitationId);

    try {
      const response = await fetch(`/api/tenants/invitations/${invitationId}`, {
        method: 'DELETE'
      });

      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? 'Failed to remove invitation');
      }

      setTeamMessage({ type: 'success', message: 'Invitation removed.' });
      await mutateTenantUsers();
    } catch (error) {
      console.error('Invitation delete error', error);
      setTeamMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to remove invitation.'
      });
    } finally {
      setRemovingInvitation(null);
    }
  };

  const handleCopyInvitationLink = async (invitationId: string, token: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    const acceptUrl = `${window.location.origin}/auth/accept-invite?token=${token}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(acceptUrl);
        setCopiedInvitationId(invitationId);
        setTeamMessage({ type: 'success', message: 'Invite link copied to clipboard.' });
      } else {
        throw new Error('Clipboard access unavailable');
      }
    } catch (error) {
      console.error('Copy invite link failed', error);
      setTeamMessage({
        type: 'error',
        message: `Copy this link manually: ${acceptUrl}`
      });
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
      const beforeSnapshot = cloneSettings(lastSavedValues.current);

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

      await logAuditEvent({
        action: 'settings.updated',
        resource: 'tenant_settings',
        resourceId: tenantId,
        before: beforeSnapshot,
        after: nextValues
      });

      lastSavedValues.current = cloneSettings(nextValues);
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

          <section>
            <h2>Team access</h2>
            <p className="section-hint">Invite colleagues and control their access to the receptionist dashboard.</p>

            {teamMessage && <p className={`message ${teamMessage.type}`}>{teamMessage.message}</p>}
            {inviteStatus && <p className={`message ${inviteStatus.type}`}>{inviteStatus.message}</p>}
            {usersError && <p className="message error">Unable to load team members.</p>}

            <div className="team-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Team member</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={3}>Loading team…</td>
                    </tr>
                  ) : teamUsers.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No team members yet.</td>
                    </tr>
                  ) : (
                    teamUsers.map((user) => {
                      const disabled = !canEditRoles || user.id === currentUserId;
                      return (
                        <tr key={user.id}>
                          <td>
                            <div className="team-name">
                              <strong>{`${user.firstName} ${user.lastName}`.trim() || user.email}</strong>
                              {user.id === currentUserId && <span className="badge">You</span>}
                            </div>
                          </td>
                          <td>{user.email}</td>
                          <td>
                            {disabled ? (
                              <span className="role-pill">{user.role}</span>
                            ) : (
                              <select
                                value={user.role}
                                disabled={roleUpdatingUser === user.id}
                                onChange={(event) => handleRoleChange(user.id, event.target.value as Role)}
                              >
                                {ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>
                                    {role.charAt(0).toUpperCase() + role.slice(1)}
                                  </option>
                                ))}
                              </select>
                            )}
                            {roleUpdatingUser === user.id && <span className="pending">Updating…</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="invite-area">
              <h3>Invite a teammate</h3>
              {canInvite ? (
                <div className="invite-form">
                  <label>
                    <span>Email address</span>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="team@salon.com"
                    />
                  </label>
                  <label>
                    <span>Role</span>
                    <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
                      {inviteRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="secondary" onClick={handleInviteSubmit} disabled={inviteSubmitting}>
                    {inviteSubmitting ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              ) : (
                <p className="hint">Only owners or admins can invite new users.</p>
              )}
            </div>

            <div className="invite-list">
              <h3>Pending invitations</h3>
              {pendingInvitations.length === 0 ? (
                <p className="empty">No pending invitations.</p>
              ) : (
                <ul>
                  {pendingInvitations.map((invite) => (
                    <li key={invite.id}>
                      <div>
                        <strong>{invite.email}</strong>
                        <span className="role-pill">{invite.role}</span>
                      </div>
                      <div className="invite-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleCopyInvitationLink(invite.id, invite.token)}
                        >
                          {copiedInvitationId === invite.id ? 'Copied!' : 'Copy invite link'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleRemoveInvitation(invite.id)}
                          disabled={removingInvitation === invite.id}
                        >
                          {removingInvitation === invite.id ? 'Removing…' : 'Revoke'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
        .team-table {
          margin-top: 1rem;
          overflow-x: auto;
        }
        .team-table table {
          width: 100%;
          border-collapse: collapse;
          min-width: 480px;
        }
        .team-table th,
        .team-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        .team-name {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .badge {
          background: #e0f2fe;
          color: #0369a1;
          border-radius: 999px;
          padding: 0.1rem 0.5rem;
          font-size: 0.75rem;
        }
        .role-pill {
          display: inline-block;
          background: #f1f5f9;
          border-radius: 999px;
          padding: 0.25rem 0.75rem;
          text-transform: capitalize;
        }
        .pending {
          display: inline-block;
          margin-left: 0.75rem;
          font-size: 0.85rem;
          color: #64748b;
        }
        .invite-area {
          margin-top: 1.5rem;
        }
        .invite-form {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: flex-end;
        }
        .invite-form label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 220px;
        }
        .invite-list {
          margin-top: 1.5rem;
        }
        .invite-list ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.75rem;
        }
        .invite-list li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .invite-list li > div:first-of-type {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .invite-actions {
          display: flex;
          gap: 0.5rem;
        }
        .hint {
          color: #64748b;
          margin: 0.5rem 0 0;
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
          .invite-form {
            flex-direction: column;
            align-items: stretch;
          }
          .invite-list li {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
          .invite-actions {
            width: 100%;
            justify-content: flex-start;
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
  if (role && !['owner', 'admin'].includes(role)) {
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

