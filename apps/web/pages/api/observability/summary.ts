import type { NextApiRequest, NextApiResponse } from 'next';
import { normalizeError } from '@ai-hairdresser/shared';
import { withTenantContext } from '@/lib/with-tenant-context';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/observability/summary`, {
      headers: {
        Authorization: req.headers.authorization ?? '',
        'x-tenant-id': req.headers['x-tenant-id'] as string,
        'x-platform-origin': 'next-web',
        'x-request-id': req.requestId ?? ''
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      req.logger?.warn('Observability summary upstream error', {
        status: response.status,
        payload
      });
      return res.status(response.status).json(payload);
    }

    req.logger?.info('Observability summary response delivered', {
      alerts: Array.isArray((payload as any).alerts) ? (payload as any).alerts.length : undefined
    });

    return res.status(200).json(payload);
  } catch (error) {
    req.logger?.error('Observability summary proxy failed', { error: normalizeError(error) });
    return res.status(500).json({ error: 'Unexpected error', requestId: req.requestId });
  }
}

export default withTenantContext(handler);
