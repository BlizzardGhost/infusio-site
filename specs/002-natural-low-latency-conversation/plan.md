# Plan 002 — Natural, Low-Latency Receptionist Conversation

Spec: [spec.md](./spec.md) · Extends: [Spec 001](../001-voice-receptionist-reliability/spec.md) · Constitution: [/.specify/memory/constitution.md](../../.specify/memory/constitution.md)

## 1. Constitution Check
| Article | Compliance |
|---------|-----------|
| **I — Spec-Driven Development** | `spec.md`, `plan.md`, and `tasks.md` created under `specs/002-natural-low-latency-conversation/` before touching implementation files. |
| **II — Human-Debuggable Code** | All modified files include header references to Spec 001 & Spec 002, inline comments explaining every timing (`INTERIM_COMMIT_MS`, `TTS_TAIL_MS`, `maxTokens`), and opt-in `?voicedebug=1` logs. |
| **III — Evidence Over Guessing** | Live reproduction (`"Hi, I am Boris"` → unprompted Mint Tea pitch caused by `FEWSHOT` L156–170) and latency benchmark (`1,842 ms` → `643–825 ms`) recorded in `spec.md` §2. |
| **IV — Simplicity & Explicit State** | Preserves the 4-state half-duplex machine (`IDLE`, `SPEAKING`, `LISTENING`, `THINKING`) from Spec 001; removes 16 fake `FEWSHOT` turns; removes dead `_hintName` system message injection in `ReceptionistPanel.astro`. |
| **V — Security & Configuration** | Server still drops all client `system` messages (FR-012); `visitor` metadata (`name`, `email`, `phone`) is strictly sanitized and bounded on the server before being added to the server-owned system prompt (FR-204). |
| **VI — Delivery** | `pnpm test` (Spec 001 + Spec 002 tests) and `pnpm build` must pass before commit/push. |

## 2. Technical Architecture & Data Flow

### 2.1 Persona & Prompt Architecture (`src/config/receptionist.ts`, `src/pages/api/chat.ts`)
- **Why the old prompt failed:**
  1. `FEWSHOT` appended 16 fake `user`/`assistant` messages directly into the live `messages` array. The final fake message was the assistant asking for the visitor's name and email to send the Mint Tea free trial link. Every real visitor's first message was interpreted by the LLM as the reply to that fake question.
  2. `systemPrompt` prescribed a rigid 6-step sales funnel (`greet → ask for their name → clarify the goal → propose next-step or value → then ask for email/phone`).
- **New design:**
  - `FEWSHOT = []` (empty array). Zero fake turns in the conversation history.
  - `systemPrompt` defines a natural, consultative studio receptionist:
    - **Who we are:** Infusio builds fast Astro/Vercel websites, AI receptionists (voice + chat), and quiet business automations (scheduling, CRM, WhatsApp, payments) plus an operator dashboard. Not a medical/spa clinic.
    - **How to converse:** Talk like a sharp, warm human front-desk colleague. Respond directly to what the visitor just said. Ask at most one natural follow-up question to understand their context.
    - **Anti-pitch rule:** Do NOT recite plan names (`Mint Tea`, `Earl Grey`, `Matcha`, `Oolong`), prices, or setup fees unless the visitor asks about plans, pricing, or a free trial. Do NOT ask for their email, phone, or to book a call on the first turn unless they ask to book or get a link.
    - **Reference catalog:** Concise facts on the 4 plans and contact channels (`https://cal.com/infusio`, `hello@infusio.pro`, WhatsApp `+57 314 634 6617`) so the assistant is accurate *when asked*.
  - **Visitor context (`FR-204`):**
    - `/api/chat` reads `body.visitor` (`{ name, email, phone }`), strips non-printable characters, caps lengths (`name <= 60`, `email <= 120`, `phone <= 30`), and appends to `enrichedSystem`:
      `KNOWN VISITOR DETAILS: name="Boris". Acknowledge naturally at most once; never re-ask for details already listed here.`

### 2.2 Low-Latency Voice Pipeline (`public/scripts/voice-receptionist.js`, `src/lib/openrouter.ts`)
```
User speaks ──(interim ~100ms)──► #voice-status shows live words: “Hi, I'm Boris…”
            ──(isFinal OR 700ms silence after interim)──► handleUtterance()
            ──► POST /api/chat (mode:'voice', maxTokens:120, visitor:lead)
            ──(TTFT ~350-550ms)──► #voice-status previews streaming reply
            ──(stream done ~650-850ms)──► speak(reply)
            ──(TTS ends + 380ms tail)──► LISTENING
```
- **Greeting in history (`FR-203`):** `startConversation()` pushes `{ role: 'assistant', content: greeting }` into `history` when speaking the initial greeting.
- **Interim speech + fast silence commit (`FR-206`):**
  - Set `r.interimResults = true`.
  - When `r.onresult` receives interim text (`isFinal === false`), update `statusEl` with `“${interim}…”` and reset a `700 ms` `interimTimer`.
  - If `isFinal === true` arrives first, clear `interimTimer` and call `handleUtterance(finalText)` immediately.
  - If Chrome's STT server lags on marking `isFinal` after the user stops talking, `interimTimer` fires after `700 ms` of no new words and commits the accumulated transcript.
- **Tighter voice token budget & tail (`FR-205`, `FR-207`):**
  - `openrouter.ts`: pass `max_tokens: mode === 'voice' ? 120 : 260`.
  - `TTS_TAIL_MS`: tuned from `450 ms` to `380 ms` (still well above speaker decay while shaving 70 ms off turn-around; `waitForTtsSilence` still polls `synth.speaking`).
  - While `askAI()` reads SSE deltas, it invokes an optional `onProgress(partialText)` callback that updates `#voice-status` so the user gets visual confirmation at ~450 ms TTFT.

## 3. Files Touched
| File | Change |
|------|--------|
| `src/config/receptionist.ts` | Natural consultative `systemPrompt`; `FEWSHOT = []`; keep `ANSWERS` and `VARS` for offline fallback. |
| `src/pages/api/chat.ts` | Sanitize `body.visitor` (`name`, `email`, `phone`) into server system context (FR-204); pass `mode` to `streamOpenRouterResponse`. |
| `src/lib/openrouter.ts` | Accept `opts?: { maxTokens?: number, temperature?: number }`; default `maxTokens` by mode (`120` voice / `260` text). |
| `public/scripts/voice-receptionist.js` | Record greeting in `history` (FR-203); `interimResults = true` + `INTERIM_COMMIT_MS = 700` (FR-206); live streaming status preview (FR-207); send `visitor` metadata (FR-204). |
| `src/components/ReceptionistPanel.astro` | Send `visitor: { name: state.name, email: state.email, phone: state.phone }` to `/api/chat` instead of a fake client `system` message; buffer SSE lines properly. |
| `tests/voice-receptionist.test.mjs` | Keep AC-1…AC-10 and add Spec 002 tests (AC-201…AC-206). |

## 4. Risks & Mitigations
- **Risk:** `interimTimer` commits while a user pauses mid-sentence.
  - **Mitigation:** `700 ms` is longer than natural intra-sentence pauses (~250–400 ms) and resets on every interim token update; requires at least 2 characters of transcript.
- **Risk:** Removing `FEWSHOT` could make the model forget Infusio's plan details when a user *does* ask about pricing.
  - **Mitigation:** Compact plan summary is embedded directly in `systemPrompt` under `REFERENCE CATALOG (use ONLY when the visitor asks about plans, pricing, or free trial)`.
