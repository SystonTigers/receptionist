import type { RequestLogger } from '@ai-hairdresser/shared';

declare module 'next' {
  interface NextApiRequest {
    requestId?: string;
    tenantId?: string;
    logger?: RequestLogger;
  }
}
