import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

  if (req.method === 'GET') {
    try {
      const response = await fetch(`${baseUrl}/tenants/me/users`, {
        headers: {
          Authorization: req.headers.authorization ?? '',
          'x-tenant-id': req.headers['x-tenant-id'] as string,
          'x-user-role': req.headers['x-user-role'] as string,
          'x-platform-origin': 'next-web'
        }
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json(payload);
      }

      return res.status(200).json(payload);
    } catch (error) {
      console.error('Tenant users fetch error', error);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const response = await fetch(`${baseUrl}/tenants/me/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization ?? '',
          'x-tenant-id': req.headers['x-tenant-id'] as string,
          'x-user-role': req.headers['x-user-role'] as string,
          'x-platform-origin': 'next-web'
        },
        body: JSON.stringify(req.body ?? {})
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json(payload);
      }

      return res.status(response.status).json(payload);
    } catch (error) {
      console.error('Tenant invite create error', error);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

export default withTenantContext(handler);
