import type { Role } from '@ai-hairdresser/shared';
import { JsonResponse } from './response';

const ROLE_PRIORITY: Record<Role, number> = {
  owner: 3,
  admin: 2,
  staff: 1,
  viewer: 0
};

export function hasRequiredRole(role: Role | undefined, allowed: Role[]): boolean {
  if (!role) {
    return false;
  }
  if (allowed.length === 0) {
    return true;
  }
  return allowed.includes(role);
}

export function requireRole(
  request: TenantScopedRequest,
  allowed: Role[],
  action: string
): Response | null {
  if (hasRequiredRole(request.role, allowed)) {
    return null;
  }

  const highestRequired = allowed.reduce<Role | null>((current, candidate) => {
    if (!current) {
      return candidate;
    }
    return ROLE_PRIORITY[candidate] > ROLE_PRIORITY[current] ? candidate : current;
  }, null);

  return JsonResponse.error('Forbidden', 403, {
    action,
    requiredRole: highestRequired,
    allowedRoles: allowed
  });
}
