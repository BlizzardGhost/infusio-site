// /public/scripts/voice-receptionist.js
// -----------------------------------------------------------------------------
// Infusio hero "voice orb" receptionist (browser-side).
// Spec:  specs/001-voice-receptionist-reliability/spec.md   (FR-001 … FR-014)
// Tests: tests/voice-receptionist.test.mjs                  (AC-1 … AC-10)
//
// HOW IT WORKS (read this first when debugging):
//   The orb is a strict HALF-DUPLEX state machine. Only one thing happens at a time:
//
//     IDLE ──tap──► SPEAKING ──TTS done + silence tail──► LISTENING ──final result──► THINKING
//      ▲               ▲                                      │                         │
//      │               └──────────────── reply ready ─────────┼─────────────────────────┘
//      └──── tap (while LISTENING/THINKING) or 4 silent windows ┘
//
//   - The microphone (SpeechRecognition) is opened ONLY by startListening(), and only
//     after speechSynthesis is fully silent + a short tail. This is what prevents the
//     assistant from hearing its own voice (the old "answering loop").
//   - Every recognizer instance gets a generation id (recGen). Events from older
//     instances are ignored, so late/duplicate browser events cannot hijack the flow.
//   - Every session gets an id (session). Async work (fetch, timers) checks it and
//     quietly stops if the user ended/restarted the session meanwhile.
//
// DEBUGGING:
//   - Add ?voicedebug=1 to the URL (or run localStorage.voiceDebug = '1') to see
//     "[voice]" logs for every state change, mic open/close, and AI call.
//   - In the console, window.__infusioVoice exposes { state, history, lead } live.
// -----------------------------------------------------------------------------
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1) DOM hooks — the orb button and the status line live in HeroVoice.astro.
  //    If they are missing (other pages), the script does nothing.
  // ---------------------------------------------------------------------------
  const orb = document.getElementById('voice-orb');
  const statusEl = document.getElementById('voice-status');
  if (!orb || !statusEl) return;

  // Browser speech APIs. Chrome/Edge expose webkitSpeechRecognition; Safari/Firefox may not.
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const synth = window.speechSynthesis || null;

  // Endpoints can be overridden by the text panel's data-* attributes (keeps both UIs in sync).
  const ROOT = document.querySelector('.recept');
  const CHAT_URL = ROOT?.dataset?.action || '/api/chat';
  const LEAD_URL = ROOT?.dataset?.lead || '/api/lead';

  // ---------------------------------------------------------------------------
  // 2) Tunables — every timing below exists to prevent a specific, observed symptom.
  // ---------------------------------------------------------------------------
  const CFG = {
    TTS_TAIL_MS: 450,          // FR-002: wait after TTS ends before opening mic (speaker/room reverb decay).
    TTS_POLL_MS: 100,          // FR-002: how often we re-check speechSynthesis.speaking while waiting.
    RESTART_DELAY_MS: 250,     // Gap between silent listening windows (Chrome throws if restarted instantly).
    MAX_SILENT_WINDOWS: 4,     // FR-011: end the session after this many windows with no speech (~30 s).
    AI_TIMEOUT_MS: 15000,      // FR-007: abort /api/chat if the model hangs.
    VOICES_TIMEOUT_MS: 1500,   // FR-009: never wait forever for the voiceschanged event.
    MAX_HISTORY: 10,           // Turns sent to the server (server also caps at 10).
    MAX_REPLY_SENTENCES: 3,    // Keep spoken replies short; long TTS = more chance of echo + boredom.
  };

  // ---------------------------------------------------------------------------
  // 3) Debug logging (FR-014) — silent unless explicitly enabled.
  // ---------------------------------------------------------------------------
  const DEBUG = /[?&]voicedebug=1\b/.test(location.search || '') ||
    (() => { try { return localStorage.getItem('voiceDebug') === '1'; } catch { return false; } })();
  const log = (...a) => { if (DEBUG) console.debug('[voice]', ...a); };

  // ---------------------------------------------------------------------------
  // 4) Runtime state — the ONLY mutable variables. Keep this list short.
  // ---------------------------------------------------------------------------
  const STATES = { IDLE: 'IDLE', SPEAKING: 'SPEAKING', LISTENING: 'LISTENING', THINKING: 'THINKING' };
  let state = STATES.IDLE;     // FR-001: current state; change it only through setState().
  let session = 0;             // Incremented on every start/stop; async callbacks compare against it.
  let recGen = 0;              // FR-003: generation id of the current recognizer instance.
  let rec = null;              // Current SpeechRecognition instance (one per listening window).
  let currentUtterance = null; // Strong ref to the playing utterance (Chrome GC bug can drop onend otherwise).
  let ttsWatchdog = null;      // Fallback timer in case the browser never fires utterance.onend.
  let lastTtsEndAt = 0;        // Timestamp when TTS last stopped; used for the silence tail.
  let silentWindows = 0;       // FR-011: consecutive listening windows with no result.
  let greeted = false;         // Greet only once per page load.

  const history = [];          // Conversation turns sent to /api/chat: { role: 'user'|'assistant', content }.
  const turns = [];            // Human-readable transcript attached to the lead email.
  const lead = { name: '', email: '', phone: '', sent: false };
  let pendingEmail = '';       // FR-005: email awaiting a yes/no. Any unrelated utterance clears it.

  // ---------------------------------------------------------------------------
  // 5) Language handling — lock to EN or ES on the first utterance; switch only on request.
  // ---------------------------------------------------------------------------
  let lang = (navigator.language || 'en-US').toLowerCase().startsWith('es') ? 'es-ES' : 'en-US';
  let langLocked = false;
  const isES = () => lang.startsWith('es');
  const t = (en, es) => (isES() ? es : en); // tiny i18n helper for UI/status strings
  const looksSpanish = (s) => /[áéíóúñ¿¡]/i.test(s) ||
    /\b(hola|gracias|quiero|necesito|tienen|hacen|sitio|página|cuánto|cómo|qué|por favor|buenas?|correo)\b/i.test(s);

  function updateLanguage(utter) {
    if (/\b(english|in english|en inglés)\b/i.test(utter)) { lang = 'en-US'; langLocked = true; return; }
    if (/\b(español|spanish|en español)\b/i.test(utter)) { lang = 'es-ES'; langLocked = true; return; }
    if (!langLocked) { lang = looksSpanish(utter) ? 'es-ES' : 'en-US'; langLocked = true; }
  }

  // ---------------------------------------------------------------------------
  // 6) State + UI — single place that changes state, orb classes, and status text.
  // ---------------------------------------------------------------------------
  const setStatus = (text) => { statusEl.textContent = text; };

  function setState(next, reason = '') {
    if (state === next) return;
    log(`state ${state} → ${next}`, reason);
    state = next;
    // CSS hooks in global.css: .voice-orb.listening / .speaking / .thinking
    orb.classList.remove('listening', 'speaking', 'thinking');
    if (next === STATES.LISTENING) orb.classList.add('listening');
    if (next === STATES.SPEAKING) orb.classList.add('speaking');
    if (next === STATES.THINKING) orb.classList.add('thinking');
    const label = {
      IDLE: t('Tap the orb to speak.', 'Toca el orbe para hablar.'),
      SPEAKING: t('Speaking… tap to interrupt.', 'Hablando… toca para interrumpir.'),
      LISTENING: t('Listening… tap to stop.', 'Escuchando… toca para detener.'),
      THINKING: t('Thinking…', 'Pensando…'),
    }[next];
    setStatus(label);
  }

  // ---------------------------------------------------------------------------
  // 7) Text-to-speech
  // ---------------------------------------------------------------------------
  let voices = [];

  // FR-009: resolve as soon as voices exist, or after VOICES_TIMEOUT_MS no matter what.
  function loadVoices() {
    return new Promise((resolve) => {
      const now = synth?.getVoices?.() || [];
      if (now.length) { voices = now; return resolve(); }
      const done = () => { voices = synth?.getVoices?.() || []; resolve(); };
      try { synth?.addEventListener?.('voiceschanged', done, { once: true }); } catch {}
      setTimeout(done, CFG.VOICES_TIMEOUT_MS);
    });
  }

  // Prefer natural-sounding voices; fall back to any voice for the language, then any voice.
  function pickVoice(langTag) {
    const es = langTag.startsWith('es');
    const preferred = es
      ? [/Microsoft (Dalia|Paloma|Ximena|Elvira|Jorge).*Online/i, /^Paulina$/i, /^M[oó]nica$/i, /Google español/i]
      : [/Microsoft (Aria|Jenny|Ava|Emma|Guy).*Online/i, /^Google US English$/i, /^Samantha$/i];
    for (const rx of preferred) { const v = voices.find((x) => rx.test(x.name)); if (v) return v; }
    return voices.find((v) => (v.lang || '').toLowerCase().startsWith(es ? 'es' : 'en')) || voices[0] || null;
  }

  // Remove markdown/emoji so TTS doesn't read "asterisk asterisk".
  function cleanForSpeech(text) {
    return String(text || '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // [label](url) → label
      .replace(/https?:\/\/\S+/g, '')                  // bare URLs are unreadable aloud
      .replace(/[*_#`~>|]/g, '')                       // markdown symbols
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emoji
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Keep the first N sentences so spoken replies stay short.
  function limitSentences(text, n = CFG.MAX_REPLY_SENTENCES) {
    const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    return parts.slice(0, n).join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * speak(text): enter SPEAKING, play TTS, then hand control to the mic.
   * FR-002: mic is closed BEFORE audio starts; it reopens only via startListening().
   */
  async function speak(text) {
    const mySession = session;
    const clean = cleanForSpeech(text);
    if (!clean) { goListen('empty reply'); return; }

    closeMic('about to speak');          // never leave a mic open under TTS
    setState(STATES.SPEAKING, clean.slice(0, 60));
    turns.push({ who: 'ai', text: clean });

    if (!synth) { finishSpeaking(null, mySession); return; } // no TTS engine → just listen

    await loadVoices();
    if (mySession !== session || state !== STATES.SPEAKING) return; // user stopped/barged in meanwhile

    // Chrome bug: calling cancel() right before speak() can swallow the new utterance.
    // Only cancel if something is actually queued/playing.
    if (synth.speaking || synth.pending) { try { synth.cancel(); } catch {} }

    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang;
    u.rate = 1.0;
    u.pitch = 1.0;
    const v = pickVoice(lang);
    if (v) u.voice = v;

    currentUtterance = u; // strong reference (see state section)
    u.onend = () => finishSpeaking(u, mySession);
    u.onerror = (e) => { log('tts error', e?.error); finishSpeaking(u, mySession); };

    // Watchdog: ~80 ms per character + 3 s. If onend never fires, we still move on.
    clearTimeout(ttsWatchdog);
    ttsWatchdog = setTimeout(() => { log('tts watchdog fired'); finishSpeaking(u, mySession); }, clean.length * 80 + 3000);

    try { synth.speak(u); } catch (e) { log('synth.speak threw', e); finishSpeaking(u, mySession); }
  }

  // Called once per utterance (onend, onerror, or watchdog — whichever comes first).
  function finishSpeaking(u, mySession) {
    if (u && u !== currentUtterance) return;              // stale utterance (e.g. after barge-in)
    if (mySession !== session || state !== STATES.SPEAKING) return;
    clearTimeout(ttsWatchdog);
    currentUtterance = null;
    lastTtsEndAt = Date.now();
    goListen('tts finished');
  }

  // ---------------------------------------------------------------------------
  // 8) Speech recognition (microphone) — FR-002 / FR-003 / FR-011
  // ---------------------------------------------------------------------------

  // Resolve when TTS is fully silent AND the reverb tail has passed.
  async function waitForTtsSilence(mySession) {
    while (synth && (synth.speaking || synth.pending)) {
      if (mySession !== session) return false;
      await new Promise((r) => setTimeout(r, CFG.TTS_POLL_MS));
    }
    const remaining = lastTtsEndAt + CFG.TTS_TAIL_MS - Date.now();
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    return mySession === session;
  }

  // Transition helper: go to LISTENING and open the mic.
  function goListen(reason) {
    setState(STATES.LISTENING, reason);
    startListening();
  }

  // Close (abort) the current recognizer and invalidate its events by bumping recGen.
  function closeMic(reason) {
    if (!rec) return;
    log('mic close:', reason);
    const r = rec;
    rec = null;
    recGen++; // any event still in flight from `r` is now stale and will be ignored
    try { r.abort(); } catch {}
  }

  /**
   * startListening(): the ONLY function allowed to open the microphone (FR-003).
   * Creates a fresh recognizer per window; Chrome is unreliable when re-start()ing one instance.
   */
  async function startListening() {
    const mySession = session;
    if (!(await waitForTtsSilence(mySession))) return;
    if (state !== STATES.LISTENING || mySession !== session) return; // state changed while waiting
    if (rec) return;                                                 // a mic is already open

    const myGen = ++recGen;
    const r = new Recognition();
    rec = r;
    r.lang = lang;
    r.continuous = false;      // one utterance per window → clean turn-taking
    r.interimResults = false;  // final results only (interim results caused partial-sentence replies)
    r.maxAlternatives = 1;
    let gotResult = false;

    const isStale = () => myGen !== recGen || mySession !== session;

    r.onstart = () => { if (!isStale()) log('mic open (gen', myGen + ')', 'lang', r.lang); };

    r.onresult = (ev) => {
      if (isStale() || state !== STATES.LISTENING) { log('ignored stale/late result'); return; }
      // Collect final transcript(s) of this window.
      let text = '';
      for (let i = ev.resultIndex || 0; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal !== false) text += (res[0]?.transcript || '') + ' ';
      }
      text = text.trim();
      if (!text) return;
      gotResult = true;
      silentWindows = 0;
      handleUtterance(text);
    };

    r.onerror = (ev) => {
      if (isStale()) return;
      const code = ev?.error || 'unknown';
      log('mic error:', code);
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        stopConversation(t('Microphone blocked. Allow mic access or use the chat below.',
                           'Micrófono bloqueado. Permite el acceso o usa el chat abajo.'));
      }
      // 'no-speech', 'aborted', 'network' → onend follows and decides what to do.
    };

    r.onend = () => {
      if (isStale()) return;
      rec = null;
      if (state !== STATES.LISTENING || gotResult) return; // result is being handled elsewhere
      silentWindows++;
      log('silent window', silentWindows, '/', CFG.MAX_SILENT_WINDOWS);
      if (silentWindows >= CFG.MAX_SILENT_WINDOWS) {
        stopConversation(t('No voice detected. Tap the orb when you are ready.',
                           'No detecté tu voz. Toca el orbe cuando estés listo.'));
        return;
      }
      setTimeout(() => { if (!isStaleSession(mySession)) startListening(); }, CFG.RESTART_DELAY_MS);
    };

    try { r.start(); }
    catch (e) {
      log('recognizer.start threw', e?.message);
      rec = null;
      setTimeout(() => { if (!isStaleSession(mySession)) startListening(); }, CFG.RESTART_DELAY_MS * 2);
    }
  }

  const isStaleSession = (s) => s !== session || state !== STATES.LISTENING;

  // ---------------------------------------------------------------------------
  // 9) Turn handling — one user utterance in, one spoken reply out.
  // ---------------------------------------------------------------------------
  async function handleUtterance(text) {
    const mySession = session;
    closeMic('got utterance');
    setState(STATES.THINKING, `"${text}"`);
    updateLanguage(text);
    turns.push({ who: 'user', text });
    log('user said:', text);

    // (a) Local lead-capture side flow (FR-005, FR-013). Returns a reply or null.
    const local = handleLeadCapture(text);
    if (local) { await speak(local); return; }

    // (b) Everything else goes to the AI.
    history.push({ role: 'user', content: text });
    let reply = '';
    try {
      reply = await askAI();
    } catch (e) {
      log('AI error:', e?.name || e?.message || e);
    }
    if (mySession !== session) return; // user ended the session while we waited

    reply = limitSentences(cleanForSpeech(reply));
    if (!reply) {
      // FR-007: spoken fallback, keep the session alive.
      reply = t("Sorry, I'm having trouble connecting right now. Could you say that again, or type in the chat below?",
                'Perdón, tengo problemas de conexión. ¿Puedes repetirlo o escribir en el chat de abajo?');
    } else {
      history.push({ role: 'assistant', content: reply });
    }
    await speak(reply);
  }

  // ---------------------------------------------------------------------------
  // 10) Lead capture helpers (email / phone / name) — non-blocking by design.
  // ---------------------------------------------------------------------------
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const EMAIL_CUE = /@|\b(e-?mail|correo|arroba|gmail|hotmail|outlook|yahoo|icloud|proton)\b|\bdot com\b|\bpunto com\b/i;
  const YES_RE = /^\s*(yes|yeah|yep|correct|right|that'?s right|exactly|sí|si|claro|correcto|exacto|así es|eso es)\b/i;
  const NO_RE = /^\s*(no|nope|wrong|incorrect|incorrecto|no es)\b/i;
  const NAME_RE = /\b(?:my name is|i am|i'm|this is|soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][\p{L}'-]{1,})/iu;

  // Turn spoken email ("boris at gmail dot com", "b o r i s arroba gmail punto com") into text.
  function spokenToEmail(s) {
    let x = ` ${String(s).toLowerCase()} `;
    // Join single spelled letters/digits: "b o r i s" → "boris"
    x = x.replace(/\b((?:[a-z0-9]\s){2,}[a-z0-9])\b/g, (m) => m.replace(/\s/g, ''));
    x = x
      .replace(/\s(arroba|at)\s/g, '@')
      .replace(/\s(punto|dot)\s/g, '.')
      .replace(/\s(guion bajo|underscore)\s/g, '_')
      .replace(/\s(guion|dash|hyphen)\s/g, '-')
      .replace(/\bg mail\b/g, 'gmail')
      .replace(/\bhot mail\b/g, 'hotmail')
      .replace(/\s*@\s*/g, '@')
      .replace(/(\S)\s*\.\s*(\S)/g, '$1.$2');
    return (x.match(EMAIL_RE) || [null])[0];
  }

  /** Returns a local reply string if this utterance was a lead-capture turn, else null. */
  function handleLeadCapture(text) {
    // Opportunistic, silent captures (never block the conversation).
    if (!lead.name) { const m = text.match(NAME_RE); if (m) lead.name = m[1]; }
    if (!lead.phone) {
      const digits = (text.match(/\+?\d[\d\s().-]{6,}\d/) || [''])[0].replace(/[^\d+]/g, '');
      if (digits.replace(/\D/g, '').length >= 7) lead.phone = digits; // FR-013: ≥7 literal digits
    }

    // A new email in the utterance (only when the user is clearly talking about email).
    const email = EMAIL_CUE.test(text) ? spokenToEmail(text) : null;
    if (email) {
      pendingEmail = email;
      return t(`I heard ${email}. Is that correct?`, `Entendí ${email}. ¿Es correcto?`);
    }

    // Confirmation of a pending email.
    if (pendingEmail) {
      if (YES_RE.test(text)) {
        lead.email = pendingEmail;
        pendingEmail = '';
        sendLead();
        return t("Perfect, thanks! We'll send the calendar invite there. Anything else I can help with?",
                 '¡Perfecto, gracias! Enviaremos la invitación ahí. ¿Algo más en lo que te ayude?');
      }
      if (NO_RE.test(text)) {
        pendingEmail = '';
        return t('No problem. Please say your email again, slowly.',
                 'Sin problema. Dime tu correo de nuevo, despacio.');
      }
      // FR-005: unrelated utterance → drop the pending email and let the AI answer.
      log('pending email dropped (unrelated utterance)');
      pendingEmail = '';
    }
    return null;
  }

  // POST the lead once we have a confirmed email. Failures are logged, never spoken.
  async function sendLead() {
    if (lead.sent || !EMAIL_RE.test(lead.email)) return;
    lead.sent = true; // set first to avoid double-sends from rapid turns
    const payload = {
      source: 'infusio-site', channel: 'voice', mode: 'lead',
      name: lead.name, email: lead.email, phone: lead.phone, consent: true,
      transcript: turns.map((x) => `${x.who === 'user' ? 'User' : 'AI'}: ${x.text}`).join('\n'),
      utm: Object.fromEntries(new URLSearchParams(location.search || '')),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ua: navigator.userAgent,
    };
    try {
      const r = await fetch(LEAD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      log('lead POST', r.status);
      if (!r.ok) lead.sent = false; // allow a retry on the next confirmed email
    } catch (e) {
      lead.sent = false;
      log('lead POST failed', e);
    }
  }

  // ---------------------------------------------------------------------------
  // 11) AI call — POST /api/chat, stream SSE, return the full reply text.
  // ---------------------------------------------------------------------------
  async function askAI() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.AI_TIMEOUT_MS); // FR-007
    try {
      log('AI request, turns:', history.length);
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // FR-012: only user/assistant turns; the server owns the persona/system prompt.
        body: JSON.stringify({ mode: 'voice', locale: lang, messages: history.slice(-CFG.MAX_HISTORY) }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`chat HTTP ${res.status}`);

      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('text/event-stream') || !res.body) {
        const j = await res.json().catch(() => ({}));
        return j?.choices?.[0]?.message?.content || j?.content || '';
      }

      // FR-008: buffered SSE parser — network chunks can cut a "data: {...}" line in half.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep the (possibly partial) last line for the next chunk
        for (const line of lines) full += parseSseLine(line);
      }
      full += parseSseLine(buffer); // flush whatever is left
      return full.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  // Extract the text delta from one SSE line ("data: {json}"). Comments/keep-alives return ''.
  function parseSseLine(line) {
    const s = line.trim();
    if (!s.startsWith('data:')) return '';
    const data = s.slice(5).trim();
    if (!data || data === '[DONE]') return '';
    try {
      const j = JSON.parse(data);
      const c = j?.choices?.[0];
      return c?.delta?.content ?? c?.message?.content ?? '';
    } catch { return ''; }
  }

  // ---------------------------------------------------------------------------
  // 12) Session control — start / stop / barge-in (FR-010)
  // ---------------------------------------------------------------------------
  function startConversation() {
    session++;
    silentWindows = 0;
    log('session start', session);
    if (!greeted) {
      greeted = true;
      // Speak synchronously within the click (user activation) so browsers allow TTS.
      speak(t("Hi, I'm the Infusio assistant. How can I help you today?",
              'Hola, soy el asistente de Infusio. ¿En qué te puedo ayudar hoy?'));
    } else {
      goListen('session restart');
    }
  }

  function stopConversation(message) {
    session++; // invalidates every pending timer/fetch/recognizer callback
    log('session stop', message || '');
    closeMic('session stop');
    clearTimeout(ttsWatchdog);
    currentUtterance = null;
    if (synth && (synth.speaking || synth.pending)) { try { synth.cancel(); } catch {} }
    setState(STATES.IDLE, 'stop');
    if (message) setStatus(message);
  }

  function bargeIn() {
    log('barge-in');
    clearTimeout(ttsWatchdog);
    currentUtterance = null; // makes the cancelled utterance's onend a no-op
    try { synth?.cancel(); } catch {}
    lastTtsEndAt = Date.now();
    goListen('barge-in');
  }

  orb.addEventListener('click', () => {
    // No SpeechRecognition (Safari/Firefox): send the visitor to the text receptionist.
    if (!Recognition) {
      setStatus(t('Voice is not supported in this browser. Opening the chat…',
                  'La voz no está disponible en este navegador. Abriendo el chat…'));
      const target = document.getElementById('book') || document.querySelector('.recept');
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      setTimeout(() => target?.querySelector?.('input, textarea')?.focus?.(), 600);
      return;
    }
    if (state === STATES.IDLE) return startConversation();
    if (state === STATES.SPEAKING) return bargeIn();
    return stopConversation(); // LISTENING or THINKING → end session
  });

  // Warm up the voice list early so the first reply doesn't wait on it.
  if (synth) loadVoices();

  // ---------------------------------------------------------------------------
  // 13) Operator handle (FR-014) — read-only view for the browser console and tests.
  // ---------------------------------------------------------------------------
  window.__infusioVoice = {
    get state() { return state; },
    get lang() { return lang; },
    get history() { return history.slice(); },
    get lead() { return { ...lead, pendingEmail }; },
  };
})();
