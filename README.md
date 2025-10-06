# AI Hairdresser Receptionist – Multi-tenant SaaS Scaffold

This repository contains a production-ready scaffold for building an AI-powered receptionist platform for hair salons. It is designed for multi-tenant isolation on Supabase, integrates with Twilio, Stripe, Google Calendar, and OpenAI, and ships with a Next.js front-end and Cloudflare Worker API.

## Repository structure

```
.
├── apps/
│   └── web/               # Next.js 13 app (pages router)
├── workers/
│   └── api/               # Cloudflare Worker backend (TypeScript)
├── packages/
│   └── shared/            # Shared types, constants, validation schemas
├── supabase/
│   └── schema.sql         # Database schema + RLS policies
├── .env.example           # Environment variable template
├── package.json           # Root workspace configuration
└── README.md
```

## Getting started

1. **Clone & install**

   ```bash
   npm install
   ```

   The root `package.json` uses npm workspaces to manage dependencies for the web app, worker, and shared package.

2. **Environment configuration**

   Copy `.env.example` to `.env` and populate values from your Supabase project, Stripe, Twilio, Google, and OpenAI accounts. Expose required variables to Cloudflare via `wrangler secret put`.

3. **Supabase setup**

   * Create a new Supabase project.
   * Run `supabase/schema.sql` using the SQL editor or CLI to provision tables, helper functions, and Row-Level Security policies.
   * Configure [JWT custom claims](https://supabase.com/docs/guides/auth/auth-helpers/nextjs#setting-custom-claims) to include `tenant_id` for users.

4. **Run the web app**

   ```bash
   npm run dev:web
   ```

   Next.js will start on `http://localhost:3000`.

5. **Run the worker locally**

   ```bash
   cd workers/api
   npm install
   npm run dev
   ```

   Wrangler will proxy the Worker at `http://127.0.0.1:8787` by default.

6. **Linking front-end & backend**

   Configure `NEXT_PUBLIC_API_BASE_URL` to point to your Worker hostname (e.g. `http://127.0.0.1:8787`). The Next.js API routes act as a facade that forwards requests and injects tenant context.

## Multi-tenant isolation

* Every table stores a `tenant_id` column.
* Supabase RLS policies (see `supabase/schema.sql`) ensure tenants can only access their own rows via `get_auth_tenant_id()` helper.
* Worker middleware enforces tenant extraction from headers or JWT claims before handing requests to route handlers.
* Shared types include `tenantId` fields to maintain tenant awareness throughout the stack.

### Testing isolation

1. Create two tenants via `/auth/signup`.
2. Generate JWTs where the `tenantId` claim differs.
3. Hit the same API endpoints with different tokens and confirm only records for the matching tenant are returned.
4. Attempt cross-tenant access by altering the `x-tenant-id` header—the Worker should reject the request or Supabase RLS should block the query.

## Integrations & stubs

| Integration | Location | Notes |
|-------------|----------|-------|
| Twilio | `workers/api/src/integrations/twilio.ts` | Replace stubs with REST API calls (SMS, WhatsApp, voice). |
| Stripe | `workers/api/src/integrations/stripe.ts` | Implement PaymentIntent creation + webhook verification. |
| Google Calendar | `workers/api/src/integrations/google-calendar.ts` | Add OAuth flow + calendar sync logic. |
| OpenAI | `workers/api/src/integrations/openai.ts` | Swap placeholder with real chat/completions API call. |

## Background jobs

* Scheduled triggers are handled via the Worker `scheduled` event (`workers/api/src/jobs/scheduler.ts`).
* Add additional cron schedules in `wrangler.toml` (`[triggers] crons = ["0 * * * *"]`, etc.).
* `job-service.ts` contains stubs for reminder notifications and GDPR purge tasks.

## Admin & monitoring UI

* `/dashboard` shows key metrics (stub data).
* `/admin/monitoring` surfaces usage logs, manual overrides, and future broadcast controls.

## Deployment overview

1. **Supabase** – apply schema and policies.
2. **Worker** – configure `wrangler.toml` + secrets, then deploy with `npm run deploy:worker`.
3. **Web** – deploy Next.js app (e.g. Vercel). Make sure environment variables point to Worker endpoint and Supabase project.
4. **CI/CD** – integrate GitHub Actions or similar. Suggested pipeline:
   * Lint & build shared package.
   * Type-check Worker + Web.
   * Deploy Worker via Wrangler, then Web app.

## Extending the scaffold

* Add role-based UI gating using Supabase session metadata.
* Implement AI routing rules in `messaging-service.ts` (e.g. fallback thresholds, human takeover queue).
* Configure Stripe deposits in `payment-service.ts` using service-level deposit settings.
* Sync Google Calendar events per stylist, storing sync tokens for delta updates.
* Expand audit logging within each service to track user actions.

## Troubleshooting

* **401 errors** – confirm JWT contains `tenantId` and `role`. Update Worker `withAuth` to verify signatures once secret material is configured.
* **RLS denied** – ensure you run requests with Supabase service role key on the Worker or via authenticated Supabase client with custom claims.
* **Webhook verification** – implement Stripe signature check and Twilio request validation before processing payloads.

## Milestones / TODOs

1. **Auth hardening** – Issue and verify signed JWTs (`buildTenantToken`) and hash passwords using a stronger algorithm (e.g. bcrypt via external service).
2. **Appointments engine** – Replace placeholder availability logic with conflict detection, service duration calculations, and staff rota enforcement.
3. **Messaging automation** – Integrate Twilio API calls, add channel routing, and persist conversation state for AI/human handoff.
4. **Payments & deposits** – Implement Stripe PaymentIntent creation, confirmation webhooks, and transaction persistence + reconciliation.
5. **Calendar sync** – Implement Google OAuth and bi-directional event syncing per stylist with delta tokens.
6. **Admin tooling** – Build forms for broadcast messaging, override flows, and audit log viewers.
7. **Analytics** – Populate `usage_metrics` with real counters (messages sent, revenue, AI saves) and render visualizations on the dashboard.
8. **Compliance** – Flesh out GDPR purge routines, consent tracking, and data export endpoints.
