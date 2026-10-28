# Tasks 001 — Voice Receptionist Reliability

Legend: `[x]` done · `[ ]` pending · `(AC-n)` acceptance criterion verified

## Phase 0 — Governance
- [x] T001 Create `.specify/memory/constitution.md`
- [x] T002 Write `spec.md` with root causes RC-1…RC-8
- [x] T003 Write `plan.md` with evidence + architecture
- [x] T004 Add repo `AGENTS.md` (Spec Kit flow + inline comment rule)

## Phase 1 — Tests first
- [x] T010 Create `tests/voice-receptionist.test.mjs` with fake `SpeechRecognition`, `speechSynthesis`, DOM, `fetch`
- [x] T011 Tests for AC-1 … AC-10
- [x] T012 Add `pnpm test` script

## Phase 2 — Implementation
- [x] T020 Rewrite `voice-receptionist.js`: config, logging, state machine (FR-001, FR-014)
- [x] T021 `speak()` with utterance ref, watchdog, voice-load timeout (FR-009)
- [x] T022 `startListening()` single owner + `waitForTtsSilence()` + generation ids (FR-002, FR-003)
- [x] T023 Silence counter → graceful end (FR-011)
- [x] T024 Non-blocking email/phone/name capture (FR-005, FR-013)
- [x] T025 `askAI()` with timeout + buffered SSE (FR-007, FR-008)
- [x] T026 Orb tap handler: start / barge-in / stop (FR-010)
- [x] T027 `/api/chat`: drop client `system` messages (FR-012)

## Phase 3 — Verify & ship
- [x] T030 `pnpm test` green
- [x] T031 `pnpm build` green
- [x] T032 Commit `[specs/001]`, push, confirm Vercel READY
- [ ] T033 Manual AC-12 on Chrome desktop (user)
