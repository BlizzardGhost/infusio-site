// /public/scripts/voice-receptionist.js
(() => {
  const orb    = document.getElementById('voice-orb');
  const status = document.getElementById('voice-status');
  if (!orb || !status) return;

  const Recognition = window.webkitSpeechRecognition || window.SpeechRecognition;
  const synth       = window.speechSynthesis;

  // ---------------- System + few-shot (guidance; not hard-coded answers) ----------------
  const SYSTEM = [
    'You are Infusio Receptionist — concise, warm, bilingual (EN/ES).',
    'Scope: fast Astro/Vercel websites, practical automations, ethical AI assistants, integrations (HubSpot/Stripe/etc.), analytics, and a calm business cockpit.',
    'Avoid jargon. Use 1–2 short sentences unless the user asks for details.',
    'If asked about medical/wellness/spa: explain we don’t provide those, and restate what we DO offer.',
    'If unsure: offer to check by email or book a short call.'
  ].join(' ');

  const FEWSHOT = [
    { role: 'user',      content: 'Hi' },
    { role: 'assistant', content: 'Hi—happy to help with your website or automations. What do you want to achieve first?' },
    { role: 'user',      content: 'I need a website' },
    { role: 'assistant', content: 'Great—should it generate leads, take bookings, or sell? We build fast Astro/Vercel sites and connect CRM/payments.' },
    { role: 'user',      content: '¿Hacen sitios web?' },
    { role: 'assistant', content: 'Sí. Creamos sitios rápidos con Astro/Vercel y automatizaciones. ¿Quieres captar leads, reservas o ventas primero?' }
  ];

  // Conversation state shared with backend
  const convo = [{ role: 'system', content: SYSTEM }, ...FEWSHOT];

  // ---------------- Lead-capture state (EN/ES heuristics) ----------------
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phoneRe = /\+?\d[\d\s().-]{6,}/;
  const nameRe  = /\b(?:i am|i’m|im|soy|me llamo)\s+([A-ZÁÉÍÓÚÑ][\p{L}\-']{1,})/iu;

  const lead = { name:'', email:'', phone:'', consent:false, sent:false };
  const turns = []; // {who:'user'|'ai', text:string}

  function maybeCapture(text){
    if (!text) return;
    if (!lead.email){ const m = text.match(emailRe); if (m) lead.email = m[0].trim(); }
    if (!lead.phone){ const m = text.match(phoneRe); if (m) lead.phone = m[0].trim(); }
    if (!lead.name){  const m = text.match(nameRe);  if (m) lead.name  = m[1].trim(); }
    const t = text.toLowerCase();
    if (!lead.consent && /\b(yes|yep|sure|ok|okay|agree|consent|sí|claro|de acuerdo)\b/.test(t)) lead.consent = true;
  }

  async function trySendLead(){
    if (lead.sent) return;

    const lastUser = [...turns].reverse().find(t => t.who === 'user')?.text || '';
    const intent = detectIntent(lastUser);
    const hasContact = !!(lead.email || lead.phone);
    if (!hasContact) return;
    if (intent === 'generic') return;
    const consentish = lead.consent || intent === 'book' || /book|agendar|reserva/i.test(lastUser);
    if (!consentish) return;

    const transcript = turns.map(t => (t.who === 'user' ? 'User: ' : 'AI: ') + t.text).join('\n');
    const utm = Object.fromEntries(new URLSearchParams(location.search));
    const payload = {
      source:'infusio-site',
      channel:'voice',
      mode:'lead',
      name: lead.name, email: lead.email, phone: lead.phone,
      message: transcript,
      utm,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ua: navigator.userAgent
    };

    try{
      await fetch('/api/lead', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      lead.sent = true; // server triggers Supabase + Telegram
    }catch(e){
      // non-fatal; we’ll retry later if another message arrives
      console.error('Lead send failed', e);
    }
  }

  // ---------------- Runtime flags ----------------
  let conversationActive = false;  // single tap starts/stops the whole session
  let listening = false;
  let speaking  = false;
  let rec       = null;
  let lastUser  = '';
  let restartTimer = null;

  // Sidetone guard (prevents hearing itself on phones)
  let echoGuardUntil = 0; // ms timestamp until which we ignore STT results

  // Default language guess
  let currentRecLang = (navigator.language || 'en-US').toLowerCase().startsWith('es') ? 'es-ES' : 'en-US';

  // ---------------- UI helpers ----------------
  const setStatus = (t) => { status.textContent = t; };

  // ----- Voice loading utility (Chrome/Safari + Edge Natural) -----
  let voicesCache = [];
  function loadVoices() {
    return new Promise((resolve) => {
      const ready = () => {
        voicesCache = (synth?.getVoices?.() || []).slice();
        resolve(voicesCache);
      };
      const existing = synth?.getVoices?.() || [];
      if (existing.length) { voicesCache = existing.slice(); return resolve(voicesCache); }
      if ('onvoiceschanged' in synth) synth.onvoiceschanged = () => { ready(); };
      else setTimeout(ready, 150);
    });
  }
  const IS_EDGE = /\bEdg\//.test(navigator.userAgent);

  const PREF = {
    en_edge: [
      /^Microsoft (Aria|Jenny|Ava|Emma|Michelle|Christopher) Online \(Natural\).*English \(United States\)/i,
      /^Microsoft (Libby|Sonia|Ryan|Thomas) Online \(Natural\).*English \(United Kingdom\)/i
    ],
    es_edge: [
      /^Microsoft (Dalia|Jorge|Alvaro|Paloma|Elvira|Alonso|Ximena|Camila|Maria|Luis|Carlos|Lorena|Andrea|Margarita|Teresa) Online \(Natural\).*Spanish/i
    ],
    en_web: [
      /^Google US English$/i, /^Google UK English Female$/i, /^Samantha$/i,
      /^Daniel\b.*United Kingdom/i, /^Arthur$/i, /^Martha$/i, /^Moira$/i
    ],
    es_web: [
      /^Paulina$/i, /^M[oó]nica$/i, /^Google español$/i, /^Google español de Estados Unidos$/i
    ]
  };

  function pickVoiceFor(langTag){
    const voices = voicesCache.length ? voicesCache : (synth?.getVoices?.() || []);
    const isES   = langTag.toLowerCase().startsWith('es');
    const poolFirst = IS_EDGE
      ? (isES ? PREF.es_edge : PREF.en_edge)
      : (isES ? PREF.es_web  : PREF.en_web);

    for (const rx of poolFirst){ const v = voices.find(v => rx.test(v.name)); if (v) return v; }
    const byLang = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langTag.toLowerCase()));
    if (byLang) return byLang;
    const googleUS = voices.find(v => v.name === 'Google US English');
    return googleUS || voices[0] || null;
  }

  async function ensureVoiceListReady(){
    if (!voicesCache.length) await loadVoices();
  }

  function speak(text, langGuess = 'en-US') {
    if (!text) return;
    (async () => {
      try {
        await ensureVoiceListReady();

        // Stop recognizer while speaking (prevents mid-sentence pickup)
        try { if (rec && listening) rec.stop(); } catch {}

        const u = new SpeechSynthesisUtterance(text);
        u.lang = langGuess;
        u.rate = 1.0; u.pitch = 1.0; u.volume = 1;

        const v = pickVoiceFor(langGuess);
        if (v) u.voice = v;

        u.onstart = () => { speaking = true; orb.classList.add('speaking'); };
        u.onend   = () => {
          speaking = false;
          orb.classList.remove('speaking');
          // ignore room echo just after TTS ends (mobile)
          echoGuardUntil = Date.now() + 900;
          if (conversationActive) {
            queueRestartListening(750);
            setStatus(langGuess.startsWith('es') ? 'Escuchando…' : 'Listening…');
          } else {
            setStatus('Tap the orb to speak.');
          }
        };

        synth.cancel();
        synth.speak(u);
      } catch {}
    })();
  }

  // ---------------- Language & content helpers ----------------
  const ES_TOKENS   = /\b(hola|gracias|sí|claro|por favor|para|con|de|buen[oa]s|agendar|cita|correo|tel[eé]fono|automatizaciones|sitio|web|servicios|página|páginas)\b/i;
  const ES_ACCENTS  = /[áéíóúñ¿¡]/;
  const looksSpanish = (s) => !!s && (ES_TOKENS.test(s) || ES_ACCENTS.test(s));

  const MEDICAL_WORDS = /\b(spa|massage|masaje|wellness|terapia|therapy|doctor|m[eé]dico|cl[ií]nica|clinic|acup(?:u|)nct(?:ure|ura)|fisioterapia|tratamiento|treatment)\b/i;
  const userAskedMedical = (s) => MEDICAL_WORDS.test(s || '');

  function cleanAPINoise(raw) {
    if (!raw) return '';
    return raw
      .replace(/^\s*(Object|choices?|index|delta|finish reason|logprobs|data)[:\s].*$/gmi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function deJargon(t) {
    if (!t) return t;
    t = t.replace(/\b(synergy|leverage|paradigm|revolutioni[sz]e|disrupt(?:ive)?|unlock|transformative|sherpa)\b/gi, '')
         .replace(/\s+/g, ' ').trim();
    const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.slice(0, 2).join(' ');
  }

  function correctScope(reply, lastUserUtterance, lang) {
    const asked = userAskedMedical(lastUserUtterance);
    const replyMentions = MEDICAL_WORDS.test(reply);

    if (!replyMentions) return reply;
    if (asked) {
      return lang.startsWith('es')
        ? 'No ofrecemos servicios médicos ni de spa. Nos enfocamos en sitios Astro/Vercel y automatizaciones útiles. ¿Quieres agendar una llamada corta?'
        : 'We don’t provide medical or spa services. We focus on Astro/Vercel sites and helpful automations. Want me to book a quick call?';
    }
    return lang.startsWith('es')
      ? reply.replace(MEDICAL_WORDS, 'nuestros sitios web y automatizaciones').replace(/\s+/g, ' ').trim()
      : reply.replace(MEDICAL_WORDS, 'our websites and automations').replace(/\s+/g, ' ').trim();
  }

  function detectIntent(s) {
    s = (s || '').toLowerCase();
    if (/\b(web|website|site|sitio|p[aá]gina)\b/.test(s)) return 'website';
    if (/\b(automation|automations|automatizaciones|zapier|make|n8n)\b/.test(s)) return 'automation';
    if (/\b(book|call|meet|agenda|agendar|cita|schedule)\b/.test(s)) return 'book';
    if (/\b(bug|issue|error|reporte?|reportar)\b/.test(s)) return 'bug';
    if (/\b(whatsapp)\b/.test(s)) return 'whatsapp';
    return 'generic';
  }

  function upgradeIfGeneric(reply, user, lang) {
    const r = (reply || '').trim();
    const tooShort = r.length < 18;
    const genericish = /\b(i('?m| am) (here|happy) to help|how can i help|let me know|glad to help)\b/i.test(r);
    if (!tooShort && !genericish) return r;

    const intent = detectIntent(user);
    if (lang.startsWith('es')) {
      switch (intent) {
        case 'website':
          return 'Perfecto. ¿Qué debe lograr primero tu sitio: captar leads, reservas o ventas? Creamos sitios rápidos con Astro/Vercel y conectamos CRM/pagos.';
        case 'automation':
          return 'De acuerdo. ¿Qué tarea repetitiva quieres automatizar primero? Integramos herramientas como HubSpot, Stripe, Zapier/Make.';
        case 'book':
          return 'Puedo agendar una llamada de 10 minutos. ¿Qué días te van mejor, esta semana o la próxima?';
        case 'bug':
          return 'Cuéntame el bug en una frase y, si puedes, el paso para reproducirlo. Te ayudo a registrarlo y darle seguimiento.';
        case 'whatsapp':
          return 'Podemos integrar WhatsApp para leads y atención. ¿Prefieres responder desde HubSpot o por email?';
        default:
          return 'Puedo ayudarte con tu sitio y automatizaciones. ¿Qué quieres lograr primero? También puedo agendar una llamada corta.';
      }
    } else {
      switch (intent) {
        case 'website':
          return 'Great. What should the site do first: generate leads, take bookings, or sell? We build fast Astro/Vercel sites and connect CRM/payments.';
        case 'automation':
          return 'Got it. What repetitive task do you want to automate first? We integrate tools like HubSpot, Stripe, Zapier/Make.';
        case 'book':
          return 'I can book a 10-minute intro. Does this week or next work better for you?';
        case 'bug':
          return 'Tell me the bug in one line and, if possible, how to reproduce it. I’ll log it and follow up.';
        case 'whatsapp':
          return 'We can integrate WhatsApp for leads and basic support. Do you want replies inside HubSpot or via email?';
        default:
          return 'I can help with your website and automations. What do you want to achieve first? I can also book a short call.';
      }
    }
  }

  // If intent is booking but we lack contact, append a gentle ask
  function maybeAppendContactAsk(reply, user, lang){
    const needContact = !(lead.email || lead.phone);
    if (!needContact) return reply;
    const intent = detectIntent(user);
    if (intent !== 'book') return reply;

    const ask = lang.startsWith('es')
      ? ' ¿Cuál es tu mejor correo para confirmarte?'
      : ' What’s the best email to confirm?';
    return /[.!?…]$/.test(reply.trim()) ? (reply + ' ' + ask) : (reply + '. ' + ask);
  }

  // ---------------- Backend call ----------------
  function extractChunk(line) {
    try {
      const j = JSON.parse(line);
      const ch = j?.choices?.[0] ?? {};
      return ch?.delta?.content ?? ch?.message?.content ?? j?.content ?? '';
    } catch { return ''; }
  }

  async function askAI(userText) {
    const payload = {
      mode: 'voice',
      locale: currentRecLang,
      message: userText,
      history: convo,
      messages: convo
    };
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          const piece = extractChunk(data);
          if (piece) full += piece;
        }
      }
      return full.trim();
    }

    try {
      const j = await res.json();
      return (
        j?.choices?.[0]?.message?.content ??
        j?.choices?.[0]?.delta?.content ??
        j?.content ??
        JSON.stringify(j)
      ).trim();
    } catch {
      return (await res.text()).trim();
    }
  }

  // ---------------- Recognizer + auto-rearm loop ----------------
  if (!Recognition) {
    setStatus('Voice isn’t available in this browser. Try Chrome or Edge.');
    return;
  }

  function clearRestartTimer() {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  }
  function queueRestartListening(delay = 300) {
    clearRestartTimer();
    if (!conversationActive) return;
    restartTimer = setTimeout(() => {
      if (!rec) return;
      if (speaking) return; // wait until speech ends
      try {
        if (rec.lang !== currentRecLang) rec.lang = currentRecLang;
        rec.start();
      } catch {}
    }, delay);
  }

  async function ensureMicAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch {
      setStatus(currentRecLang.startsWith('es')
        ? 'Permiso de micrófono bloqueado o sin micrófono disponible.'
        : 'Mic permission blocked or no mic available.');
      return false;
    }
  }

  function makeRecognizer() {
    const r = new Recognition();
    r.lang = currentRecLang;
    r.continuous = false;
    r.interimResults = false;

    r.onstart = () => {
      listening = true;
      orb.classList.add('listening');
      setStatus(r.lang.startsWith('es') ? 'Escuchando… Toca para detener.' : 'Listening… Tap to stop.');
    };
    r.onend = () => {
      listening = false;
      orb.classList.remove('listening');
      if (conversationActive && !speaking) queueRestartListening(250);
      else if (!conversationActive) setStatus('Tap the orb to speak.');
    };
    r.onspeechend = () => { try { r.stop(); } catch {} };

    r.onerror = (e) => {
      listening = false;
      orb.classList.remove('listening');
      if (!conversationActive) return;
      const code = e?.error || 'unknown';
      if (code === 'no-speech' || code === 'aborted' || code === 'network') {
        queueRestartListening(350);
      } else {
        setStatus((r.lang.startsWith('es') ? 'Error de micrófono: ' : 'Mic error: ') + code);
        queueRestartListening(900);
      }
    };

    r.onresult = async (ev) => {
      // Ignore anything captured within the sidetone guard window
      if (Date.now() < echoGuardUntil) { queueRestartListening(400); return; }

      const utter = ev.results?.[0]?.[0]?.transcript?.trim();
      if (!utter) {
        if (conversationActive) queueRestartListening(300);
        else setStatus(r.lang.startsWith('es') ? 'No se entendió.' : 'Didn’t catch that.');
        return;
      }

      lastUser = utter;
      currentRecLang = looksSpanish(utter) ? 'es-ES' : 'en-US';
      convo.push({ role: 'user', content: utter });
      turns.push({ who:'user', text: utter });
      maybeCapture(utter);

      try {
        setStatus(currentRecLang.startsWith('es') ? 'Pensando…' : 'Thinking…');

        let raw = await askAI(utter);
        raw = cleanAPINoise(raw) || (currentRecLang.startsWith('es')
          ? 'Puedo ayudarte con tu sitio y automatizaciones.'
          : 'I can help with your site and automations.');

        let fixed = correctScope(raw, lastUser, currentRecLang);
        fixed = deJargon(fixed);
        fixed = upgradeIfGeneric(fixed, lastUser, currentRecLang);
        fixed = maybeAppendContactAsk(fixed, lastUser, currentRecLang);

        convo.push({ role: 'assistant', content: fixed });
        turns.push({ who:'ai', text: fixed });

        // try to send lead in the background
        trySendLead();

        setStatus(currentRecLang.startsWith('es') ? 'Hablando…' : 'Speaking…');
        speak(fixed, currentRecLang);

      } catch {
        setStatus(currentRecLang.startsWith('es') ? 'Error de IA. Reintentando…' : 'AI error. Retrying…');
        if (conversationActive) queueRestartListening(600);
      }
    };

    return r;
  }

  // ---------------- Orb single-tap conversation control ----------------
  orb.addEventListener('click', async () => {
    // Barge-in: interrupt speech
    if (speaking) {
      synth.cancel();
      speaking = false;
      orb.classList.remove('speaking');
      echoGuardUntil = Date.now() + 600; // short guard after manual interruption
      if (conversationActive) {
        queueRestartListening(250);
        setStatus(currentRecLang.startsWith('es') ? 'Escuchando…' : 'Listening…');
      } else {
        setStatus('Tap the orb to speak.');
      }
      return;
    }

    // If currently listening, stop the whole session
    if (conversationActive) {
      conversationActive = false;
      clearRestartTimer();
      try { rec && rec.stop(); } catch {}
      setStatus('Tap the orb to speak.');
      return;
    }

    // Start session
    if (!Recognition) { setStatus('Voice not available here.'); return; }
    if (!(await ensureMicAccess())) return;

    conversationActive = true;
    if (!rec) rec = makeRecognizer();
    if (rec.lang !== currentRecLang) rec.lang = currentRecLang;

    // Optional hint for private windows (that often block mic)
    try {
      if (navigator?.storage?.estimate) {
        const est = await navigator.storage.estimate();
        if (est?.quota && est.quota < 200 * 1024 * 1024) {
          setStatus(currentRecLang.startsWith('es')
            ? 'Escuchando… (la navegación privada puede bloquear el micrófono)'
            : 'Listening… (private windows may block the mic)');
        }
      }
    } catch {}

    try { rec.start(); } catch {}
  });

  // Warm the voices list (some browsers load async)
  if (synth && typeof synth.onvoiceschanged !== 'undefined') {
    synth.onvoiceschanged = () => { synth.getVoices(); };
  }
})();