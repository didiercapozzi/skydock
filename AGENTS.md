# AGENTS

## 1. Core References

- **App Logic:** [RULES.md](./RULES.md) — Single source of truth for domain logic, pipeline, and behavior. Always read and respect it.
- **Coding Standards:** [CODING.md](./CODING.md) — Mandatory code style, constraints, and architecture rules. Always read and strictly enforce them.
- **Current Tasks:** [TODO.md](./TODO.md) — Task list and roadmap.

---

## 2. Operating Directives

### 📖 Always Read & Comply

- **Read `RULES.md` and `CODING.md` on every request** to ensure complete compliance with domain rules and code standards.
- Follow all strict coding constraints (arrow functions, exports at bottom, inferred returns, no React memoization, Zod validation).

### 🔍 Verification Rule

- **Always run `npm run check` from `/workspace`** before finishing any task. All checks (`typecheck`, `format:check`, `lint`) must pass.

### 🛑 TODO.md Directives

- **Do NOT execute tasks from `TODO.md` unless directly requested by the user.**
- **Keep `TODO.md` updated:** When a requested task is completed, move it to `## Done`.

### ⚠️ Behavior Changes (RULES.md §12)

- **Never modify application behavior documented in `RULES.md`** without first warning the user, proposing the modification, and waiting for explicit confirmation.
- Update `RULES.md` only after approval.

### 🚫 Git Commits Rule

- **NEVER commit changes unless the user explicitly requests a commit.**
- Do not run `git commit` automatically under any circumstance.
