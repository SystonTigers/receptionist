import useSWR from 'swr';
import type { Role, TenantUserInvitation } from '@ai-hairdresser/shared';
import { apiFetch } from '@/lib/api-client';

export interface TenantUserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

interface TenantUsersResponse {
  users: { id: string; email: string; first_name: string; last_name: string; role: Role }[];
  invitations: {
    id: string;
    email: string;
    role: Role;
    status: TenantUserInvitation['status'];
    token: string;
    invited_by: string | null;
    accepted_by: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
  }[];
}

function transformResponse(payload: TenantUsersResponse) {
  return {
    users: payload.users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    })),
    invitations: payload.invitations.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      token: invite.token,
      invitedBy: invite.invited_by ?? undefined,
      acceptedBy: invite.accepted_by ?? undefined,
      expiresAt: invite.expires_at ?? undefined,
      createdAt: invite.created_at,
      updatedAt: invite.updated_at
    }))
  };
}

export function useTenantUsers() {
  const { data, error, isLoading, mutate } = useSWR('/tenants/users', async (path: string) => {
    const payload = await apiFetch<TenantUsersResponse>(path);
    return transformResponse(payload);
  });

  return {
    users: data?.users ?? [],
    invitations: data?.invitations ?? [],
    loading: isLoading,
    error,
    mutate
  };
}
