# Infusio Site — Engineering Constitution

> Spec Kit (github/spec-kit) governance file. Every feature, fix, and refactor in this
> repository MUST respect these principles. Agents (Antigravity, RASS, PicoClaw) and humans alike.

## Article I — Spec-Driven Development (non-negotiable)
Work flows through the Spec Kit phases, in order, with artifacts committed under `specs/NNN-short-name/`:

1. **Constitution** — this file. Amend it explicitly; never silently ignore it.
2. **Specify** (`spec.md`) — WHAT and WHY: user stories, functional requirements (FR-xxx),
   acceptance criteria, edge cases. No implementation detail.
3. **Clarify** — open questions are listed as `[NEEDS CLARIFICATION]` and resolved (or assumed and stated) before planning.
4. **Plan** (`plan.md`) — HOW: architecture, files touched, data flow, risks, constitution check.
5. **Tasks** (`tasks.md`) — ordered, atomic, checkable tasks. Tests come before or with the code they verify.
6. **Implement** — execute tasks in order, ticking them off. Deviations are written back into the plan.
7. **Verify** — every acceptance criterion maps to a test or a documented manual check.

Bug fixes follow the same flow; the spec states the observed failure, the root cause(s), and the acceptance criteria that prove it is gone.

## Article II — Human-Debuggable Code
- All code carries **inline comments** aimed at a human debug operator: what a block does, why it exists,
  and which spec requirement (`FR-xxx`) it satisfies when relevant.
- Non-obvious timings, thresholds, and browser workarounds MUST state the reason and the symptom they prevent.
- Each file starts with a header comment: path, purpose, owning spec.
- Runtime debug logging is available behind an explicit flag (e.g. `?voicedebug=1`) and is silent by default.

## Article III — Evidence Over Guessing
- Root causes are proven (code reading, reproduction, benchmark, or test) before a fix is declared.
- A fix is not "done" until a test or measured check demonstrates it. Claims in reports must match evidence.
- Regressions introduced by a previous change are called out honestly in the spec.

## Article IV — Simplicity & Explicit State
- Prefer explicit state machines over scattered boolean flags.
- One owner per side effect (e.g. only one function may start the microphone).
- Delete dead or speculative code instead of layering patches on top of it.

## Article V — Security & Configuration
- Secrets live only in Vercel env / `.env` (never committed, never logged).
- The server owns the AI persona; client-supplied `system` messages are never trusted.
- Request payloads are bounded (length, count) on the server.

## Article VI — Delivery
- `pnpm build` and `pnpm test` pass before every push to `main`.
- Commits reference the spec folder (e.g. `fix(voice): ... [specs/001]`).
