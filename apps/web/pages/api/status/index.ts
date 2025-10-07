import type { NextApiRequest, NextApiResponse } from 'next';
import { normalizeError } from '@ai-hairdresser/shared';
import { withApiObservability } from '@/lib/observability.server';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/observability/health`, {
      headers: {
        'x-platform-origin': 'next-web',
        'x-request-id': req.requestId ?? ''
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      req.logger?.warn('Status upstream error', { status: response.status, payload });
      return res.status(response.status).json(payload);
    }
    return res.status(200).json(payload);
  } catch (error) {
    req.logger?.error('Status proxy failed', { error: normalizeError(error) });
    return res.status(500).json({ error: 'Unexpected error', requestId: req.requestId });
  }
}

export default withApiObservability(handler);
