type SendGridMessage = {
  from: { email: string; name?: string };
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
  replyTo?: { email: string; name?: string };
};

export function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function dispatch(apiKey: string, message: SendGridMessage, attempt: number) {
  const content = [] as Array<{ type: string; value: string }>;
  const text = message.text ?? stripHtml(message.html);
  if (text) content.push({ type: 'text/plain', value: text });
  content.push({ type: 'text/html', value: message.html });

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: message.from,
      personalizations: [
        {
          to: [message.to],
          subject: message.subject
        }
      ],
      content,
      reply_to: message.replyTo
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SendGrid request failed (attempt ${attempt}): ${response.status} ${response.statusText} :: ${body.slice(0, 200)}`
    );
  }

  return response.headers.get('x-message-id') ?? undefined;
}

export async function sendEmailViaSendGrid(apiKey: string, message: SendGridMessage) {
  const maxAttempts = 4;
  let attempt = 0;
  let lastError: unknown;
  let messageId: string | undefined;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      messageId = await dispatch(apiKey, message, attempt);
      return { success: true, messageId };
    } catch (error) {
      lastError = error;
      const delay = 250 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: lastError };
}

export function maskEmail(email: string | null | undefined) {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}
