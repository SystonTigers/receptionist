import { apiFetch } from './api-client';

type AuditLogPayload = {
  action: string;
  resource: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
};

export async function logAuditEvent(payload: AuditLogPayload) {
  try {
    await apiFetch('/audit/logs', {
      method: 'POST',
      body: payload
    });
  } catch (error) {
    console.error('Failed to record audit event', error);
  }
}
