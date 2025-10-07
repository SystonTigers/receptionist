---
id: "01"
title: "Responsive UI & UX Polish"
status: "pending"
priority: "high"
category: "polish"
---

You are designing a comprehensive responsive polishing pass for the multi-tenant AI salon receptionist web app built with Next.js 14, React Server Components, Tailwind CSS, and Supabase auth. The product serves salon owners who manage multiple locations and receptionists that triage bookings. The goal is to deliver a production-ready user experience across desktop, tablet, and mobile breakpoints.

**Context**
- The main navigation currently lives in `apps/web/app/(dashboard)` and provides entry points for Inbox, Calendar, Automations, and Billing.
- Component primitives live in `packages/shared/ui` and should remain the single source of truth for typography, colors, spacing, and interactive states.
- Dark mode is already available via the design tokens but is inconsistently applied across pages.

**Objectives**
1. Audit every page and shared layout in the dashboard bundle to ensure fluid responsive behavior (including 2-column -> 1-column transitions, overflow handling, and touch-safe hit targets).
2. Harmonize typography scale, color usage, and component spacing against the design tokens. Update Tailwind config or shared components if new tokens are required.
3. Implement accessible focus states, form labels, and ARIA attributes for all interactive elements. Verify using Lighthouse or axe-core that no WCAG AA blocker remains.
4. Extend the shared `ThemeProvider` to support smooth dark/light mode transitions and ensure there are no visual regressions when toggling themes.
5. Document the final responsive layout guidelines in `apps/web/docs/ui-guidelines.md` (create the file if missing) with screenshots or Figma links supplied via config.

**Deliverables**
- Updated React components, Tailwind styles, and shared UI primitives delivering pixel-perfect responsive layouts.
- An updated design token set (if needed) with migration notes.
- Accessibility fixes validated by automated tooling (attach report summary in PR).
- A written UI guideline document summarizing breakpoints, spacing, and theme recommendations.

Assume you can run `npm run lint:web` and `npm run test:e2e` to confirm regressions. Collaborate closely with design but keep implementation self-contained.
