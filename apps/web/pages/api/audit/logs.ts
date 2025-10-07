import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const targetUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/audit/logs`;

  try {
    if (req.method === 'GET') {
      const response = await fetch(targetUrl, {
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
    }

    if (req.method === 'POST') {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: req.headers.authorization ?? '',
          'x-tenant-id': req.headers['x-tenant-id'] as string,
          'content-type': 'application/json',
          'x-platform-origin': 'next-web'
        },
        body: JSON.stringify(req.body ?? {})
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json(payload);
      }

      return res.status(200).json(payload);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('Audit logs proxy error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default withTenantContext(handler);
