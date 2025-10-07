
import { normalizeError } from '@ai-hairdresser/shared';
import { createSystemLogger } from '../lib/observability';
import { sendReminderMessages, purgeExpiredData } from '../services/job-service';
import { runAnomalySweep } from '../services/observability-service';

export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const cron = event.cron ?? 'manual';
  const logger = createSystemLogger({ component: 'scheduler', cron });
  logger.info('Running scheduled job', { cron });
  ctx.waitUntil(
    sendReminderMessages(env, logger).catch((error) =>
      logger.error('sendReminderMessages failed', { error: normalizeError(error) })
    )
  );
  ctx.waitUntil(
    purgeExpiredData(env, logger).catch((error) =>
      logger.error('purgeExpiredData failed', { error: normalizeError(error) })
    )
  );
  ctx.waitUntil(
    runAnomalySweep(env).catch((error) =>
      logger.error('runAnomalySweep failed', { error: normalizeError(error) })
    )
  );

import { sendReminderMessages, purgeExpiredData, monitorSecurityEvents } from '../services/job-service';

import { sendReminderMessages, purgeExpiredData } from '../services/job-service';
import { processNotificationQueue } from '../services/notification-service';
import { runTenantOnboardingSweep } from '../services/onboarding-service';
import { aggregateUsageMetrics } from '../services/usage-service';


export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const cron = event.cron ?? 'manual';
  console.log('Running scheduled job', cron);
  ctx.waitUntil(sendReminderMessages(env));
  ctx.waitUntil(purgeExpiredData(env));
  ctx.waitUntil(processNotificationQueue(env));
  ctx.waitUntil(runTenantOnboardingSweep(env));

  ctx.waitUntil(monitorSecurityEvents(env));

  ctx.waitUntil(aggregateUsageMetrics(env));

}
