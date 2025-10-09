import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AuditLog } from '@ai-hairdresser/shared';

type AuditLogInsert = {
  tenantId: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
};

type AuditLogRow = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  user?: Array<{
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }> | null;
};

function getClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

function sanitisePayload<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    console.warn('Failed to sanitise audit payload', error);
    return value;
  }
}

export async function recordAuditLog(env: Env, entry: AuditLogInsert) {
  const client = getClient(env);
  const payload = {
    tenant_id: entry.tenantId ?? null,
    user_id: entry.userId ?? null,
    action: entry.action,
    resource: entry.resource,
    resource_id: entry.resourceId ?? null,
    before: entry.before ? sanitisePayload(entry.before) : null,
    after: entry.after ? sanitisePayload(entry.after) : null
  };

  try {
    const { error } = await client.from('audit_logs').insert(payload);
    if (error) {
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to record audit log', {
      message,
      action: entry.action,
      resource: entry.resource
    });
  }
}

export async function fetchRecentAuditLogs(env: Env, tenantId: string, limit = 50): Promise<AuditLog[]> {
  const client = getClient(env);
  const { data, error } = await client
    .from('audit_logs')
    .select(
      `id, tenant_id, user_id, action, resource, resource_id, before, after, created_at, user:users(id, email, first_name, last_name)`
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  return (data as AuditLogRow[] | null)?.map((row) => {
    const userRecord = Array.isArray(row.user) ? row.user[0] ?? null : row.user ?? null;
    const fullName =
      userRecord && (userRecord.first_name || userRecord.last_name)
        ? [userRecord.first_name, userRecord.last_name].filter(Boolean).join(' ').trim() || null
        : null;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resource_id,
      before: row.before,
      after: row.after,
      createdAt: row.created_at,
      userEmail: userRecord?.email ?? null,
      userName: fullName
    } satisfies AuditLog;
  }) ?? [];
}

export async function listAuditLogsSince(env: Env, sinceIso: string) {
  const client = getClient(env);
  const { data, error } = await client
    .from('audit_logs')
    .select('id, tenant_id, user_id, action, resource, resource_id, before, after, created_at')
    .gte('created_at', sinceIso);

  if (error) {
    throw new Error(`Failed to list audit logs since ${sinceIso}: ${error.message}`);
  }

  return (data ?? []) as AuditLogRow[];
}

export type AuditLogAlert = {
  type: 'failed_login_spike' | 'configuration_churn';
  tenantId: string | null;
  count: number;
  windowStart: string;
  windowEnd: string;
  identifier?: string;
};

export function detectSuspiciousPatterns(
  logs: AuditLogRow[],
  windowStart: string,
  windowEnd: string
): AuditLogAlert[] {
  const alerts: AuditLogAlert[] = [];

  const failedLoginGroups = new Map<string, AuditLogRow[]>();
  for (const log of logs.filter((row) => row.action === 'auth.failed_login')) {
    const after = log.after ?? {};
    const identifier = typeof after['hashedIdentifier'] === 'string' ? after['hashedIdentifier'] : 'unknown';
    const key = `${log.tenant_id ?? 'global'}:${identifier}`;
    const bucket = failedLoginGroups.get(key) ?? [];
    bucket.push(log);
    failedLoginGroups.set(key, bucket);
  }

  for (const [key, bucket] of failedLoginGroups.entries()) {
    if (bucket.length >= 5) {
      const [tenantPart, identifier] = key.split(':');
      alerts.push({
        type: 'failed_login_spike',
        tenantId: tenantPart === 'global' ? null : tenantPart,
        count: bucket.length,
        windowStart,
        windowEnd,
        identifier: identifier ?? 'unknown'
      });
    }
  }

  const configChanges = new Map<string, number>();
  for (const log of logs.filter((row) => row.resource === 'tenant_settings')) {
    const key = log.tenant_id ?? 'unknown';
    configChanges.set(key, (configChanges.get(key) ?? 0) + 1);
  }

  for (const [tenantKey, count] of configChanges.entries()) {
    if (count >= 3) {
      alerts.push({
        type: 'configuration_churn',
        tenantId: tenantKey === 'unknown' ? null : tenantKey,
        count,
        windowStart,
        windowEnd
      });
    }
  }

  return alerts;
}
