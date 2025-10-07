import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const target = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/tenants/me/plan`;
    const headers: Record<string, string> = {
      Authorization: (req.headers.authorization as string) ?? '',
      'x-tenant-id': req.headers['x-tenant-id'] as string,
      'x-platform-origin': 'next-web'
    };

    if (req.method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: payload.error ?? 'Unable to process request', details: payload.details });
    }

    return res.status(response.status).json(payload);
  } catch (error) {
    console.error('Tenant plan proxy error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default withTenantContext(handler);
