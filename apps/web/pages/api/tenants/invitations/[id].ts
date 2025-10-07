import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing invitation id' });
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/tenants/me/invitations/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: req.headers.authorization ?? '',
        'x-tenant-id': req.headers['x-tenant-id'] as string,
        'x-user-role': req.headers['x-user-role'] as string,
        'x-platform-origin': 'next-web'
      }
    });

    if (response.status === 204) {
      return res.status(204).end();
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json(payload);
    }

    return res.status(response.status).json(payload);
  } catch (error) {
    console.error('Tenant invitation delete error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export default withTenantContext(handler);
