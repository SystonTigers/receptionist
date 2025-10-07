import { sendReminderMessages, purgeExpiredData } from '../services/job-service';
import { processNotificationQueue } from '../services/notification-service';
import { runTenantOnboardingSweep } from '../services/onboarding-service';

export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const cron = event.cron ?? 'manual';
  console.log('Running scheduled job', cron);
  ctx.waitUntil(sendReminderMessages(env));
  ctx.waitUntil(purgeExpiredData(env));
  ctx.waitUntil(processNotificationQueue(env));
  ctx.waitUntil(runTenantOnboardingSweep(env));
}
