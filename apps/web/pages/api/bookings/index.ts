import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase-admin-client';

const bookingRequestSchema = z
  .object({
    tenantSlug: z.string().min(1, 'Missing tenant identifier'),
    clientName: z.string().min(1, 'Client name is required'),
    clientEmail: z.union([z.string().email('Invalid email address'), z.literal(''), z.undefined()]),
    clientPhone: z.union([z.string(), z.literal(''), z.undefined()]),
    serviceId: z.string().min(1, 'Service is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    timezone: z.string().optional(),
    notes: z.string().optional()
  })
  .superRefine((value, ctx) => {
    const hasEmail = typeof value.clientEmail === 'string' && value.clientEmail.trim().length > 0;
    const hasPhone = typeof value.clientPhone === 'string' && value.clientPhone.trim().length > 0;
    if (!hasEmail && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either an email or phone number',
        path: ['contact']
      });
    }
  });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const parseResult = bookingRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const details = parseResult.error.issues.map((issue) => issue.message).join(', ');
    return res.status(400).json({ error: 'Invalid booking request', details });
  }

  const { tenantSlug, clientName, clientEmail, clientPhone, serviceId, startTime, endTime } = parseResult.data;

  try {
    const supabase = getSupabaseServiceClient();

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tenantError) {
      console.error('Failed to load tenant for booking', tenantError);
      return res.status(500).json({ error: 'Unable to load tenant' });
    }

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('id', serviceId)
      .maybeSingle();

    if (serviceError) {
      console.error('Failed to load service for booking', serviceError);
      return res.status(500).json({ error: 'Unable to load service' });
    }

    if (!service) {
      return res.status(400).json({ error: 'Service not found' });
    }

    const { error: insertError } = await supabase.from('bookings').insert({
      tenant_id: tenant.id,
      client_name: clientName.trim(),
      service: service.name,
      start_time: startTime,
      end_time: endTime,
      status: 'pending'
    });

    if (insertError) {
      console.error('Failed to create booking', insertError);
      return res.status(500).json({ error: 'Failed to create booking' });
    }

    return res.status(201).json({ message: 'Booking received' });
  } catch (error) {
    console.error('Unexpected booking error', error);
    return res.status(500).json({ error: 'Unexpected error creating booking' });
  }
}
