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
