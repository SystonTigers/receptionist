import { sendReminderMessages, purgeExpiredData, monitorSecurityEvents } from '../services/job-service';

export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const cron = event.cron ?? 'manual';
  console.log('Running scheduled job', cron);
  ctx.waitUntil(sendReminderMessages(env));
  ctx.waitUntil(purgeExpiredData(env));
  ctx.waitUntil(monitorSecurityEvents(env));
}
