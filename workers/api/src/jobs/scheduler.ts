import { normalizeError } from '@ai-hairdresser/shared';

import { createSystemLogger } from '../lib/observability';
import { sendReminderMessages, purgeExpiredData, monitorSecurityEvents } from '../services/job-service';
import { runAnomalySweep } from '../services/observability-service';
import { processNotificationQueue } from '../services/notification-service';
import { runTenantOnboardingSweep } from '../services/onboarding-service';
import { aggregateUsageMetrics } from '../services/usage-service';

export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const cron = event.cron ?? 'manual';
  const logger = createSystemLogger({ component: 'scheduler' });
  logger.info('Running scheduled job', { cron });

  const tasks: Array<[string, () => Promise<unknown>]> = [
    ['sendReminderMessages', () => sendReminderMessages(env, logger)],
    ['purgeExpiredData', () => purgeExpiredData(env, logger)],
    ['processNotificationQueue', () => processNotificationQueue(env)],
    ['runTenantOnboardingSweep', () => runTenantOnboardingSweep(env)],
    ['aggregateUsageMetrics', () => aggregateUsageMetrics(env)],
    ['monitorSecurityEvents', () => monitorSecurityEvents(env)],
    ['runAnomalySweep', () => runAnomalySweep(env)]
  ];

  for (const [name, task] of tasks) {
    ctx.waitUntil(
      task().catch((error) => {
        logger.error(`${name} failed`, { error: normalizeError(error) });
      })
    );
  }
}
