---
id: "04"
title: "GDPR & Legal Compliance Tools"
status: "pending"
priority: "high"
category: "compliance"
---

You are adding comprehensive GDPR tooling so European salon tenants can confidently use the AI receptionist while meeting regulatory requirements. This includes data export, right-to-be-forgotten workflows, consent capture, and audit trails.

**Context**
- Customer data resides in Supabase Postgres with row-level security per tenant and is synced to the AI assistant via Supabase Functions.
- Current legal settings only allow toggling marketing opt-in at signup; there is no centralized consent ledger.
- We already use Clerk for auth in the dashboard but rely on Supabase for tenant data storage.

**Objectives**
1. Design and implement a `compliance` schema in Supabase to store consent receipts, privacy policy versions, and audit events. Create migrations, types, and triggers to keep data consistent.
2. Build an in-dashboard GDPR console under `apps/web/app/(dashboard)/settings/compliance` where admins can initiate data export/erasure requests, view consent history, and download audit logs (CSV + JSON).
3. Create background jobs in the Worker API to process export and deletion tasks, including anonymizing personal data across all relevant tables (appointments, messages, AI transcripts). Provide dry-run mode and notifications.
4. Implement consent capture APIs that integrate with the receptionist chat widget to store timestamped consents linked to session IDs. Update the chat widget to display localized consent banners when required.
5. Document legal workflows with diagrams and runbooks, including how to respond to data subject access requests within 30 days and how to configure policy versions per tenant.

**Deliverables**
- Supabase migrations and types for compliance schema plus automated tests verifying data integrity.
- Dashboard UI with secure download links and RBAC gating to compliance admins only.
- Worker jobs with retry logic, thorough logging, and notifications to admins when tasks complete.
- Comprehensive documentation for legal, support, and engineering stakeholders.

Ensure all workflows are fully auditable, protect personally identifiable information, and meet GDPR Article 30 record-keeping requirements.
