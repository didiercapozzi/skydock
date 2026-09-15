# Claude Code Project Rules

This file documents core directives for working on the SkyDock project. **Read and enforce these rules every session.**

## 📖 Core Documents (Read Every Session)

- **RULES.md** — Single source of truth for domain logic, pipeline, media processing, manifest behavior, and UI interactions. Non-negotiable.
- **AGENTS.md** — Coding standards, compliance directives, and operating rules.
- **CODING.md** — Code style constraints and architecture rules.

## Critical Directives

### Always Read & Comply

- Read `RULES.md`, `AGENTS.md`, and `CODING.md` on every request before acting
- Enforce all strict coding constraints (arrow functions, exports at bottom, inferred returns, no React memoization, Zod validation)

### Verification Rule

- **Run `npm run check` from `/workspace` before finishing any task** — all checks (typecheck, format:check, lint) must pass
- Never skip this step

### TODO.md Directives

- Do NOT execute tasks from `TODO.md` unless directly requested by the user
- When a requested task is completed, move it from active list to `## Done` section
- Keep TODO.md updated

### Behavior Changes (RULES.md §11)

- **Never modify application behavior** described in RULES.md without:
  1. Identifying impact on existing sections
  2. Warning the user with affected sections
  3. Waiting for explicit confirmation
  4. Updating RULES.md after implementation
  5. Committing code + RULES.md together

### Git Commits Rule

- **Never commit automatically** — wait for explicit user request
- Even if code is ready, only commit when user says "commit" or "create a PR"
- All commits must include the attribution line from the system reminder

### Cross-Session Consistency

These rules apply to every session with this project, regardless of when or how Claude Code is invoked.
