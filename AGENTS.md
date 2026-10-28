# AGENTS.md — Infusio Site build rules

These rules apply to every agent (Antigravity, RASS, PicoClaw) and human working in this repo.
The full governance text is in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## 1. Follow Spec Kit (github/spec-kit) for every change
Before writing code, create or update `specs/NNN-short-name/`:
1. `spec.md` — WHAT/WHY: problem, root causes (for bugs), user stories, FR-xxx, acceptance criteria (AC-x).
2. `plan.md` — HOW: constitution check, evidence with file/line refs, architecture, files touched, risks.
3. `tasks.md` — ordered checklist; tests before/with code. Tick tasks as they are completed.
4. Implement → verify every AC with a test or a documented manual check → commit with `[specs/NNN]`.

## 2. Inline comments are mandatory
- Every file starts with a header: path, purpose, owning spec.
- Comment each non-trivial block for a human debug operator: what it does, why, and the FR it serves.
- Every magic number/timing/browser workaround states the symptom it prevents.
- Debug logs exist behind an opt-in flag and are silent by default.

## 3. Evidence before claims
- Prove the root cause before fixing. Don't report a fix as done without a passing test or measurement.
- Call out regressions from earlier changes honestly.

## 4. Gates before pushing to `main`
- `pnpm test` and `pnpm build` must pass.
