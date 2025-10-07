---
id: "11"
title: "Google Calendar & Zapier Integration"
status: "pending"
priority: "medium"
category: "growth"
---

You are enabling native integrations with Google Calendar and Zapier so salons can sync bookings to their calendars and automate follow-up workflows. The solution should include OAuth flows, event syncing, and Zapier triggers/actions.

**Context**
- Appointments are stored in Supabase and currently mirrored to Google Calendar using a service account (single calendar).
- Tenants want to connect their own Google Workspace calendars and create Zaps for marketing automation.
- We use Cloudflare Workers for backend APIs and Supabase for storing credentials.

**Objectives**
1. Implement OAuth 2.0 flows allowing tenants to connect Google Calendar accounts, storing tokens securely with rotation and revocation support.
2. Build a syncing service that maps Supabase appointments to Google Calendar events per tenant, handling retries, conflict resolution, and webhook push notifications.
3. Develop Zapier integration with triggers (New Appointment, AI Escalation, Missed Call) and actions (Create Appointment, Send AI Reply). Provide CLI tooling to manage Zapier secrets and schema.
4. Update dashboard settings UI to manage connected integrations, view sync status, and force resyncs.
5. Document security considerations, scopes requested, and troubleshooting steps for expired tokens or Zap failures.

**Deliverables**
- OAuth handlers, Supabase tables, and worker jobs for Google Calendar sync.
- Zapier app definition, TypeScript code for triggers/actions, and deployment instructions.
- Dashboard UI components for managing integrations and viewing sync logs.
- Documentation for onboarding, security review, and support troubleshooting.

Ensure data privacy, tenant isolation, and rate limit compliance for both Google and Zapier APIs.
