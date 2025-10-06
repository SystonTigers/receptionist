import { z } from 'zod';

export const tenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  slug: z.string().regex(/[a-z0-9-]+/),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  settings: z.object({
    defaultDepositType: z.enum(['fixed', 'percentage']).default('percentage'),
    defaultDepositValue: z.number().nonnegative().default(20),
    depositsEnabled: z.boolean().default(false),
    timezone: z.string(),
    locale: z.string(),
    cancellationPolicy: z.string()
  })
});

export const userSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['admin', 'staff', 'stylist']),
  passwordHash: z.string()
});

export const appointmentAvailabilitySchema = z.object({
  tenantId: z.string().uuid(),
  stylistId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string()
});

export type TenantInput = z.infer<typeof tenantSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type AppointmentAvailabilityInput = z.infer<typeof appointmentAvailabilitySchema>;

export const bookingCreateSchema = z.object({
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  stylistId: z.string().uuid().optional(),
  startTime: z.string(),
  endTime: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'checked_in', 'completed', 'cancelled']).default('pending'),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const bookingUpdateSchema = bookingCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type BookingUpdateInput = z.infer<typeof bookingUpdateSchema>;
