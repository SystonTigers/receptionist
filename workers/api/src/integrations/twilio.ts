import { normalizeError, RequestLogger } from '@ai-hairdresser/shared';

export function createTwilioClient(env: Env, logger?: RequestLogger) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    logger?.warn('Twilio credentials missing');
  }
  return {
    async sendSms(to: string, body: string) {
      logger?.debug('Dispatching SMS via Twilio', { to: maskRecipient(to) });
      // TODO: integrate real Twilio client
      return { sid: 'SM-placeholder' };
    },
    async sendWhatsapp(to: string, body: string) {
      logger?.debug('Dispatching WhatsApp via Twilio', { to: maskRecipient(to) });
      return { sid: 'SM-whatsapp-placeholder' };
    }
  };
}

function maskRecipient(recipient: string) {
  if (!recipient) return 'unknown';
  const trimmed = recipient.replace(/\s+/g, '');
  return trimmed.length <= 4 ? `***${trimmed}` : `***${trimmed.slice(-4)}`;
}

export async function sendBookingNotification(
  env: Env,
  to: string,
  message: string,
  logger?: RequestLogger
) {
  const client = createTwilioClient(env, logger);
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.sendSms(to, message);
      logger?.info('Booking notification dispatched via Twilio', {
        attempt,
        to: maskRecipient(to)
      });
      logger?.metric('messaging.outbound.success', 1, { dimension: 'sms' });
      return { success: true };
    } catch (error) {
      lastError = error;
      logger?.warn('Booking notification attempt failed', {
        attempt,
        to: maskRecipient(to),
        error: normalizeError(error)
      });
      logger?.metric('messaging.outbound.failure', 1, { dimension: 'sms' });
      if (attempt < maxAttempts) {
        const delay = 250 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger?.error('Booking notification failed after retries', {
    to: maskRecipient(to),
    error: normalizeError(lastError)
  });

  return { success: false, error: lastError };
}
