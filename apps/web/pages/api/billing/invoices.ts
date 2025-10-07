import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/billing/invoices`, {
      headers: {
        Authorization: req.headers.authorization ?? '',
        'x-tenant-id': req.headers['x-tenant-id'] as string,
        'x-platform-origin': 'next-web'
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: (payload as Record<string, unknown>).error ?? 'Unable to fetch invoices' });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Billing invoices fetch error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default withTenantContext(handler);
