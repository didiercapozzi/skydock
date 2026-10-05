# AGENTS

Pointer file, with one standing rule below. The other rules live in one place each — do not restate them here, or the copies drift.

## Standing rule

**Every change respects the design and reuses the existing components.** Before adding any screen, control or style, read [docs/visual-design-rules.md](./docs/visual-design-rules.md) and look for what already exists in `web/app/components/` and the shared UI package; use it, and extend it when it falls short, rather than writing a second version beside it. A new colour, shadow, border, radius or font that the design file does not name is not allowed — change the design file first, then the code.

## Where the rules are

- **[CLAUDE.md](./CLAUDE.md)** — how to work in this repo: verification, permissions, the devcontainer, TODO handling, commits, and how behaviour changes get documented.
- **[CODING.md](./CODING.md)** — code style, architecture and testing constraints.
- **[docs/visual-design-rules.md](./docs/visual-design-rules.md)** — how the board looks: colour, type, layout, pictures, buttons, and what never to do.
- **[RULES.md](./RULES.md)** — the single source of truth for what the app does: the workflow, jumps, delivery, the board and network storage. It describes the app, not the code.

Read CLAUDE.md first; it says which of the others matter for the task at hand.
