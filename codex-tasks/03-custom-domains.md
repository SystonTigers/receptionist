---
id: "03"
title: "Custom Domains for Tenants"
status: "pending"
priority: "high"
category: "growth"
---

You are implementing custom domain support so each salon tenant can map their own receptionist portal to a branded hostname (e.g., `reception.salonname.com`). The stack uses Next.js on Vercel for the frontend, Cloudflare Workers for APIs, and Supabase for tenant metadata.

**Context**
- Tenant records already include `vanity_hostname` and SSL certificate provisioning status fields, but we do not yet orchestrate domain verification or routing.
- Vercel supports wildcard domain routing via the Projects API, and Cloudflare handles DNS and certificate issuance.
- The receptionist portal must respect tenant-specific theme and legal footer content when served under a custom domain.

**Objectives**
1. Build an admin workflow in `apps/web/app/(dashboard)/settings/domains` allowing tenants to request, verify, and activate a custom domain. Include validation for CNAME/A record requirements and status polling.
2. Implement backend orchestration in `workers/api/src/routes/domains.ts` that calls Cloudflare and Vercel APIs to provision DNS records, request certificates, and attach domains to the Vercel project.
3. Securely store API credentials in Supabase secrets or environment variables, and design retry-safe jobs for certificate issuance using our existing queue system.
4. Update Supabase tenant metadata when domain status changes (pending → verifying → active) and emit audit logs for compliance.
5. Add documentation and support tooling (`scripts/domains.ts`) to re-sync domains in case of drift, including CLI usage examples.

**Deliverables**
- A tenant-facing UI/UX for managing custom domains with real-time validation feedback.
- Worker routes and background jobs orchestrating DNS + SSL provisioning with error handling and observability metrics.
- Updated Supabase schema migrations, types, and seeds reflecting domain lifecycle fields.
- Playbook docs describing how support can troubleshoot failed verifications and roll back domains safely.

Ensure the feature is idempotent, resilient to API rate limits, and fully auditable. Include automated tests where feasible.
