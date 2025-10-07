---
id: "09"
title: "Internal Admin Dashboard"
status: "pending"
priority: "medium"
category: "polish"
---

You are building an internal admin dashboard for our support and operations teams to monitor tenant health, track AI assistant performance, and manage escalations. This dashboard will be a restricted Next.js app hosted under `/admin` with Clerk SSO and Supabase row-level permissions.

**Context**
- Internal tooling is currently a mix of Supabase SQL Editor and manual scripts.
- We need visibility into message queues, error rates, and tenant billing status.
- Admins require fine-grained permissions (support, ops, finance).

**Objectives**
1. Scaffold a protected admin app route at `apps/web/app/admin` with middleware gating by Clerk roles and Supabase policies.
2. Create dashboards for tenant health (uptime, response latency, queue depth), financial metrics (MRR, churn risk), and AI quality (handoff rate, CSAT). Use our shared charting library.
3. Build management tools to resend failed webhooks, pause tenants, refund charges, and impersonate support accounts for debugging.
4. Integrate live logs + alerts from Cloudflare Workers and Supabase using server-sent events or WebSockets.
5. Document SOPs, permissions matrix, and troubleshooting guides for each admin role.

**Deliverables**
- Admin app route with modular pages, server actions, and API handlers.
- Secure backend endpoints enforcing RBAC and logging every action for auditing.
- Shared components for charts, tables, and activity feeds.
- Documentation + runbooks for support/ops teams including onboarding checklists.

Ensure the dashboard is performant, secure, and designed for quick iteration as new internal tools are added.
