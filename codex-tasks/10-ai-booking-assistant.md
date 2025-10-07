---
id: "10"
title: "AI Booking Assistant & GPT Auto-Replies"
status: "pending"
priority: "high"
category: "growth"
---

You are shipping the next iteration of our AI booking assistant that can automatically respond to inquiries, capture structured booking details, and sync confirmed appointments into the salon's calendar. The assistant should operate across SMS, web chat, and email channels.

**Context**
- The AI pipeline is powered by OpenAI GPT-4o with function calling to our scheduling APIs.
- Appointments are stored in Supabase and mirrored to Google Calendar via a background worker.
- Human receptionists can override AI decisions and should remain in control when the AI is uncertain.

**Objectives**
1. Design conversational flows that collect client intent, preferred stylist, service, and timing. Implement guardrails for PII and compliance.
2. Build GPT function schemas for booking creation, rescheduling, and cancellation that integrate with Supabase RPCs. Ensure validation + conflict detection.
3. Implement channel adapters (SMS via Twilio, email via SendGrid, web chat existing widget) that feed into the same AI core and emit standardized events.
4. Add human-in-the-loop controls in the dashboard Inbox so staff can approve, edit, or reject AI-generated bookings with context.
5. Measure AI performance with metrics (autonomous booking rate, fallback rate, average handling time) and surface them in analytics dashboards.

**Deliverables**
- Updated AI orchestration code, function definitions, and worker handlers.
- Channel adapters with retry/backoff, logging, and observability.
- Inbox UI enhancements supporting approval workflows and timeline visualization.
- Documentation covering prompt design, testing scripts, and rollback procedures.

Ensure the assistant maintains high accuracy, gracefully escalates to humans, and complies with salon policy constraints.
