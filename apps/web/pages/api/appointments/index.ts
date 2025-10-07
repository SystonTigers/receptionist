import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method === 'GET') {
    try {
      const response = await fetch(`${baseUrl}/appointments`, {
        headers: {
          Authorization: req.headers.authorization ?? '',
          'x-tenant-id': req.headers['x-tenant-id'] as string,
          'x-platform-origin': 'next-web'
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json(payload);
      }
      return res.status(200).json(payload);
    } catch (error) {
      console.error('Appointments fetch error', error);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }
}

export default withTenantContext(handler);
