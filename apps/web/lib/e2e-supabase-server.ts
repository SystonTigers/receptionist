import type { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  E2E_TENANT_EMAIL,
  E2E_TENANT_ID,
  E2E_TENANT_NAME,
  E2E_TENANT_SLUG,
  createE2EPublicSettingsSeed,
  createE2EServicesSeed,
  createE2ETenantRecord,
  createE2ETenantSettingsSeed
} from './e2e-test-data';

type ServerContext =
  | GetServerSidePropsContext
  | { req: NextApiRequest; res: NextApiResponse };

type SupabaseLikeClient = Pick<SupabaseClient, 'from'> & {
  auth: {
    getSession: () => Promise<{ data: { session: unknown }; error: null }>;
  };
};

type AdminSupabaseLikeClient = Pick<SupabaseClient, 'from'>;

function parseCookies(rawCookieHeader?: string): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader.split(';').reduce<Record<string, string>>((acc, chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) {
      return acc;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      acc[decodeURIComponent(trimmed)] = '';
      return acc;
    }
    const key = decodeURIComponent(trimmed.slice(0, separatorIndex));
    const value = decodeURIComponent(trimmed.slice(separatorIndex + 1));
    acc[key] = value;
    return acc;
  }, {});
}

function resolveRole(ctx: ServerContext): string {
  const cookieHeader = ctx.req?.headers?.cookie;
  const cookies = parseCookies(cookieHeader);
  return cookies['x-e2e-role'] || 'admin';
}

function createSession(role: string) {
  if (role === 'anonymous') {
    return null;
  }

  return {
    access_token: 'e2e-access-token',
    user: {
      email: E2E_TENANT_EMAIL,
      user_metadata: {
        tenant_id: E2E_TENANT_ID,
        role,
        timezone: 'Europe/London'
      }
    }
  };
}

export function createE2EServerSupabase(ctx: ServerContext): SupabaseLikeClient {
  const role = resolveRole(ctx);
  const servicesSeed = createE2EServicesSeed();
  const tenantSettingsSeed = createE2ETenantSettingsSeed();

  return {
    auth: {
      async getSession() {
        return { data: { session: createSession(role) }, error: null };
      }
    },
    from(table: string) {
      switch (table) {
        case 'services':
          return {
            select() {
              return {
                eq() {
                  return {
                    async order() {
                      return { data: servicesSeed, error: null };
                    }
                  };
                }
              };
            }
          };
        case 'tenant_settings':
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: tenantSettingsSeed, error: null };
                    }
                  };
                }
              };
            }
          };
        case 'tenants':
          return {
            select() {
              return {
                eq(_: string, value: string) {
                  return {
                    async maybeSingle() {
                      if (value === E2E_TENANT_SLUG) {
                        return { data: createE2ETenantRecord(), error: null };
                      }
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
        default:
          return {
            select() {
              return {
                eq() {
                  return {
                    async order() {
                      return { data: [], error: null };
                    },
                    async maybeSingle() {
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
      }
    }
  } as SupabaseLikeClient;
}

export function createE2EAdminSupabase(): AdminSupabaseLikeClient {
  const tenantRecord = createE2ETenantRecord();
  const servicesSeed = createE2EServicesSeed();
  const publicSettings = createE2EPublicSettingsSeed();

  return {
    from(table: string) {
      switch (table) {
        case 'tenants':
          return {
            select() {
              return {
                eq(_: string, value: string) {
                  return {
                    async maybeSingle() {
                      if (value === tenantRecord.slug) {
                        return { data: tenantRecord, error: null };
                      }
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
        case 'services':
          return {
            select() {
              return {
                eq(_: string, value: string) {
                  return {
                    async order() {
                      if (value === tenantRecord.id) {
                        return { data: servicesSeed, error: null };
                      }
                      return { data: [], error: null };
                    }
                  };
                }
              };
            }
          };
        case 'tenant_settings':
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: publicSettings, error: null };
                    }
                  };
                }
              };
            }
          };
        default:
          return {
            select() {
              return {
                eq() {
                  return {
                    async order() {
                      return { data: [], error: null };
                    },
                    async maybeSingle() {
                      return { data: null, error: null };
                    }
                  };
                }
              };
            }
          };
      }
    }
  } as AdminSupabaseLikeClient;
}
