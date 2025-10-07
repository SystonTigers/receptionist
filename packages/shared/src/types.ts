export type TenantId = string;
export type UserId = string;
export type AppointmentId = string;
export type BookingId = string;

export type FeatureCode = 'deposits_enabled' | 'ai_assistant_enabled' | 'team_accounts';
export type PlanCode = 'free' | 'basic' | 'pro';
export type TenantPlanStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  createdAt: string;
  updatedAt: string;
  settings: TenantSettings;
}

export interface TenantSettings {
  defaultDepositType: 'fixed' | 'percentage';
  defaultDepositValue: number;
  depositsEnabled: boolean;
  timezone: string;
  locale: string;
  cancellationPolicy: string;
}

export type Role = 'admin' | 'staff' | 'stylist';

export interface User {
  id: UserId;
  tenantId: TenantId;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  tenantId: TenantId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  notes?: string;
  consentMarketing: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Stylist {
  id: string;
  tenantId: TenantId;
  firstName: string;
  lastName: string;
  specialties: string[];
  workingHours: StylistWorkingHours[];
  timezone?: string;
  color?: string;
}

export interface StylistWorkingHours {
  dayOfWeek: number; // 0-6
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface Service {
  id: string;
  tenantId: TenantId;
  name: string;
  durationMinutes: number;
  price: number;
  requiresDeposit: boolean;
  depositType?: 'fixed' | 'percentage';
  depositValue?: number;
  createdAt: string;
  updatedAt: string;
}

export type BookingDepositStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface BookingDeposit {
  required: boolean;
  status: BookingDepositStatus;
  amount?: number;
  currency?: string;
  checkoutSessionId?: string;
  checkoutUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
}

export interface Appointment {
  id: AppointmentId;
  tenantId: TenantId;
  clientId: string;
  stylistId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'completed';
  depositAmount?: number;
  notes?: string;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled';

export interface Booking {
  id: BookingId;
  tenantId: TenantId;
  clientId: string;
  serviceId: string;
  stylistId?: string;
  startTime: string;
  endTime?: string;
  status: BookingStatus;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  deposit?: BookingDeposit;
}

export interface MessageLog {
  id: string;
  tenantId: TenantId;
  direction: 'inbound' | 'outbound';
  channel: 'sms' | 'whatsapp' | 'voice';
  providerMessageId?: string;
  clientId?: string;
  payload: Record<string, unknown>;
  response?: string;
  handledBy: 'ai' | 'human';
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  tenantId: TenantId;
  appointmentId?: AppointmentId;
  clientId?: string;
  stripePaymentIntentId?: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'succeeded' | 'cancelled' | 'failed';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: TenantId;
  actorId?: UserId;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  createdAt: string;
}

export interface UsageMetric {
  id: string;
  tenantId: TenantId;
  metric: string;
  value: number;
  occurredAt: string;
}

export interface AvailabilityRequest {
  tenantId: TenantId;
  stylistId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  isBlocked: boolean;
  reason?: string;
}

export interface CalendarSyncToken {
  id: string;
  tenantId: TenantId;
  stylistId: string;
  googleCalendarId: string;
  syncToken: string;
  updatedAt: string;
}

export interface PlanSummary {
  code: PlanCode;
  name: string;
  description?: string | null;
  monthlyPrice?: number | null;
  currency?: string | null;
  gracePeriodDays: number;
  features: FeatureCode[];
}

export interface TenantPlanAccess {
  plan: PlanSummary;
  effectivePlan: PlanSummary;
  status: TenantPlanStatus;
  billingStatus?: string | null;
  features: FeatureCode[];
  isInGracePeriod: boolean;
  currentPeriodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  downgradedTo?: PlanSummary | null;
}

export interface TenantPlanResponse {
  tenantPlan: TenantPlanAccess;
  availablePlans: PlanSummary[];
}
