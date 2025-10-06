import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api-client';
import { createSupabaseServerClient } from '@/lib/supabase-server-client';

dayjs.extend(isoWeek);

type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

type Booking = {
  id: string;
  clientId: string | null;
  stylistId: string | null;
  serviceId: string | null;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  notes?: string | null;
  clientName?: string;
  stylistName?: string;
  stylistColor?: string | null;
  serviceName?: string;
  isOptimistic?: boolean;
};

type LookupOption = { id: string; name: string; color?: string | null };

type LookupData = {
  clients: LookupOption[];
  stylists: LookupOption[];
  services: LookupOption[];
};

type ApiAppointmentRecord = {
  id: string;
  client_id: string | null;
  stylist_id: string | null;
  service_id: string | null;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  notes?: string | null;
};

type ApiAppointmentResponse =
  | ApiAppointmentRecord
  | { appointment?: ApiAppointmentRecord; data?: ApiAppointmentRecord };

const bookingSchema = z
  .object({
    id: z.string().optional(),
    clientId: z.string().min(1, 'Client is required'),
    stylistId: z.string().min(1, 'Stylist is required'),
    serviceId: z.string().min(1, 'Service is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']),
    notes: z.string().optional()
  })
  .superRefine((value, ctx) => {
    const start = dayjs(value.startTime);
    const end = dayjs(value.endTime);
    if (!start.isValid()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startTime'],
        message: 'Invalid start time'
      });
    }
    if (!end.isValid()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'Invalid end time'
      });
    }
    if (start.isValid() && end.isValid() && !end.isAfter(start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'End time must be after start time'
      });
    }
  });

type BookingFormValues = z.infer<typeof bookingSchema>;

interface BookingDashboardProps {
  initialBookings: Booking[];
  lookups: LookupData;
  range: { start: string; end: string };
  tenantTimezone: string;
  initialError?: string | null;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show'
};

const STATUS_CLASSNAME: Record<BookingStatus, string> = {
  pending: 'status status--pending',
  confirmed: 'status status--confirmed',
  completed: 'status status--completed',
  cancelled: 'status status--cancelled',
  no_show: 'status status--no-show'
};

