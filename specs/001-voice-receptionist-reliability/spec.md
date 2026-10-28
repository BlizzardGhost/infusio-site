# Spec 001 — Voice Receptionist Reliability

**Status:** Implemented · **Owner:** Antigravity · **Date:** 2026-10-28
**Component:** `public/scripts/voice-receptionist.js` (hero voice orb), `src/pages/api/chat.ts`

## 1. Problem Statement (observed by user)
- The orb greets and speaks, then enters an **answering loop** and **never catches the user's inquiry**.
- Previous patch (`ff8aa18b`) did not fix it.

## 2. Root Causes (proven by code reading — see plan.md §2 for line references)
| ID | Root cause | Symptom |
|----|-----------|---------|
| RC-1 | `awaitingAnswer` flag is set by booking/phone heuristics and only cleared by an email yes/no. While true, every utterance is ignored (`if (awaitingAnswer) return queueRestartListening()`). | "Never catches my inquiry" — mic keeps cycling, nothing is answered. |
| RC-2 | `bookingUpgrade()` appends "Want me to book a 10–15 minute call?" to almost every reply; any "yes/call/today/meeting" then triggers RC-1. | Same question repeated every turn ("answering loop"). |
| RC-3 | **Regression from `ff8aa18b`:** echo filter drops any utterance sharing ≥50% words with *any* of the last 8 assistant lines (substring match on words ≥3 chars). Users naturally reuse the assistant's words ("website", "want", "call"). | Real user speech silently discarded as "echo". |
| RC-4 | Three independent restart paths (`onend`, `onerror`, `speak().onend`, `abort()` side effects) race; the recognizer can start between `synth.speak()` and `utterance.onstart` (when `speaking` is still false). | Mic opens while TTS plays → assistant hears itself → loop. |
| RC-5 | SSE parser splits each network chunk by `\n` without buffering partial lines. | Words dropped from replies. |
| RC-6 | `loadVoices()` waits forever if `voiceschanged` never fires. | Orb silent / stuck on some browsers. |
| RC-7 | Client sends its own `system` prompt + few-shots; server maps every non-assistant role to `user`. | Persona text is injected as user speech; model confusion. |
| RC-8 | Phone regex runs after converting words like "to/for/oh/o" into digits. | False phone captures → triggers RC-1. |

## 3. User Stories
- **US-1** As a visitor, I tap the orb, hear a short greeting, then speak my question and get a relevant spoken answer.
- **US-2** As a visitor, I can keep a multi-turn conversation; every turn I speak is heard and answered.
- **US-3** As a visitor, I can interrupt the assistant by tapping the orb while it talks.
- **US-4** As a visitor, I can dictate my email, confirm it, and have a lead created.
- **US-5** As a debug operator, I can see a state-by-state log by adding `?voicedebug=1`.

## 4. Functional Requirements
- **FR-001** Explicit state machine: `IDLE → SPEAKING → LISTENING → THINKING → SPEAKING …`; exactly one state at a time.
- **FR-002** Half-duplex audio: the microphone is never active while TTS is speaking or pending; it opens only after `speechSynthesis.speaking === false` plus a tail delay.
- **FR-003** Single owner: only `startListening()` may start recognition. Each recognizer instance has a generation id; events from stale instances are ignored.
- **FR-004** No user utterance is discarded by text similarity. (Echo is prevented acoustically by FR-002, not by guessing.)
- **FR-005** No conversational state may block AI replies indefinitely. A pending email confirmation is cleared by any unrelated utterance, which then goes to the AI.
- **FR-006** No automatic booking nudge appended client-side; booking is guided by the server persona.
- **FR-007** AI calls time out (15 s) and fall back to a spoken, localized error, then keep listening.
- **FR-008** SSE parsing buffers partial lines across chunks.
- **FR-009** Voice loading resolves within 1.5 s even if `voiceschanged` never fires.
- **FR-010** Tap while SPEAKING = barge-in (stop TTS, listen). Tap while LISTENING/THINKING = end session.
- **FR-011** After 4 consecutive silent listening windows, the session ends gracefully (no infinite mic loop).
- **FR-012** Server ignores client `system` messages; persona is server-owned.
- **FR-013** Email capture only when the utterance contains email cues; phone capture requires ≥7 literal digits.
- **FR-014** Debug logging behind `?voicedebug=1` or `localStorage.voiceDebug = '1'`; `window.__infusioVoice` exposes state for operators.

## 5. Acceptance Criteria
- **AC-1** Greeting plays; zero recognizer instances are started while TTS is speaking. *(test)*
- **AC-2** After TTS ends, exactly one recognizer starts. *(test)*
- **AC-3** "I want a website" after the assistant said "website…" is answered (not dropped). *(test — RC-3 regression)*
- **AC-4** "Can we schedule a call tomorrow?" is answered by the AI, and the next utterance is answered too. *(test — RC-1/RC-2)*
- **AC-5** Email dictation → confirmation → "yes" → `/api/lead` POST with the email. *(test)*
- **AC-6** Pending confirmation + unrelated question → question goes to the AI. *(test)*
- **AC-7** Tap during speech cancels TTS and returns to listening. *(test)*
- **AC-8** 4 silent windows → state `IDLE`. *(test)*
- **AC-9** Late events from an old recognizer are ignored. *(test)*
- **AC-10** SSE reply split mid-line across chunks is reassembled intact. *(test)*
- **AC-11** `/api/chat` never forwards client `system` content as a `user` turn. *(code review)*
- **AC-12** Manual: on Chrome desktop with speakers, a 3-turn conversation completes without self-echo. *(manual — user)*

## 6. Out of Scope
- Replacing browser Web Speech with a cloud STT/TTS (e.g. Deepgram/ElevenLabs) — candidate for Spec 002.
- PicoClaw gateway integration — candidate for Spec 003.

## 7. Clarifications / Assumptions
- Assumed target browsers: Chrome/Edge (full voice). Safari/Firefox without `SpeechRecognition` fall back to the text panel (existing behavior kept).
