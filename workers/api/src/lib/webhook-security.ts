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

async function computeTwilioSignature(authToken: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64(signature);
}

function buildSignatureBase(url: string, params: URLSearchParams) {
  if ([...params.keys()].length === 0) {
    return url;
  }
  const sortedKeys = [...params.keys()].sort();
  let buffer = url;
  for (const key of sortedKeys) {
    const values = params.getAll(key);
    for (const value of values) {
      buffer += key + value;
    }
  }
  return buffer;
}

export async function validateTwilioSignature(
  authToken: string | undefined,
  requestUrl: string,
  params: URLSearchParams,
  signature: string | null
) {
  if (!authToken || !signature) {
    return false;
  }
  const payload = buildSignatureBase(requestUrl, params);
  const expected = await computeTwilioSignature(authToken, payload);
  return timingSafeEqual(signature, expected);
}
