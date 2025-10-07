import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { withApiObservability } from './observability.server';

/**
 * Wrap Next.js API routes to ensure tenant context is available.
 * In production, populate tenantId via Supabase session / JWT claims.
 */
export function withTenantContext(handler: NextApiHandler): NextApiHandler {
  return withApiObservability(async function tenantAwareHandler(req: NextApiRequest, res: NextApiResponse) {
    const tenantId = (req.headers['x-tenant-id'] as string) ?? (req.query.tenantId as string);
    if (!tenantId) {
      req.logger?.warn('Missing tenant context on API request');
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // TODO: Validate JWT / session and ensure tenantId matches token claims
    req.headers['x-tenant-id'] = tenantId;
    req.tenantId = tenantId;
    return handler(req, res);
  });
}