export default function BookingDashboard({
  initialBookings,
  lookups,
  range,
  tenantTimezone,
  initialError
}: BookingDashboardProps) {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [previousState, setPreviousState] = useState<Booking[] | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBookings(initialBookings);
    setActionError(null);
  }, [initialBookings]);

  const weekStart = useMemo(() => dayjs(range.start), [range.start]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => weekStart.add(idx, 'day')),
    [weekStart]
  );

  const bookingsByDay = useMemo(() => {
    const grouped = new Map<string, Booking[]>();
    weekDays.forEach((day) => {
      grouped.set(day.format('YYYY-MM-DD'), []);
    });
    bookings.forEach((booking) => {
      const key = dayjs(booking.startTime).format('YYYY-MM-DD');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)?.push(booking);
    });
    weekDays.forEach((day) => {
      const key = day.format('YYYY-MM-DD');
      const items = grouped.get(key);
      if (items) {
        items.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
      }
    });
    return grouped;
  }, [bookings, weekDays]);

  const goToWeek = (offset: number) => {
    const nextStart = weekStart.add(offset, 'week').format('YYYY-MM-DD');
    void router.push({ pathname: '/dashboard/bookings', query: { start: nextStart } });
  };

  const openCreateModal = (dayISO?: string) => {
    setEditingBooking(null);
    setDraftDate(dayISO ?? weekStart.format('YYYY-MM-DD'));
    setIsModalOpen(true);
  };

  const openEditModal = (booking: Booking) => {
    setEditingBooking(booking);
    setDraftDate(dayjs(booking.startTime).format('YYYY-MM-DD'));
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingBooking(null);
    setDraftDate(null);
    setActionError(null);
  };

  const submitBooking = async (values: BookingFormValues) => {
    const payload = {
      client_id: values.clientId,
      stylist_id: values.stylistId,
      service_id: values.serviceId,
      start_time: dayjs(values.startTime).toISOString(),
      end_time: dayjs(values.endTime).toISOString(),
      status: values.status,
      notes: values.notes?.trim() ? values.notes : undefined
    };

    const isEditing = Boolean(editingBooking);
    const targetId = editingBooking?.id ?? `optimistic-${Date.now()}`;
    const optimistic: Booking = {
      id: targetId,
      clientId: values.clientId,
      stylistId: values.stylistId,
      serviceId: values.serviceId,
      startTime: payload.start_time,
      endTime: payload.end_time,
      status: values.status,
      notes: payload.notes ?? null,
      clientName: findLookupName(lookups.clients, values.clientId),
      stylistName: findLookupName(lookups.stylists, values.stylistId),
      stylistColor: findLookupColor(lookups.stylists, values.stylistId),
      serviceName: findLookupName(lookups.services, values.serviceId),
      isOptimistic: true
    };

    const snapshot = bookings.map((booking) => ({ ...booking }));
    setPreviousState(snapshot);
    setActionError(null);
    setIsSubmitting(true);

    if (isEditing) {
      setBookings((current) =>
        sortBookings(
          current.map((booking) => (booking.id === targetId ? { ...optimistic } : booking))
        )
      );
    } else {
      setBookings((current) => sortBookings([...current, optimistic]));
    }

    try {
      const response = isEditing
        ? await apiFetch<ApiAppointmentResponse>(`/appointments/${targetId}`, {
            method: 'PUT',
            body: payload
          })
        : await apiFetch<ApiAppointmentResponse>('/appointments', {
            method: 'POST',
            body: payload
          });

      const record = extractAppointment(response);
      const saved = record
        ? mapAppointmentToBooking(record, lookups)
        : { ...optimistic, isOptimistic: false };

      setBookings((current) =>
        sortBookings(
          current.map((booking) =>
            booking.id === targetId ? { ...saved, isOptimistic: false } : booking
          )
        )
      );
      setIsModalOpen(false);
      setEditingBooking(null);
      setDraftDate(null);
    } catch (error) {
      console.error('Booking save failed', error);
      setActionError((error as Error).message ?? 'Failed to save booking');
      setBookings(previousState ?? snapshot);
    } finally {
      setPreviousState(null);
      setIsSubmitting(false);
    }
  };

  const modalInitialValues = editingBooking
    ? bookingToFormValues(editingBooking)
    : createBlankFormValues(draftDate ?? weekStart.format('YYYY-MM-DD'));

  return (
    <>
      <Head>
        <title>Booking calendar | AI Hairdresser Receptionist</title>
      </Head>
      <main className="dashboard">
        <aside>
          <nav>
            <Link href="/dashboard">Overview</Link>
            <Link href="/dashboard/bookings">Bookings calendar</Link>
            <Link href="/appointments">Appointments</Link>
            <Link href="/clients">Clients</Link>
            <Link href="/stylists">Stylists</Link>
            <Link href="/admin/monitoring">Monitoring</Link>
            <Link href="/admin/marketing">Marketing Studio</Link>
          </nav>
        </aside>
        <section className="content">
          <header className="toolbar">
            <div>
              <h1>Weekly bookings</h1>
              <p className="timezone">Timezone: {tenantTimezone}</p>
              <p className="range">
                {weekStart.format('MMM D')} – {weekStart.add(6, 'day').format('MMM D, YYYY')}
              </p>
            </div>
            <div className="toolbar-actions">
              <div className="week-switcher">
                <button type="button" onClick={() => goToWeek(-1)} aria-label="Previous week">
                  ◀
                </button>
                <button type="button" onClick={() => goToWeek(1)} aria-label="Next week">
                  ▶
                </button>
              </div>
              <button type="button" className="primary" onClick={() => openCreateModal()}>
                New booking
              </button>
            </div>
          </header>

          {initialError && <p className="error">{initialError}</p>}
          {actionError && <p className="error">{actionError}</p>}

          <div className="week-grid">
            {weekDays.map((day) => {
              const key = day.format('YYYY-MM-DD');
              const dayBookings = bookingsByDay.get(key) ?? [];
              return (
                <div key={key} className="day-column">
                  <div className="day-header">
                    <div>
                      <h2>{day.format('ddd')}</h2>
                      <span>{day.format('D MMM')}</span>
                    </div>
                    <button type="button" className="text" onClick={() => openCreateModal(key)}>
                      + Add
                    </button>
                  </div>
                  <div className="day-body">
                    {dayBookings.length === 0 && <p className="empty">No bookings</p>}
                    {dayBookings.map((booking) => (
                      <article
                        key={booking.id}
                        className={clsx('booking-card', STATUS_CLASSNAME[booking.status], {
                          'booking-card--optimistic': booking.isOptimistic
                        })}
                        style={booking.stylistColor ? { borderColor: booking.stylistColor } : undefined}
                      >
                        <header>
                          <strong>
                            {dayjs(booking.startTime).format('HH:mm')} -{' '}
                            {dayjs(booking.endTime).format('HH:mm')}
                          </strong>
                          <span>{booking.serviceName ?? 'Service'}</span>
                        </header>
                        <p className="client">{booking.clientName ?? 'Client TBD'}</p>
                        <p className="stylist">{booking.stylistName ?? 'No stylist'}</p>
                        <footer>
                          <span className="badge">{STATUS_LABELS[booking.status]}</span>
                          <button
                            type="button"
                            onClick={() => openEditModal(booking)}
                            className="text"
                          >
                            Edit
                          </button>
                        </footer>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <BookingModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={submitBooking}
        lookups={lookups}
        loading={isSubmitting}
        initialValues={modalInitialValues}
        isEditing={Boolean(editingBooking)}
      />
      <style jsx>{`
        .dashboard {
          display: grid;
          grid-template-columns: 240px 1fr;
          min-height: 100vh;
        }
        aside {
          background: #0f172a;
          color: #e2e8f0;
          padding: 2rem 1.5rem;
        }
        nav {
          display: grid;
          gap: 1rem;
        }
        nav :global(a) {
          color: inherit;
          font-weight: 500;
        }
        .content {
          padding: 2.5rem;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1.5rem;
        }
        .toolbar h1 {
          margin: 0 0 0.25rem;
        }
        .timezone,
        .range {
          margin: 0;
          color: #475569;
        }
        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .week-switcher {
          display: grid;
          grid-template-columns: repeat(2, 40px);
          gap: 0.25rem;
        }
        .week-switcher button {
          border: 1px solid #cbd5f5;
          background: white;
          border-radius: 8px;
          padding: 0.25rem 0;
          cursor: pointer;
        }
        .primary {
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 10px;
          padding: 0.7rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
        }
        .primary:disabled,
        .week-switcher button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .week-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
        }
        .day-column {
          background: white;
          border-radius: 16px;
          box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          min-height: 340px;
        }
        .day-header {
          display: flex;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e2e8f0;
          align-items: center;
        }
        .day-header h2 {
          margin: 0;
        }
        .day-header span {
          color: #64748b;
          font-size: 0.85rem;
        }
        .day-body {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .empty {
          color: #94a3b8;
          text-align: center;
          margin: 1.5rem 0;
        }
        .booking-card {
          border: 2px solid transparent;
          border-radius: 12px;
          padding: 0.75rem 1rem;
          display: grid;
          gap: 0.35rem;
        }
        .booking-card header {
          display: flex;
          justify-content: space-between;
          font-size: 0.95rem;
          color: #0f172a;
        }
        .booking-card .client {
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }
        .booking-card .stylist {
          margin: 0;
          color: #475569;
        }
        .booking-card footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .badge {
          font-size: 0.75rem;
          font-weight: 600;
        }
        .text {
          border: none;
          background: transparent;
          color: #2563eb;
          cursor: pointer;
        }
        .status {
          border-radius: 999px;
          padding: 0.1rem 0.6rem;
          color: #0f172a;
        }
        .status--pending {
          background: #fef3c7;
          border: 1px solid #facc15;
        }
        .status--confirmed {
          background: #dcfce7;
          border: 1px solid #22c55e;
        }
        .status--completed {
          background: #e0f2fe;
          border: 1px solid #38bdf8;
        }
        .status--cancelled {
          background: #fee2e2;
          border: 1px solid #f87171;
        }
        .status--no-show {
          background: #ede9fe;
          border: 1px solid #a855f7;
        }
        .booking-card--optimistic {
          opacity: 0.6;
        }
        .error {
          padding: 0.75rem 1rem;
          border-radius: 12px;
          background: #fee2e2;
          color: #b91c1c;
        }
      `}</style>
    </>
  );
}

function findLookupName(options: LookupOption[], id: string | null | undefined) {
  if (!id) return undefined;
  return options.find((item) => item.id === id)?.name;
}

function findLookupColor(options: LookupOption[], id: string | null | undefined) {
  if (!id) return null;
  return options.find((item) => item.id === id)?.color ?? null;
}

function sortBookings(values: Booking[]) {
  return [...values].sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
}

function extractAppointment(payload: ApiAppointmentResponse | undefined | null) {
  if (!payload) return null;
  if ('appointment' in payload && payload.appointment) {
    return payload.appointment;
  }
  if ('data' in payload && payload.data) {
    return payload.data;
  }
  if ('id' in payload && 'start_time' in payload) {
    return payload as ApiAppointmentRecord;
  }
  return null;
}

function mapAppointmentToBooking(record: ApiAppointmentRecord, lookups: LookupData): Booking {
  return {
    id: record.id,
    clientId: record.client_id,
    stylistId: record.stylist_id,
    serviceId: record.service_id,
    startTime: record.start_time,
    endTime: record.end_time,
    status: record.status,
    notes: record.notes ?? null,
    clientName: findLookupName(lookups.clients, record.client_id),
    stylistName: findLookupName(lookups.stylists, record.stylist_id),
    stylistColor: findLookupColor(lookups.stylists, record.stylist_id),
    serviceName: findLookupName(lookups.services, record.service_id)
  };
}

function bookingToFormValues(booking: Booking): BookingFormValues {
  return {
    id: booking.id,
    clientId: booking.clientId ?? '',
    stylistId: booking.stylistId ?? '',
    serviceId: booking.serviceId ?? '',
    startTime: dayjs(booking.startTime).format('YYYY-MM-DDTHH:mm'),
    endTime: dayjs(booking.endTime).format('YYYY-MM-DDTHH:mm'),
    status: booking.status,
    notes: booking.notes ?? ''
  };
}

function createBlankFormValues(date: string): BookingFormValues {
  const start = dayjs(date).hour(9).minute(0).second(0).millisecond(0);
  const end = start.add(60, 'minute');
  return {
    clientId: '',
    stylistId: '',
    serviceId: '',
    startTime: start.format('YYYY-MM-DDTHH:mm'),
    endTime: end.format('YYYY-MM-DDTHH:mm'),
    status: 'pending',
    notes: ''
  };
}

type BookingModalProps = {
  isOpen: boolean;
  isEditing: boolean;
  loading: boolean;
  initialValues: BookingFormValues;
  lookups: LookupData;
  onClose: () => void;
  onSubmit: (values: BookingFormValues) => Promise<void>;
};

function BookingModal({
  isOpen,
  isEditing,
  loading,
  initialValues,
  lookups,
  onClose,
  onSubmit
}: BookingModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: initialValues
  });

  useEffect(() => {
    if (isOpen) {
      reset(initialValues);
    }
  }, [initialValues, isOpen, reset]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={handleSubmit((values) => onSubmit(values))}>
        <header>
          <h2>{isEditing ? 'Edit booking' : 'Create booking'}</h2>
        </header>
        <div className="modal-grid">
          <label>
            <span>Client</span>
            <select {...register('clientId')}>
              <option value="">Select client</option>
              {lookups.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {errors.clientId && <p className="field-error">{errors.clientId.message}</p>}
          </label>
          <label>
            <span>Stylist</span>
            <select {...register('stylistId')}>
              <option value="">Select stylist</option>
              {lookups.stylists.map((stylist) => (
                <option key={stylist.id} value={stylist.id}>
                  {stylist.name}
                </option>
              ))}
            </select>
            {errors.stylistId && <p className="field-error">{errors.stylistId.message}</p>}
          </label>
          <label>
            <span>Service</span>
            <select {...register('serviceId')}>
              <option value="">Select service</option>
              {lookups.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            {errors.serviceId && <p className="field-error">{errors.serviceId.message}</p>}
          </label>
          <label>
            <span>Start time</span>
            <input type="datetime-local" {...register('startTime')} />
            {errors.startTime && <p className="field-error">{errors.startTime.message}</p>}
          </label>
          <label>
            <span>End time</span>
            <input type="datetime-local" {...register('endTime')} />
            {errors.endTime && <p className="field-error">{errors.endTime.message}</p>}
          </label>
          <label>
            <span>Status</span>
            <select {...register('status')}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="notes">
            <span>Notes</span>
            <textarea rows={3} {...register('notes')} placeholder="Optional notes" />
          </label>
        </div>
        <footer>
          <button type="button" onClick={onClose} className="secondary" disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Saving…' : isEditing ? 'Save changes' : 'Create booking'}
          </button>
        </footer>
        <style jsx>{`
          .modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
            z-index: 20;
          }
          .modal {
            background: white;
            border-radius: 18px;
            max-width: 640px;
            width: 100%;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }
          header h2 {
            margin: 0;
          }
          .modal-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1rem;
          }
          label {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
            font-size: 0.9rem;
          }
          .notes {
            grid-column: 1 / -1;
          }
          input,
          select,
          textarea {
            padding: 0.6rem 0.75rem;
            border: 1px solid #cbd5f5;
            border-radius: 10px;
            font: inherit;
          }
          textarea {
            resize: vertical;
          }
          footer {
            display: flex;
            justify-content: flex-end;
            gap: 1rem;
          }
          .secondary {
            border: none;
            background: #e2e8f0;
            padding: 0.6rem 1.2rem;
            border-radius: 10px;
            cursor: pointer;
          }
          .primary {
            background: #2563eb;
            color: white;
            border: none;
            padding: 0.6rem 1.4rem;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
          }
          .primary:disabled,
          .secondary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .field-error {
            color: #b91c1c;
            font-size: 0.8rem;
            margin: 0;
          }
        `}</style>
      </form>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<BookingDashboardProps> = async (ctx) => {
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
  if (role && !['admin', 'staff', 'stylist'].includes(role)) {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false
      }
    };
  }

  const requestedStart = typeof ctx.query.start === 'string' ? dayjs(ctx.query.start) : null;
  const weekStart = requestedStart?.isValid() ? requestedStart.startOf('day') : dayjs().startOf('isoWeek');
  const weekEnd = weekStart.add(1, 'week');

  const { data: appointmentsData, error: appointmentsError } = await supabase
    .from('appointments')
    .select('id, client_id, stylist_id, service_id, start_time, end_time, status, notes')
    .gte('start_time', weekStart.toISOString())
    .lt('start_time', weekEnd.toISOString())
    .order('start_time', { ascending: true });

  const { data: clientsData } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .order('first_name', { ascending: true });

  const { data: stylistsData } = await supabase
    .from('stylists')
    .select('id, first_name, last_name, color')
    .order('first_name', { ascending: true });

  const { data: servicesData } = await supabase
    .from('services')
    .select('id, name')
    .order('name', { ascending: true });

  const lookups: LookupData = {
    clients: (clientsData ?? []).map((client) => ({
      id: client.id,
      name: `${client.first_name} ${client.last_name}`.trim()
    })),
    stylists: (stylistsData ?? []).map((stylist) => ({
      id: stylist.id,
      name: `${stylist.first_name} ${stylist.last_name}`.trim(),
      color: stylist.color ?? null
    })),
    services: (servicesData ?? []).map((service) => ({
      id: service.id,
      name: service.name
    }))
  };

  const bookings = (appointmentsData ?? []).map((record) =>
    mapAppointmentToBooking(record as ApiAppointmentRecord, lookups)
  );

  return {
    props: {
      initialBookings: bookings,
      lookups,
      range: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
      tenantTimezone: session.user.user_metadata?.timezone ?? 'UTC',
      initialError: appointmentsError ? 'Failed to load bookings' : null
    }
  };
};

