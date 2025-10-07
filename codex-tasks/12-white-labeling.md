---
id: "12"
title: "White-Labeling Support"
status: "pending"
priority: "medium"
category: "polish"
---

You are adding comprehensive white-labeling support so enterprise resellers can rebrand the AI receptionist platform for their own salon networks. The goal is to provide configurable themes, domain assets, legal copy, and billing ownership without code changes per reseller.

**Context**
- Tenant theming currently supports colors and logos but not typography, copy overrides, or email templates.
- Billing is processed via Stripe with a single account owned by us.
- Resellers require separate analytics, support contact info, and optional custom AI prompts.

**Objectives**
1. Extend the theming system to support reseller-level configuration (fonts, icon sets, layout variants) stored in Supabase and consumed by both dashboard and public widgets.
2. Implement dynamic email + SMS templates that reference reseller branding, legal text, and reply-to addresses. Provide a previewer in the dashboard.
3. Allow resellers to bring their own Stripe account via Stripe Connect, ensuring invoices and payouts are issued in their name while we retain platform fees.
4. Introduce a reseller admin portal to manage tenant onboarding, usage analytics, and AI prompt templates. Ensure RBAC prevents cross-reseller data leaks.
5. Document white-label provisioning steps, including domain setup, asset upload requirements, and billing reconciliation.

**Deliverables**
- Supabase schema updates, APIs, and caching strategy for reseller configs.
- Frontend updates for theming, template rendering, and preview flows.
- Stripe Connect onboarding flows, webhook handlers, and reconciliation jobs.
- Documentation for internal teams and reseller partners covering setup + ongoing maintenance.

Ensure the solution scales to dozens of resellers, avoids performance regressions, and keeps tenant data segregated.
