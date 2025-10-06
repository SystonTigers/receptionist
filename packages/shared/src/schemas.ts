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
