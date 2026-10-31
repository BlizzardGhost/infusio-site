# Tasks 002 — Natural, Low-Latency Receptionist Conversation

Legend: `[x]` done · `[ ]` pending · `(AC-xxx)` acceptance criterion verified

## Phase 0 — Governance & Spec Artifacts
- [x] T201 Create `specs/002-natural-low-latency-conversation/spec.md` with proven root causes RC-1…RC-6
- [x] T202 Create `specs/002-natural-low-latency-conversation/plan.md` with constitution check & architecture
- [x] T203 Create `specs/002-natural-low-latency-conversation/tasks.md`

## Phase 1 — Tests First (TDD)
- [x] T210 Add Spec 002 unit/integration tests in `tests/voice-receptionist.test.mjs`:
  - `AC-202`: `src/config/receptionist.ts` exports `FEWSHOT = []` and anti-pitch conversational rules
  - `AC-203`: Greeting is recorded in `window.__infusioVoice.history` as first `assistant` turn
  - `AC-204`: Interim speech updates `#voice-status` live and auto-commits after `INTERIM_COMMIT_MS` when `isFinal` is delayed
  - `AC-205`: Captured visitor `name` (`"Hi, my name is Boris"`) is sent in `visitor.name` to `/api/chat`
  - `AC-206`: All 10 Spec 001 tests (`AC-1 … AC-10`) continue to pass

## Phase 2 — Implementation (with inline operator comments)
- [x] T220 Update `src/config/receptionist.ts`: natural conversational `systemPrompt` + `FEWSHOT = []` (FR-201, FR-202)
- [x] T221 Update `src/lib/openrouter.ts` & `src/pages/api/chat.ts`: server-sanitized `visitor` context + mode-aware `maxTokens` (`120` voice / `260` text) (FR-204, FR-205)
- [x] T222 Update `public/scripts/voice-receptionist.js`: greeting in `history` (FR-203), `interimResults = true` + `INTERIM_COMMIT_MS` (FR-206), streaming preview in `#voice-status` (FR-207), `visitor` payload (FR-204)
- [x] T223 Update `src/components/ReceptionistPanel.astro`: send `visitor` metadata instead of dropped client `system` message; buffer SSE lines

## Phase 3 — Verification & Delivery
- [x] T230 Run `pnpm test` (14/14 Spec 001 + Spec 002 tests green)
- [x] T231 Run `pnpm build` (clean Astro/Vercel build)
- [x] T232 Commit referencing `[specs/002]`, push to `origin main`, and benchmark live `/api/chat` response (`AC-201`, `AC-207`)
