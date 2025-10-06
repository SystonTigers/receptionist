import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const tenantId = req.headers['x-tenant-id'] as string;
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/messaging/outbound`, {
      method: 'POST',
      headers: {
        Authorization: req.headers.authorization ?? '',
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json',
        'x-platform-origin': 'next-web'
      },
      body
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json(payload);
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Messaging outbound API error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default withTenantContext(handler);
