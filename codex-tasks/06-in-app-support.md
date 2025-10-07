---
id: "06"
title: "In-App Support / Live Chat"
status: "pending"
priority: "medium"
category: "growth"
---

You are creating a native in-app support experience so salon owners can chat with our success team without leaving the receptionist dashboard. The solution should blend AI triage with human takeover and integrate with our existing Intercom + Slack workflows.

**Context**
- We currently link out to an external help center; there is no embedded widget.
- The AI receptionist already has a conversation pipeline that can be reused for classification and response suggestions.
- Support agents operate out of Slack using a custom bot that mirrors conversations from Supabase.

**Objectives**
1. Build a persistent support widget accessible from any dashboard page that opens a side-panel chat. Persist conversation state per user and device.
2. Implement AI triage that suggests responses using our GPT-4o function calling setup. Responses should auto-tag by topic and escalate to human agents if confidence is below a threshold.
3. Integrate with Slack via the existing bot to notify agents of new escalations, including conversation context and user metadata. Allow two-way syncing of messages.
4. Add support analytics (response times, CSAT) to the admin dashboard, backed by new Supabase tables and scheduled jobs to compute metrics.
5. Document SLAs, runbooks for escalation, and how to test the AI fallback flows locally.

**Deliverables**
- React components for the support widget, conversation store, and notifications.
- Worker endpoints for AI triage, Slack sync, and conversation persistence with rate limiting and error handling.
- Analytics dashboards and background jobs generating KPIs.
- Documentation for support and engineering teams, including feature flags and rollout strategy.

Ensure the experience is real-time, accessible, and respects tenant isolation rules. Provide unit tests where critical (AI classification, Slack sync handlers).
