export function createTwilioClient(env: Env) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('Twilio credentials missing');
  }
  return {
    async sendSms(to: string, body: string) {
      console.log('TODO: send SMS via Twilio', { to, body });
      return { sid: 'SM-placeholder' };
    },
    async sendWhatsapp(to: string, body: string) {
      console.log('TODO: send WhatsApp via Twilio', { to, body });
      return { sid: 'SM-whatsapp-placeholder' };
    }
  };
}

function maskRecipient(recipient: string) {
  if (!recipient) return 'unknown';
  const trimmed = recipient.replace(/\s+/g, '');
  return trimmed.length <= 4 ? `***${trimmed}` : `***${trimmed.slice(-4)}`;
}

export async function sendBookingNotification(env: Env, to: string, message: string) {
  const client = createTwilioClient(env);
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.sendSms(to, message);
      console.log('Booking notification dispatched via Twilio', {
        attempt,
        to: maskRecipient(to)
      });
      return { success: true };
    } catch (error) {
      lastError = error;
      console.error('Booking notification attempt failed', {
        attempt,
        to: maskRecipient(to),
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt < maxAttempts) {
        const delay = 250 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error('Booking notification failed after retries', {
    to: maskRecipient(to),
    error: lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown')
  });

  return { success: false, error: lastError };
}
