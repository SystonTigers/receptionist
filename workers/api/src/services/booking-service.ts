import { createClient } from '@supabase/supabase-js';
import type {
  Booking,
  BookingCreateInput,
  BookingDeposit,
  BookingDepositStatus,
  BookingUpdateInput,
  TenantSettings
} from '@ai-hairdresser/shared';
import { createStripeClient } from '../integrations/stripe';
import { checkUsageQuota, recordUsageEvent } from './usage-service';

interface BookingRow {
  id: string;
  tenant_id: string;
  client_id: string;
  service_id: string;
  stylist_id?: string | null;
  start_time: string;
  end_time?: string | null;
  status: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
}

interface ServiceRow {
  id: string;
  tenant_id: string;
  name: string;
  price: number | string;
  requires_deposit: boolean | null;
  deposit_type?: 'fixed' | 'percentage' | null;
  deposit_value?: number | string | null;
}

interface TenantRow {
  settings: Partial<TenantSettings> | null;
}

interface ClientRow {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

const BOOKING_COLUMNS =
  'id, tenant_id, client_id, service_id, stylist_id, start_time, end_time, status, notes, metadata, created_by, created_at, updated_at, cancelled_at';

function getClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

const DEFAULT_CHECKOUT_SUCCESS_URL = 'https://example.com/booking/success';
const DEFAULT_CHECKOUT_CANCEL_URL = 'https://example.com/booking/cancel';

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

function parseDepositMetadata(metadata: Record<string, unknown> | undefined | null): BookingDeposit | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const rawDeposit = (metadata as Record<string, unknown>).deposit;
  if (!rawDeposit || typeof rawDeposit !== 'object') {
    return undefined;
  }

  const deposit = rawDeposit as Record<string, unknown>;
  const required = Boolean(deposit.required);
  const status = (typeof deposit.status === 'string'
    ? deposit.status
    : required
      ? 'pending'
      : 'cancelled') as BookingDepositStatus;

  const amountValue = deposit.amount;
  const amount =
    typeof amountValue === 'number'
      ? amountValue
      : typeof amountValue === 'string'
        ? Number.parseFloat(amountValue)
        : undefined;

  const currency = typeof deposit.currency === 'string' ? deposit.currency : undefined;
  const checkoutSessionId =
    typeof deposit.checkoutSessionId === 'string' ? deposit.checkoutSessionId : undefined;
  const checkoutUrl = typeof deposit.checkoutUrl === 'string' ? deposit.checkoutUrl : undefined;
  const createdAt = typeof deposit.createdAt === 'string' ? deposit.createdAt : undefined;
  const updatedAt = typeof deposit.updatedAt === 'string' ? deposit.updatedAt : undefined;
  const paidAt = typeof deposit.paidAt === 'string' ? deposit.paidAt : undefined;

  return {
    required,
    status,
    amount,
    currency,
    checkoutSessionId,
    checkoutUrl,
    createdAt,
    updatedAt,
    paidAt
  };
}

function calculateDepositAmount(service: ServiceRow, settings: Partial<TenantSettings>) {
  const price = toNumber(service.price);
  if (!price || price <= 0) {
    return 0;
  }

  const depositType = service.deposit_type ?? settings.defaultDepositType ?? 'percentage';
  const rawValue =
    service.deposit_value !== undefined && service.deposit_value !== null
      ? toNumber(service.deposit_value)
      : settings.defaultDepositValue ?? 0;

  if (depositType === 'fixed') {
    return roundCurrency(Math.max(0, Math.min(price, rawValue)));
  }

  const percentage = Math.max(0, rawValue);
  const amount = (price * percentage) / 100;
  return roundCurrency(Math.max(0, Math.min(price, amount)));
}

function getCheckoutUrls(env: Env) {
  return {
    successUrl: env.BOOKING_DEPOSIT_SUCCESS_URL ?? DEFAULT_CHECKOUT_SUCCESS_URL,
    cancelUrl: env.BOOKING_DEPOSIT_CANCEL_URL ?? DEFAULT_CHECKOUT_CANCEL_URL
  };
}

function getCurrency(env: Env) {
  return (env.DEFAULT_CURRENCY ?? 'gbp').toLowerCase();
}

function mapBooking(row: BookingRow): Booking {
  const metadata = (row.metadata ?? undefined) as Record<string, unknown> | undefined;
  const deposit = parseDepositMetadata(metadata);

  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    serviceId: row.service_id,
    stylistId: row.stylist_id ?? undefined,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    status: row.status as Booking['status'],
    notes: row.notes ?? undefined,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
    deposit,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at ?? undefined
  };
}

async function fetchService(client: ReturnType<typeof getClient>, tenantId: string, serviceId: string) {
  const { data, error } = await client
    .from('services')
    .select('id, tenant_id, name, price, requires_deposit, deposit_type, deposit_value')
    .eq('tenant_id', tenantId)
    .eq('id', serviceId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load service: ${error?.message ?? 'not found'}`);
  }

  return data as ServiceRow;
}

async function fetchTenantSettings(client: ReturnType<typeof getClient>, tenantId: string) {
  const { data, error } = await client.from('tenants').select('settings').eq('id', tenantId).single();
  if (error) {
    throw new Error(`Failed to load tenant settings: ${error.message}`);
  }

  const settings = (data as TenantRow | null)?.settings ?? {};
  return settings;
}

async function fetchClientContact(
  client: ReturnType<typeof getClient>,
  tenantId: string,
  clientId: string
) {
  const { data, error } = await client
    .from('clients')
    .select('email, first_name, last_name')
    .eq('tenant_id', tenantId)
    .eq('id', clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load client contact details: ${error.message}`);
  }

  return (data as ClientRow | null) ?? null;
}

export interface ListBookingsOptions {
  startTime?: string;
}

