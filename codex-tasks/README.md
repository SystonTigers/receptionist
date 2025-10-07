# Codex Task Automation System

This directory contains the structured prompts and metadata that drive the autonomous Codex task workflow for the AI salon receptionist platform. Each task is expressed as a Markdown file with YAML frontmatter describing its identity, priority, category, and status.

## Directory Layout

- `01-*.md` … `12-*.md` — Individual task briefs written for Codex operators. Frontmatter is always synchronized with the machine index.
- `index.json` — Machine-readable list of every task with key metadata for pipelines.
- `README.md` — This guide.

## Usage

1. Install dependencies and ensure TypeScript support is available in the repo (see root `package.json`).
2. Run the Codex task runner to surface the next pending task:
   ```bash
   ts-node scripts/run-codex-task.ts
   ```
   or via npm script:
   ```bash
   npm run codex
   ```
3. Follow the interactive prompts to mark tasks as in progress or done. The CLI updates both `index.json` and the Markdown frontmatter for consistency.
4. When working in automated environments, pass `--headless` to print the next task without interactive prompts. The output includes metadata and the full prompt body:
   ```bash
   ts-node scripts/run-codex-task.ts --headless
   ```

## Conventions

- Task statuses are `pending`, `in-progress`, or `done`.
- When updating task files manually, keep the frontmatter keys consistent so the CLI can parse them.
- Any new tasks must be added to both the Markdown file set and `index.json` to remain discoverable by automation.

## Maintenance

- Review task priorities regularly and reorder files if new initiatives are added.
- Keep prompts actionable with clear deliverables so Codex can execute autonomously.
- Update this README if the workflow or CLI behavior changes.
