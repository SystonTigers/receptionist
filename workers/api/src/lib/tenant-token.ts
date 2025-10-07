import { decodeJwt, JWTPayload } from 'jose';
import type { Role } from '@ai-hairdresser/shared';

interface TenantTokenPayload extends JWTPayload {
  tenantId: string;
  role: Role;
}

function toBase64Url(value: string) {
  return btoa(value).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function verifyTenantToken(token: string, signingKey: string): Promise<TenantTokenPayload> {
  // TODO: Use jose jwtVerify with signingKey once key material configured
  const decoded = decodeJwt(token) as TenantTokenPayload;
  if (!decoded.tenantId) {
    throw new Error('Invalid tenant token');
  }
  return decoded;
}

export function buildTenantToken(payload: TenantTokenPayload): string {
  // TODO: Issue JWT using jose.SignJWT and MULTITENANT_SIGNING_KEY
  const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = toBase64Url(JSON.stringify(payload));
  return `${header}.${body}.`;
}
