export const TWILIO_SIGNATURE_HEADER = 'X-Twilio-Signature';

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    
const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';

export class WebhookVerificationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WebhookVerificationError';
    this.status = status;
  }
}

type ParameterMap = Record<string, string[]>;

type TwilioVerificationResult = {
  payload: Record<string, unknown>;
};

function parseContentType(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  return raw.split(';')[0]?.trim().toLowerCase() ?? null;
}

function base64ToUint8Array(value: string) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    throw new WebhookVerificationError('Invalid signature encoding', 400);
  }
}

function timingSafeEqualBase64(a: string, b: string) {
  const bytesA = base64ToUint8Array(a);
  const bytesB = base64ToUint8Array(b);

  if (bytesA.length !== bytesB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < bytesA.length; i++) {
    result |= bytesA[i] ^ bytesB[i];
  }
  return result === 0;
}

function toBase64(buffer: ArrayBuffer) {
function bufferToBase64(buffer: ArrayBuffer) {
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

async function computeTwilioSignature(authToken: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
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

export async function validateTwilio(
  formBody: string,
  requestUrl: string,
  signature: string | null,
  authToken: string | undefined
export async function validateTwilioSignature(
  authToken: string | undefined,
  requestUrl: string,
  params: URLSearchParams,
  signature: string | null
) {
  if (!authToken || !signature) {
    return false;
  }
  
  const payload = buildSignatureBase(new URL(requestUrl).toString(), formBody);
  const expected = await computeTwilioSignature(authToken, payload);
  return timingSafeEqual(signature, expected);
  const payload = buildSignatureBase(requestUrl, params);
  const expected = await computeTwilioSignature(authToken, payload);
  return timingSafeEqual(signature, expected);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToBase64(signature);
}

function parseUrlEncoded(body: string): ParameterMap {
  const searchParams = new URLSearchParams(body);
  const map: ParameterMap = {};
  for (const key of searchParams.keys()) {
    const values = searchParams.getAll(key);
    map[key] = values;
  }
  return map;
}

async function parseMultipart(request: Request): Promise<ParameterMap> {
  const formData = await request.formData();
  const map: ParameterMap = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(value);
    }
  }
  return map;
}

function buildSignaturePayload(url: string, map: ParameterMap, rawBody: string, contentType: string | null) {
  const hasParams = Object.keys(map).length > 0;
  if (hasParams && contentType !== 'application/json') {
    const sortedKeys = Object.keys(map).sort();
    let buffer = url;
    for (const key of sortedKeys) {
      for (const value of map[key]) {
        buffer += key + value;
      }
    }
    return buffer;
  }
  return url + (rawBody ?? '');
}

function toPayload(map: ParameterMap): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(map)) {
    if (!values.length) {
      continue;
    }
    payload[key] = values.length === 1 ? values[0] : values;
  }
  return payload;
}

function parseJsonPayload(rawBody: string): Record<string, unknown> {
  if (!rawBody) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (error) {
    throw new WebhookVerificationError('Invalid JSON payload', 400);
  }
}

function inferPayload(map: ParameterMap, rawBody: string, contentType: string | null): Record<string, unknown> {
  if (Object.keys(map).length > 0) {
    return toPayload(map);
  }
  if (contentType === 'application/json') {
    return parseJsonPayload(rawBody);
  }
  const trimmed = rawBody.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return parseJsonPayload(rawBody);
  }
  return {};
}

export async function verifyTwilioWebhookRequest(request: Request, authToken: string | undefined): Promise<TwilioVerificationResult> {
  if (!authToken) {
    throw new WebhookVerificationError('Twilio auth token not configured', 500);
  }

  const signature = request.headers.get(TWILIO_SIGNATURE_HEADER);
  if (!signature) {
    throw new WebhookVerificationError('Missing Twilio signature header', 403);
  }

  const contentType = parseContentType(request.headers.get('content-type'));
  const clone = request.clone();
  const rawBody = await request.text();

  let parameters: ParameterMap = {};
  if (contentType === 'application/x-www-form-urlencoded') {
    parameters = parseUrlEncoded(rawBody);
  } else if (contentType && contentType.startsWith('multipart/form-data')) {
    parameters = await parseMultipart(clone);
  } else if (!contentType && rawBody.includes('=')) {
    parameters = parseUrlEncoded(rawBody);
  }

  const payloadToSign = buildSignaturePayload(request.url, parameters, rawBody, contentType);
  const expectedSignature = await computeTwilioSignature(authToken, payloadToSign);

  if (!timingSafeEqualBase64(signature, expectedSignature)) {
    throw new WebhookVerificationError('Twilio signature verification failed', 403);
  }

  const payload = inferPayload(parameters, rawBody, contentType);

  return { payload };
}
