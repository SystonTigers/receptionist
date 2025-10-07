---
id: "02"
title: "PWA Support"
status: "pending"
priority: "high"
category: "infrastructure"
---

You are responsible for delivering robust Progressive Web App support for the AI receptionist dashboard so salons can install it on tablets at the front desk. The app is built with Next.js 14 (App Router) deployed on Vercel, uses Supabase for authentication, and relies on a Worker backend for realtime notifications.

**Context**
- The web workspace currently lacks a service worker and manifest configuration.
- Push notifications will later be handled via the existing Worker API, but this task should unblock installation and offline basics first.
- We support multi-tenant branding so PWA metadata must read tenant-specific colors and icons from Supabase storage.

**Objectives**
1. Create a Web App Manifest in `apps/web/public/manifest.webmanifest` with dynamic values generated at request time via Next.js metadata API. Include icons, theme colors, shortcuts, and related applications.
2. Implement a TypeScript service worker using Workbox (or a custom caching strategy) compiled to `public/sw.js`. Cache shell assets, fonts, and API responses required for the offline appointment list.
3. Wire up automatic service worker registration in the dashboard layout with retry/backoff logic, including `beforeinstallprompt` UX to encourage installation.
4. Provide a tenant-aware theming mechanism so manifest icons/colors update per tenant slug (pull from Supabase storage and fall back gracefully).
5. Document testing steps covering Lighthouse PWA audits, offline navigation, and install flows on Chrome + Safari iOS.

**Deliverables**
- Manifest, service worker, and registration code committed with clear comments.
- Integration tests or manual QA notes proving offline appointment access works.
- Updated documentation outlining how to add new tenant icons and what files must be uploaded.

Ensure the solution is compatible with Next.js static asset pipeline and does not block SSR. Provide guidance on cache invalidation during deploys.
