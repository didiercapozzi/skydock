# Claude Code Project Rules

This file documents core directives for working on the SkyDock project. **Read and enforce these rules every session.**

Each rule has exactly one owner. Never restate a rule from another file here — the copies drift, and a contradiction is worse than a gap.

| Subject                                                           | Owner                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| What the app does: workflow, jumps, delivery, board, storage      | **RULES.md** — non-negotiable                                        |
| Code style, architecture, testing                                 | **CODING.md**                                                        |
| How to work here: verification, permissions, environment, commits | **this file**                                                        |
| What may actually run                                             | **`.claude/settings.json`** (enforced by the harness, not by Claude) |

`AGENTS.md` is only a pointer to these; it holds no rules of its own.

## Critical Directives

### Always Read & Comply

- Read `RULES.md` and `CODING.md` on every request before acting. Follow CODING.md's constraints as written there — this file does not repeat them.

### Verification Rule

- After every change, before reporting it done: run `npm run format`, then `npm run check`. All checks (typecheck, format:check, lint) must pass. This is not a decision to weigh or a permission to request — just do it.
- Note that `npm run check` does **not** run tests. `npx vitest run` is separate, and the scripts package currently has pre-existing failures.

### TODO.md Directives

- Do NOT execute tasks from `TODO.md` unless directly requested by the user
- When a requested task is completed, move it from active list to `## Done` section
- Keep TODO.md updated

### Behavior Changes — implement, document, report

RULES.md is the single source of truth for what the app does. It must never fall behind the code — but keeping it current is a duty to document, not a reason to stop and ask.

On a clear request that changes how the app behaves:

1. Work out which parts of RULES.md the change touches.
2. **Build it.** Do not pause for confirmation.
3. **Update RULES.md in the same change**, so the rules and the code are never out of step.
4. **Report** what was built, which decisions were taken on the user's behalf and why, and anything left out.
5. Code and RULES.md go in the same commit.

RULES.md describes the app, not the code: no function, file or field names, no schemas, no endpoint lists. Write what the app does and what it guarantees; the code and its tests are the authority on how.

**Stop and ask only when:**

- The request has two readings that lead to materially different work, and guessing wrong would waste the effort.
- The change could destroy data the user cannot get back — deleting originals, overwriting processed output, anything touching `/mnt/osmo`.
- A standing rule requires it: no commit, push or share link without an explicit request.

Anything else — naming, layout, thresholds, which of two sound designs to use — is Claude's call. Make it, say so in the report, and move on. A decision that turns out wrong is cheaper to reverse than a question is to answer.

**Changes that need no RULES.md update:** bug fixes that preserve behavior, refactors with no external change, styling, and tests.

### Git Commits Rule

- **Never commit automatically** — wait for explicit user request
- Even if code is ready, only commit when user says "commit" or "create a PR"
- All commits must include the attribution line from the system reminder

### Development Environment (devcontainer)

Work happens inside the **`dev_container`** service defined in `.devcontainer/docker-compose.dev.yml`. Claude runs in that same container as the user's editor, which has concrete consequences:

- **The repo is `/workspace`**, bind-mounted from the host (`..:/workspace:cached`). Host paths differ — never write an absolute host path into code or config. `SKYDOCK_OUTPUT_DIR` defaults to `/workspace/output`.
- **Same machine as the user.** `localhost` ports are shared, so the dev server the user has open is reachable with `curl` or Playwright. Claude can inspect the running app directly instead of asking for screenshots — but the app's state is the user's **live** `output/manifest.json`. Back it up before any test that mutates it, restore afterwards, and say so.
- **`/mnt/osmo` is the camera media, mounted read-only** (`/media` on the host). Never write, move or delete there; SkyDock copies out of it into `output/`.
- **`.env` at the repo root is loaded into the container and holds NAS credentials** (`host`, `username`, `password`). It is gitignored. Never print its values, echo them into logs, or commit them.
- **`ffmpeg`, `ffprobe` and `exiftool` are installed** in the image, so `process` works here. **`kdenlive`, `melt` and `kdenlive_render` are not** — SkyDock can generate a `.kdenlive` project inside the container, but rendering happens on the host.
- **`/dev/dri` is passed through** for hardware video encode/decode, and `/tmp/.X11-unix` with `DISPLAY=:1` means GUI apps can reach the host X server.
- **The host SSH agent is forwarded** (`SSH_AUTH_SOCK`), so `git push` uses the user's keys. The Docker socket is mounted, but the `docker` CLI is not installed in the image.
- **Claude Code's own state lives in `/workspace/.claude`,** via `CLAUDE_CONFIG_DIR` in the compose file — not in `/root/.claude`, which is on the overlay filesystem and is destroyed by every rebuild. Because that makes it _user_ scope, `permissions.defaultMode` works from it. `.gitignore` keeps everything in there out of git except `settings.json`; the directory also holds `.credentials.json` (a live OAuth token), session transcripts and shell snapshots, so never commit or print them.
- Playwright is in `node_modules`, but its browser build can be newer than the one baked into the image; if a launch fails with "Executable doesn't exist", run `npx playwright install chromium`.

Do not reconfigure the devcontainer, rebuild the image, or install system packages without asking.

### Tooling Permissions

**Permissions are mechanism, not judgement.** What may run is decided by `.claude/settings.json` and the session's permission mode, both enforced by the harness. This file never lists allowed commands — that list would only drift out of step with the real one.

- Sessions run in **auto mode** (`permissions.defaultMode` in `.claude/settings.json`, which is user scope here thanks to `CLAUDE_CONFIG_DIR`): a classifier reviews each action and blocks anything that escalates beyond the request. Work without asking for routine commands; the harness stops what needs stopping.
- The project's `ask` list is deliberate, not an obstacle: commits, pushes, `gh`, package installs and `docker` prompt on purpose. Do not try to route around them.
- The `deny` list is the hard floor: `rm -rf` on `/`, `~`, `/workspace` or `/mnt/osmo`, force-pushes, and reading `.env`.
- **Run one command per Bash call.** Chaining with `&&` or `;` makes an approval cover only the first prefix, so a compound call gets refused as a whole and must be re-approved every time.
- **A newly created settings file only takes effect next session.** Claude Code watches for settings changes only in directories that already held one when the session started. Claude cannot reload it — say so rather than editing the file repeatedly.

### Cross-Session Consistency

These rules apply to every session with this project, regardless of when or how Claude Code is invoked.
