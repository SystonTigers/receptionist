---
id: "07"
title: "Developer CLI & Tenant Tools"
status: "pending"
priority: "medium"
category: "infrastructure"
---

You are delivering a developer-focused CLI and tooling suite to streamline tenant onboarding, local development, and operational tasks. The CLI should be built with Node.js + TypeScript, distributed via npm within the monorepo, and integrate with Supabase + Cloudflare APIs.

**Context**
- Engineers currently run ad-hoc scripts for seeding tenants, managing webhooks, and invoking background jobs.
- There is no single source of truth for environment configuration across workspaces.
- We use pnpm workspaces in CI, but developers often rely on `npm` locally.

**Objectives**
1. Create a `packages/cli` workspace that exports a `receptionist` CLI with commands for tenant bootstrap, data seeding, log tailing, and queue inspection.
2. Implement shared config loading (dotenv + Supabase typed env) with validation and helpful error messages.
3. Add commands to invoke Cloudflare Worker routes, Supabase edge functions, and AI pipeline dry runs. Provide human-friendly output and JSON modes for automation.
4. Integrate authentication using personal access tokens stored in 1Password. Provide docs on how to create and rotate these tokens.
5. Update developer onboarding docs to reference the new CLI, including examples, shell completions, and troubleshooting tips.

**Deliverables**
- A fully documented CLI package with unit tests and typed command definitions (e.g., using oclif or commander).
- Shared config utilities reused by other scripts to eliminate duplication.
- Updated READMEs and onboarding guides pointing to the CLI as the canonical toolset.
- CI step ensuring the CLI builds successfully and lint/tests pass.

Design the CLI to be extensible, safe (no destructive operations without confirmations), and friendly for junior engineers.
