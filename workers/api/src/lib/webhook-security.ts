export const TWILIO_SIGNATURE_HEADER = 'X-Twilio-Signature';

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function toBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function computeTwilioSignature(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64(signature);
}

function buildSignatureBase(url: string, formBody: string) {
  const params = new URLSearchParams(formBody);
  if ([...params.keys()].length === 0) {
    return url;
  }
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  let buffer = url;
  for (const [key, value] of sorted) {
    buffer += key + value;
  }
  return buffer;
}

export async function validateTwilio(
  formBody: string,
  requestUrl: string,
  signature: string | null,
  authToken: string | undefined
) {
  if (!authToken || !signature) {
    return false;
  }
  const payload = buildSignatureBase(new URL(requestUrl).toString(), formBody);
  const expected = await computeTwilioSignature(authToken, payload);
  return timingSafeEqual(signature, expected);
}
