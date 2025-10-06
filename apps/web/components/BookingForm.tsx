import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

export const bookingFormSchema = z
  .object({
    clientId: z.string().min(1, 'Client is required'),
    stylistId: z.string().min(1, 'Stylist is required'),
    serviceId: z.string().min(1, 'Service is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    notes: z.string().max(500, 'Notes must be 500 characters or fewer').optional()
  })
  .refine(
    (values) => {
      if (!values.startTime || !values.endTime) {
        return true;
      }
      return new Date(values.endTime).getTime() > new Date(values.startTime).getTime();
    },
    {
      message: 'End time must be after start time',
      path: ['endTime']
    }
  );

export type BookingFormValues = z.infer<typeof bookingFormSchema>;

export interface BookingFormProps {
  defaultValues?: Partial<BookingFormValues>;
  onSubmit: (values: BookingFormValues) => void | Promise<void>;
}

export function BookingForm({ defaultValues, onSubmit }: BookingFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      clientId: '',
      stylistId: '',
      serviceId: '',
      startTime: '',
      endTime: '',
      notes: '',
      ...defaultValues
    }
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} aria-label="booking-form">
      <label>
        Client
        <input data-testid="client" {...register('clientId')} />
        {errors.clientId && <span role="alert">{errors.clientId.message}</span>}
      </label>
      <label>
        Stylist
        <input data-testid="stylist" {...register('stylistId')} />
        {errors.stylistId && <span role="alert">{errors.stylistId.message}</span>}
      </label>
      <label>
        Service
        <input data-testid="service" {...register('serviceId')} />
        {errors.serviceId && <span role="alert">{errors.serviceId.message}</span>}
      </label>
      <label>
        Start time
        <input data-testid="start-time" type="datetime-local" {...register('startTime')} />
        {errors.startTime && <span role="alert">{errors.startTime.message}</span>}
      </label>
      <label>
        End time
        <input data-testid="end-time" type="datetime-local" {...register('endTime')} />
        {errors.endTime && <span role="alert">{errors.endTime.message}</span>}
      </label>
      <label>
        Notes
        <textarea data-testid="notes" {...register('notes')} />
        {errors.notes && <span role="alert">{errors.notes.message}</span>}
      </label>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save booking'}
      </button>
    </form>
  );
}
