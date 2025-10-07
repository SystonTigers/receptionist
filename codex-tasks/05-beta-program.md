---
id: "05"
title: "Beta Program Workflow"
status: "pending"
priority: "medium"
category: "growth"
---

You are establishing an end-to-end beta program workflow so product managers can invite select salons to preview experimental AI receptionist features. The system needs to handle cohort enrollment, feature flagging, feedback collection, and automated reporting.

**Context**
- Feature flags currently live in LaunchDarkly with a simple on/off per tenant toggle.
- Feedback is collected manually via Notion and Slack, lacking structure.
- Supabase stores tenant tiers and plan data that can be used to filter eligible beta participants.

**Objectives**
1. Extend the feature flag integration to support named beta cohorts with automated enrollment rules. Add support for staged rollouts and dynamic targeting expressions.
2. Build a beta management UI at `apps/web/app/(dashboard)/settings/beta-program` where admins can invite tenants, monitor engagement, and view aggregated sentiment scores.
3. Create backend APIs and Supabase tables to store beta invitations, acceptance status, and feedback notes tagged by feature flag key.
4. Integrate an in-app feedback widget that surfaces beta-specific surveys in the Inbox and collects qualitative feedback stored via Supabase Functions.
5. Generate weekly beta health reports delivered via email and Slack summarizing enrollment, usage metrics (from PostHog), and outstanding issues.

**Deliverables**
- LaunchDarkly integration updates, Supabase schema additions, and worker jobs to orchestrate invites + reminders.
- Dashboard components, charts, and feedback UI with proper RBAC (product + support roles only).
- Automated reports implemented via existing notifications service with templates stored in the repo.
- Documentation describing how to start/stop a beta, invite tenants, and interpret analytics dashboards.

Ensure the workflow is extensible to multiple simultaneous betas and complies with tenant data isolation rules.
