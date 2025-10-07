---
id: "08"
title: "CI/CD & Deployment Automation"
status: "pending"
priority: "medium"
category: "infrastructure"
---

You are responsible for maturing the CI/CD pipeline so every commit can be safely deployed to production with minimal manual steps. The stack uses GitHub Actions, Vercel for the Next.js app, Cloudflare Workers for APIs, and Supabase migrations.

**Context**
- Current pipelines run lint/test but deployments are still triggered manually.
- Database migrations are applied manually via Supabase CLI.
- Rollbacks require multiple commands and lack observability.

**Objectives**
1. Consolidate CI workflows into `.github/workflows/release.yml` that runs unit tests, linting, type checks, and integration tests with caching + parallelization.
2. Automate Supabase migrations applying via GitHub Actions with safe-guard prompts and automatic backups before applying to production.
3. Add deployment stages: preview (per PR), staging (merge to main), and production (manual approval) for both Vercel and Cloudflare Worker targets.
4. Integrate automated smoke tests post-deploy using Playwright against staging, reporting status back to GitHub.
5. Implement observability hooks (Datadog or Sentry) to capture release metadata, deploy duration, and rollback commands.

**Deliverables**
- Updated GitHub Actions workflows, environment secrets documentation, and runbook for operations.
- Scripts or CLI utilities invoked by CI to handle migrations, environment promotion, and rollbacks.
- Playwright smoke test suite with clear failure diagnostics.
- Dashboards/alerts that notify the team on failed deployments or slow rollouts.

Ensure the pipeline is idempotent, secure (no plain-text secrets), and supports multi-tenant configuration differences per environment.
