import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

/**
 * Wrap Next.js API routes to ensure tenant context is available.
 * In production, populate tenantId via Supabase session / JWT claims.
 */
export function withTenantContext(handler: NextApiHandler): NextApiHandler {
  return async function tenantAwareHandler(req: NextApiRequest, res: NextApiResponse) {
    const tenantId = (req.headers['x-tenant-id'] as string) ?? (req.query.tenantId as string);
    if (!tenantId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // TODO: Validate JWT / session and ensure tenantId matches token claims
    req.headers['x-tenant-id'] = tenantId;
    return handler(req, res);
  };
}
