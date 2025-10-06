import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function summaryHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/dashboard/summary`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.authorization ?? '',
        'x-tenant-id': req.headers['x-tenant-id'] as string,
        'x-platform-origin': 'next-web'
      }
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: payload.error ?? 'Unable to fetch summary' });
    }

    const payload = await response.json();
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Dashboard summary error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default withTenantContext(summaryHandler);
