import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { BookingForm, bookingFormSchema, type BookingFormValues } from '../BookingForm';

describe('BookingForm', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('validates required fields and shows error messages', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<BookingForm onSubmit={onSubmit} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save booking/i }));
    });

    expect(await screen.findAllByRole('alert')).toHaveLength(5);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('prevents submission when end time is before start time', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<BookingForm onSubmit={onSubmit} />);

    await act(async () => {
      await user.type(screen.getByTestId('client'), 'client-1');
      await user.type(screen.getByTestId('stylist'), 'stylist-1');
      await user.type(screen.getByTestId('service'), 'service-1');
      await user.type(screen.getByTestId('start-time'), '2024-03-01T10:00');
      await user.type(screen.getByTestId('end-time'), '2024-03-01T09:30');
      await user.click(screen.getByRole('button', { name: /save booking/i }));
    });

    expect(await screen.findByText(/end time must be after start time/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('passes validated values to onSubmit', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <BookingForm
        onSubmit={onSubmit}
        defaultValues={{
          clientId: 'client-1',
          stylistId: 'stylist-2',
          serviceId: 'service-3',
          startTime: '2024-03-01T11:00',
          endTime: '2024-03-01T12:00'
        }}
      />
    );

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /save booking/i }));
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining<BookingFormValues>({
          clientId: 'client-1',
          stylistId: 'stylist-2',
          serviceId: 'service-3',
          startTime: '2024-03-01T11:00',
          endTime: '2024-03-01T12:00'
        }),
        expect.anything()
      );
    });
  });
});

describe('bookingFormSchema', () => {
  it('rejects notes longer than 500 characters', () => {
    const result = bookingFormSchema.safeParse({
      clientId: 'client-1',
      stylistId: 'stylist-2',
      serviceId: 'service-3',
      startTime: '2024-03-01T11:00',
      endTime: '2024-03-01T12:00',
      notes: 'a'.repeat(501)
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.notes?.[0]).toMatch(/500/);
    }
  });
});
