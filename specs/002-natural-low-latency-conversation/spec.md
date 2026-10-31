# Spec 002 — Natural, Low-Latency Receptionist Conversation

**Status:** In Progress · **Owner:** Antigravity · **Date:** 2026-10-31
**Supersedes / Extends:** [Spec 001 — Voice Receptionist Reliability](../001-voice-receptionist-reliability/spec.md)
**Components:** `src/config/receptionist.ts`, `src/pages/api/chat.ts`, `src/lib/openrouter.ts`, `public/scripts/voice-receptionist.js`, `src/components/ReceptionistPanel.astro`

## 1. Problem Statement (Observed by User)
After Spec 001 fixed the voice orb state machine and echo loop, live testing revealed two UX problems:
1. **Feels like a scripted pitch (despite recognizing the visitor's name):** Saying *"Hi, I'm Boris"* causes the assistant to recognize the name *"Boris"* and immediately launch into a canned pitch for the Mint Tea free trial or a multiple-choice sales funnel (*"more leads, smoother bookings, or better payments?"*).
2. **Noticeable response lag:** There is a multi-second delay between when the user finishes speaking and when the assistant begins speaking back, with little visual feedback during speech recognition and token generation.

## 2. Proven Root Causes (Evidence from Live Reproduce & Code Audit)

| ID | Root Cause | Evidence / Measured Impact |
|----|-----------|----------------------------|
| **RC-1** | **`FEWSHOT` injected as live conversation history (`src/pages/api/chat.ts` L40, `src/config/receptionist.ts` L94–183):** 16 fake `user`/`assistant` turns are prepended directly before the visitor's first turn. The last two fake turns are the assistant asking *"Great choice — Mint Tea — Free Trial... What's your name, and what's the best email or WhatsApp?"* | **Live reproduction:** Sending `{"messages":[{"role":"user","content":"Hi, I am Boris"}]}` to `/api/chat` returned: *"Hi Boris! I'll set up your Mint Tea trial. What's the best email or WhatsApp to send the link to?"* — the LLM thought *"Hi, I am Boris"* was answering the fake few-shot question! |
| **RC-2** | **Funnel-script `systemPrompt` (`src/config/receptionist.ts` L70–89):** Instructs the model to follow a rigid sales script (*"Lead flow: greet → ask for their name → clarify the goal → propose next-step or value → then ask for email/phone"*) and forces canned plan blurbs. | Produces robotic, salesy replies instead of a calm, curious human conversation. |
| **RC-3** | **Initial voice greeting omitted from `history` (`public/scripts/voice-receptionist.js` L325–329):** The orb speaks *"Hi, I'm the Infusio assistant. How can I help you today?"*, but never records that turn in `history`. | On the user's first spoken reply, the LLM does not know it already greeted the user and asked how it can help, causing redundant greetings. |
| **RC-4** | **Bloated prompt + `max_tokens: 500` on voice calls (`src/lib/openrouter.ts` L52):** Sending 16 few-shot turns (~650 tokens) + `max_tokens: 500` on every turn increases both time-to-first-token and total generation time. | **Benchmark:** Trimming `FEWSHOT` and setting `max_tokens: 110` for voice cut OpenRouter total stream time from **1,842 ms → 643–825 ms** (a **>1,000 ms** reduction). |
| **RC-5** | **`SpeechRecognition` has `interimResults = false` (`public/scripts/voice-receptionist.js` L214):** The browser waits ~800–1,500 ms after the user stops speaking for the remote STT service to mark the utterance `isFinal`, while showing no live transcript. | Visitor sees a static *"Listening…"* label while speaking and waits up to 1.5 s after finishing a sentence before `THINKING` starts. |
| **RC-6** | **Known visitor context (`name`/`email`/`phone`) dropped (`src/components/ReceptionistPanel.astro` L185, `src/pages/api/chat.ts` L53):** Spec 001 stripped client `system` messages for security, which also stripped the text panel's `"The user's name is X"` hint; the voice client never sent captured lead fields to `/api/chat`. | Model either forgets the visitor's name later or re-asks for details already captured. |

## 3. User Stories
- **US-1 (Natural First Turn):** As a visitor who says *"Hi, I'm Boris"* or asks a casual question, I get a natural, unhurried human reply that acknowledges my name without pitching a trial, reciting plan prices, or demanding my email.
- **US-2 (Consultative Discovery):** As a visitor describing a problem (e.g. *"We miss calls"* or *"Our website is outdated"*), the receptionist converses naturally about my situation first and only brings up plans, pricing, or booking a call when relevant or asked.
- **US-3 (Snappy Voice Turn-Taking):** As a voice user, I see my words transcribed live as I speak, the orb transitions to `THINKING` within ~650 ms of my pause even if browser `isFinal` lags, and the assistant starts speaking within ~1 second.
- **US-4 (Memory of Captured Details):** Once I share my name, email, or phone, the receptionist remembers it across turns without asking again.

## 4. Functional Requirements
- **FR-201 (Conversational Persona):** Replace the funnel-script `systemPrompt` in `src/config/receptionist.ts` with a warm, perceptive, human-first studio receptionist persona. Reference catalog details (plans/pricing/links) live inside the system prompt as background knowledge to be used **only when the visitor asks about plans, pricing, trials, or next steps**.
- **FR-202 (No Fake Conversation History):** `FEWSHOT` MUST be empty (`[]`) in live `/api/chat` composition so the LLM never confuses prior example turns with the current visitor's conversation.
- **FR-203 (Record Spoken Greeting in History):** When the voice orb speaks its opening greeting, it MUST push `{ role: 'assistant', content: greeting }` into `history` so the LLM has the true conversation context on turn 1.
- **FR-204 (Server-Sanitized Visitor Context):** `/api/chat` accepts an optional `visitor: { name?: string, email?: string, phone?: string }` object, sanitizes each field (plain text, bounded length), and appends a server-owned context note so the LLM knows what has already been captured without trusting client `system` prompts (preserving Spec 001 FR-012).
- **FR-205 (Mode-Aware Token Budget):** `streamOpenRouter` accepts `opts?: { maxTokens?: number, temperature?: number }`. Voice mode uses `maxTokens: 120` (1–2 short spoken sentences, <35 words); text mode uses `maxTokens: 260`.
- **FR-206 (Live Interim Transcript & Silence Commit):** `voice-receptionist.js` sets `r.interimResults = true`, displays live interim speech in `#voice-status`, and commits the transcript if `isFinal` arrives OR after `INTERIM_COMMIT_MS = 700` of silence following stable interim words.
- **FR-207 (Live Streaming Preview in Voice Status):** While `/api/chat` streams tokens in `THINKING` state, `#voice-status` progressively displays the incoming reply text so the visitor sees immediate response at TTFT (~400–600 ms) while TTS prepares to speak.

## 5. Acceptance Criteria
- **AC-201:** Sending `[{ role: 'assistant', content: 'Hi, I’m the Infusio assistant. How can I help you today?' }, { role: 'user', content: 'Hi, I’m Boris' }]` to `/api/chat` produces a natural greeting using "Boris" with **zero** unprompted mention of "Mint Tea", "$1,550", "$350", or "email/WhatsApp". *(automated + live test)*
- **AC-202:** `FEWSHOT` exported from `src/config/receptionist.ts` is `[]` (no fake turns injected into `/api/chat`). *(automated test)*
- **AC-203:** Tapping the voice orb records the assistant greeting in `window.__infusioVoice.history` before the user's first turn is sent. *(automated test)*
- **AC-204:** Interim speech updates `#voice-status` immediately and commits after `INTERIM_COMMIT_MS` (700 ms) even if the browser never sets `isFinal: true`. *(automated test)*
- **AC-205:** Capturing a user's name (`"My name is Boris"`) passes `visitor: { name: 'Boris' }` in `/api/chat` requests. *(automated test)*
- **AC-206:** All 10 existing Spec 001 acceptance tests (`AC-1 … AC-10`) continue to pass with 0 regressions. *(automated test)*
- **AC-207:** Live `/api/chat` voice-mode round-trip completes in `< 1,200 ms` total on warm call. *(benchmark)*
