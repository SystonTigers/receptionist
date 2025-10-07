import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/billing/portal`, {
      method: 'POST',
      headers: {
        Authorization: req.headers.authorization ?? '',
        'x-tenant-id': req.headers['x-tenant-id'] as string,
        'x-platform-origin': 'next-web',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ returnUrl: (req.body as { returnUrl?: string } | undefined)?.returnUrl })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: (payload as Record<string, unknown>).error ?? 'Unable to create billing portal session' });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Billing portal session error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default withTenantContext(handler);