export async function listBookings(env: Env, tenantId: string, options: ListBookingsOptions = {}) {
  const client = getClient(env);
  let query = client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('start_time', { ascending: true });

  if (options.startTime) {
    query = query.gte('start_time', options.startTime);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list bookings: ${error.message}`);
  }

  return (data ?? []).map((row) => mapBooking(row as BookingRow));
}

export interface CreateBookingResult {
  booking: Booking;
  checkoutUrl?: string;
}

export async function createBooking(
  env: Env,
  tenantId: string,
  userId: string,
  input: BookingCreateInput
): Promise<CreateBookingResult> {
  await checkUsageQuota(env, tenantId, 'booking.created', 1);
  const client = getClient(env);
  const [service, settings] = await Promise.all([
    fetchService(client, tenantId, input.serviceId),
    fetchTenantSettings(client, tenantId)
  ]);

  const depositsEnabled = Boolean(settings.depositsEnabled);
  const currency = getCurrency(env);
  let depositAmount = 0;
  let depositRequired = false;

  if (depositsEnabled && Boolean(service.requires_deposit)) {
    depositAmount = calculateDepositAmount(service, settings);
    depositRequired = depositAmount > 0;
  }

  const now = new Date().toISOString();
  const metadataBase = { ...(input.metadata ?? {}) } as Record<string, unknown>;

  if (depositRequired) {
    metadataBase.deposit = {
      required: true,
      status: 'pending',
      amount: depositAmount,
      currency,
      createdAt: now,
      updatedAt: now
    } satisfies BookingDeposit;
  }

  const status = depositRequired ? 'pending' : input.status ?? 'pending';
  const insertPayload = {
    tenant_id: tenantId,
    client_id: input.clientId,
    service_id: input.serviceId,
    stylist_id: input.stylistId ?? null,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    status,
    notes: input.notes ?? null,
    metadata: Object.keys(metadataBase).length > 0 ? metadataBase : null,
    created_by: userId,
    updated_at: now
  };

  const { data, error } = await client
    .from('bookings')
    .insert(insertPayload)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create booking: ${error?.message ?? 'Unknown error'}`);
  }

  let bookingRow = data as BookingRow;
  let checkoutUrl: string | undefined;

  if (depositRequired) {
    const stripe = createStripeClient(env);
    const { successUrl, cancelUrl } = getCheckoutUrls(env);
    const contact = await fetchClientContact(client, tenantId, input.clientId);
    const session = await stripe.createCheckoutSession({
      amount: Math.round(depositAmount * 100),
      currency,
      clientReferenceId: bookingRow.id,
      successUrl,
      cancelUrl,
      customerEmail: contact?.email ?? undefined,
      productName: `${service.name} deposit`,
      description: `Deposit for ${service.name}`,
      metadata: {
        tenantId,
        bookingId: bookingRow.id,
        serviceId: service.id,
        clientId: input.clientId
      }
    });

    checkoutUrl = session.url;

    const timestamp = new Date().toISOString();
    const metadata = (bookingRow.metadata ?? {}) as Record<string, unknown>;
    const depositDetails = {
      ...(typeof metadata.deposit === 'object' ? (metadata.deposit as Record<string, unknown>) : {}),
      required: true,
      status: 'pending',
      amount: depositAmount,
      currency,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      updatedAt: timestamp
    } satisfies BookingDeposit;

    if (!depositDetails.createdAt) {
      depositDetails.createdAt = now;
    }

    metadata.deposit = depositDetails;

    const { data: updated } = await client
      .from('bookings')
      .update({ metadata, updated_at: timestamp })
      .eq('tenant_id', tenantId)
      .eq('id', bookingRow.id)
      .select(BOOKING_COLUMNS)
      .single();

    if (updated) {
      bookingRow = updated as BookingRow;
    }

    await client.from('payment_transactions').insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      appointment_id: null,
      client_id: input.clientId,
      amount: depositAmount,
      currency,
      status: 'requires_payment_method',
      stripe_payment_intent_id: session.payment_intent ?? null,
      metadata: {
        type: 'deposit',
        bookingId: bookingRow.id,
        checkoutSessionId: session.id
      }
    });
  }

  await recordUsageEvent(env, tenantId, 'booking.created', {
    metadata: {
      bookingId: bookingRow.id,
      serviceId: input.serviceId,
      depositRequired,
      status
    }
  });

  return { booking: mapBooking(bookingRow), checkoutUrl };
}

export async function updateBooking(
  env: Env,
  tenantId: string,
  bookingId: string,
  input: BookingUpdateInput
) {
  const client = getClient(env);
  const updates: Record<string, unknown> = {};

  if (input.clientId !== undefined) updates.client_id = input.clientId;
  if (input.serviceId !== undefined) updates.service_id = input.serviceId;
  if (input.stylistId !== undefined) updates.stylist_id = input.stylistId ?? null;
  if (input.startTime !== undefined) updates.start_time = input.startTime;
  if (input.endTime !== undefined) updates.end_time = input.endTime ?? null;
  if (input.status !== undefined) updates.status = input.status;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
  if (input.metadata !== undefined) updates.metadata = input.metadata ?? null;

  updates.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('bookings')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', bookingId)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update booking: ${error?.message ?? 'Unknown error'}`);
  }

  return mapBooking(data as BookingRow);
}

export async function cancelBooking(env: Env, tenantId: string, bookingId: string) {
  const client = getClient(env);
  const timestamp = new Date().toISOString();
  const { data, error } = await client
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: timestamp, updated_at: timestamp })
    .eq('tenant_id', tenantId)
    .eq('id', bookingId)
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to cancel booking: ${error?.message ?? 'Unknown error'}`);
  }

  return mapBooking(data as BookingRow);
}
