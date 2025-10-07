import { Router } from 'itty-router';
import { authRouter } from './routes/auth';
import { tenantRouter } from './routes/tenants';
import { appointmentRouter } from './routes/appointments';
import { messagingRouter } from './routes/messaging';
import { paymentRouter } from './routes/payments';
import { dashboardRouter } from './routes/dashboard';
import { webhooksRouter } from './routes/webhooks';
import { clientRouter } from './routes/clients';
import { stylistRouter } from './routes/stylists';
import { marketingRouter } from './routes/marketing';
import { withErrorHandling } from './middleware/error-handler';
import { withTenant } from './middleware/tenant';
import { withAuth } from './middleware/auth';
import { bookingRouter } from './routes/bookings';
import { assistRouter } from './routes/assist';
import { withBilling } from './middleware/billing';
import { billingRouter } from './routes/billing';

const router = Router();

router.get('/healthz', () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
router.all('/auth/*', authRouter.handle);
router.all('/tenants', tenantRouter.handle);
router.all('/tenants/*', tenantRouter.handle);
router.all('/appointments', appointmentRouter.handle);
router.all('/appointments/*', appointmentRouter.handle);
router.all('/bookings', bookingRouter.handle);
router.all('/bookings/*', bookingRouter.handle);
router.all('/clients', clientRouter.handle);
router.all('/clients/*', clientRouter.handle);
router.all('/stylists', stylistRouter.handle);
router.all('/stylists/*', stylistRouter.handle);
router.all('/messaging', messagingRouter.handle);
router.all('/messaging/*', messagingRouter.handle);
router.all('/assist', assistRouter.handle);
router.all('/assist/*', assistRouter.handle);
router.all('/payments', paymentRouter.handle);
router.all('/payments/*', paymentRouter.handle);
router.all('/dashboard', dashboardRouter.handle);
router.all('/dashboard/*', dashboardRouter.handle);
router.all('/marketing', marketingRouter.handle);
router.all('/marketing/*', marketingRouter.handle);
router.all('/billing', billingRouter.handle);
router.all('/billing/*', billingRouter.handle);
router.all('/webhooks', webhooksRouter.handle);
router.all('/webhooks/*', webhooksRouter.handle);

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext) {
  let scoped = request as TenantScopedRequest;

  const tenantResult = await withTenant(scoped, env, ctx);
  if (tenantResult instanceof Response) {
    return tenantResult;
  }
  scoped = tenantResult;

  const authResult = await withAuth(scoped, env, ctx);
  if (authResult instanceof Response) {
    return authResult;
  }
  scoped = authResult;

  const billingResult = await withBilling(scoped, env, ctx);
  if (billingResult instanceof Response) {
    return billingResult;
  }
  scoped = billingResult;

  return router.handle(scoped, env, ctx);
}

const handler = withErrorHandling(handleRequest);

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handler(request, env, ctx),
  scheduled: (event: ScheduledEvent, env: Env, ctx: ExecutionContext) =>
    import('./jobs/scheduler').then((m) => m.handleScheduled(event, env, ctx))
};
