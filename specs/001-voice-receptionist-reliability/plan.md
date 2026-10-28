# Plan 001 — Voice Receptionist Reliability

Spec: [spec.md](./spec.md) · Constitution: [/.specify/memory/constitution.md](../../.specify/memory/constitution.md)

## 1. Constitution Check
| Article | Compliance |
|---------|-----------|
| I  SDD | spec → plan → tasks committed before code. |
| II Comments | New file fully commented; header references this spec; FR ids inline. |
| III Evidence | Root causes cited with line refs (§2); automated tests cover AC-1…AC-10. |
| IV Simplicity | Replace ~930 lines of flag-driven code with an explicit 4-state machine; delete heuristics (RC-2/RC-3/RC-8). |
| V Security | `/api/chat` drops client `system` messages (FR-012). |
| VI Delivery | `pnpm test` + `pnpm build` before push. |

## 2. Evidence (pre-fix file `voice-receptionist.js` @ ff8aa18b)
- RC-1: `askAndWait()` sets `awaitingAnswer=true` (L219-222); gate `if (awaitingAnswer) return queueRestartListening(600)` (~L817); only cleared in `handleEmailConfirmTurn` yes/no (L289, L299).
- RC-2: `bookingUpgrade()` (L628-639) appended every turn; `wantsToBookDirectly()` (L624) matches "call/today/meeting".
- RC-3: `isEchoOfAssistant()` (L391-414) word-overlap ≥0.5 over 8 phrases.
- RC-4: restarts from `r.onend` (L738), `r.onerror` (L753), `u.onend` (L537), plus `rec.abort()` in `speak()` emitting `aborted` → restart timer that can fire before `u.onstart`.
- RC-5: `askAI()` `chunk.split('\n')` without carry-over buffer (L684-689).
- RC-6: `loadVoices()` (L436-447) no timeout.
- RC-7: client `convo` includes `{role:'system'}` (L41); server `chat.ts` L49-52 maps non-assistant → `user`, then the "drop system" check (L55) can never match.
- RC-8: `maybeExtractPhone()` runs `wordsToDigits()` first (L184).

## 3. Architecture
```
            tap (IDLE)                     TTS end + silence tail
   IDLE ───────────────► SPEAKING ─────────────────────────────► LISTENING
    ▲                       ▲  │ tap = barge-in                     │  final result
    │ tap / 4× silence      │  └──────────────────────────────►     ▼
    └────────────── LISTENING/THINKING ◄──────── reply ready ── THINKING
```
- `session` counter: incremented on start/stop; async callbacks capture it and bail if it changed.
- `recGen` counter: one `SpeechRecognition` instance per listening window (avoids Chrome `InvalidStateError` on re-`start()` and stale handlers).
- `startListening()` = only mic owner. It awaits `waitForTtsSilence()` (poll `speechSynthesis.speaking`/`pending` every 100 ms, then 450 ms tail).
- `speak()` keeps a strong reference to the current utterance (Chrome GC bug drops `onend`), plus a duration watchdog.
- Lead capture is a small, non-blocking side-flow (`pendingEmail`).
- AI: `POST /api/chat {mode:'voice', locale, messages: last 10 user/assistant turns}` with `AbortController` timeout, buffered SSE parser.

## 4. Files
| File | Change |
|------|--------|
| `public/scripts/voice-receptionist.js` | Rewrite (state machine). |
| `src/pages/api/chat.ts` | Filter client `system` roles before mapping; comments. |
| `tests/voice-receptionist.test.mjs` | New: Node `node:test` harness with fake Web Speech APIs. |
| `package.json` | Add `"test": "node --test tests/"`. |
| `AGENTS.md` | Repo rule: Spec Kit flow + inline comments. |

## 5. Risks
- Browser TTS engines differ in `onend` reliability → mitigated by watchdog + polling `speaking`.
- Laptop speakers + open mic can still leak the tail of TTS → mitigated by 450 ms tail; headphones recommended in copy if needed.
- Free OpenRouter models rate-limit (429) → FR-007 spoken fallback.
