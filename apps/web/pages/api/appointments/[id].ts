import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing appointment id' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  const targetUrl = `${baseUrl}/appointments/${id}`;

  if (req.method === 'GET') {
    try {
      const response = await fetch(targetUrl, {
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
      console.error('Appointment fetch error', error);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const response = await fetch(targetUrl, {
        method: req.method,
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
      return res.status(200).json(payload);
    } catch (error) {
      console.error('Appointment update error', error);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const response = await fetch(targetUrl, {
        method: 'DELETE',
        headers: {
          Authorization: req.headers.authorization ?? '',
          'x-tenant-id': req.headers['x-tenant-id'] as string,
          'x-user-role': req.headers['x-user-role'] as string,
          'x-platform-origin': 'next-web'
        }
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return res.status(response.status).json(payload);
      }
      return res.status(204).end();
    } catch (error) {
      console.error('Appointment delete error', error);
      return res.status(500).json({ error: 'Unexpected error' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

export default withTenantContext(handler);

