// /public/scripts/voice-receptionist.js
// This script handles the voice interaction with the AI receptionist.
// It uses the browser's SpeechRecognition and SpeechSynthesis APIs to
// recognize the user's voice and speak the AI's response.
(() => {
  const orb    = document.getElementById('voice-orb');
  const status = document.getElementById('voice-status');
  if (!orb || !status) return;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth       = window.speechSynthesis;

  // Align with ReceptionistPanel data-* if present
  const ROOT     = document.querySelector('.recept') || document.body;
  const BACKEND_URL = orb.dataset.backendUrl || '';
  const CHAT_URL = ROOT?.dataset?.action || `${BACKEND_URL}/api/chat`;
  const LEAD_URL = ROOT?.dataset?.lead   || `${BACKEND_URL}/api/lead`;

  // ---------------- Source-of-truth config (shared with text UI) ----------------
  const CLIENT_CFG = (() => {
    try { return JSON.parse(document.getElementById('recept-config')?.textContent || '{}'); }
    catch { return {}; }
  })();

  // Receptionist behavior: natural lead capture & appointment setting (guidelines, not scripts)
  const SYSTEM = (CLIENT_CFG.system || [
    'You are the Infusio Receptionist — friendly, concise, bilingual (EN/ES), and service-oriented.',
    'Behave like a human receptionist: greet, clarify needs, suggest the next best step, and coordinate contact/booking details when helpful.',
    'Prioritize scheduling: when the user shows interest or a concrete goal, guide to a short 10–15 min call and schedule it now via the connected Cal.com. Do not say you will email options; propose times, confirm, and finalize.',
    'Capture details naturally (name, best email for the calendar invite, and phone) during the first 2–3 turns once interest is clear — not all at once, and only when relevant.',
    'Confirm the email exactly as heard. Keep each turn to 1–2 short sentences. Avoid jargon and pushy sales tone.',
    'Stick to the user’s language unless they explicitly switch.',
    'We build fast Astro/Vercel websites, practical automations, ethical AI assistants, CRM/payments/calendar integrations, and an operator dashboard for SMBs.',
    'We do not provide medical/spa services; we support those businesses with websites and automations.'
  ]).toString();

  const FEWSHOT = Array.isArray(CLIENT_CFG.fewshot) && CLIENT_CFG.fewshot.length
    ? CLIENT_CFG.fewshot
    : [
        { role: 'user',      content: 'Hi' },
        { role: 'assistant', content: 'Hi! I can help with your website or automations. What do you want to achieve first?' },
        { role: 'user',      content: '¿Hacen sitios web?' },
        { role: 'assistant', content: 'Sí. Creamos sitios rápidos con Astro/Vercel y automatizaciones. ¿Buscas leads, reservas o ventas primero?' }
      ];
  const convo = [{ role: 'system', content: SYSTEM }, ...FEWSHOT];

  // ---------------- Lead-capture state ----------------
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phoneRe = /\+?\d[\d\s().-]{6,}/;
  const nameRe  = /\b(?:my name is|i am|i’m|im|this is|soy|me llamo)\s+([A-ZÁÉÍÓÚÑ][\p{L}\-']{1,})/iu;

  // Hints that the utterance is about email; used to suppress name capture in those turns (ES/EN variants)
  const EMAILISH_HINTS = /\b(correo(?:\s+electrónico)?|email|mail|e[-\s]?mail|arroba|aroba|arrova|arova|a\s*roba|gmail|outlook|hotmail|yahoo|icloud|proton|dot|punto|puntocom)\b|@/i;

  const lead = {
    name:'', email:'', phone:'',
    consent:false, sent:false, sentAt:0
  };

  // Email confirmation flow
  let emailCandidate = '';
  let awaitingEmailConfirm = false;  // asking: “is <email> correct?”
  let emailConfirmed = false;

  // Booking nudge / agreement tracking
  let bookingSuggested = false;

  // Generic “awaiting answer” flag (used to slow loop & avoid interruptions)
  let awaitingAnswer = false;

  // ---------------- Debug helpers ----------------
  const DEBUG = true; // set false to silence logs
  const log = (...a) => { if (DEBUG) console.debug('[voice]', ...a); };

  // ---------------- Speech normalization helpers ----------------
  // These functions are used to normalize the user's speech,
  // making it easier to parse and understand.
  const WORD_DIGITS = {
    'zero':'0','oh':'0','o':'0','one':'1','two':'2','to':'2','too':'2',
    'three':'3','four':'4','for':'4','five':'5','six':'6','seven':'7',
    'eight':'8','ate':'8','nine':'9'
  };
  function wordsToDigits(s=''){
    return s.replace(/\b(zero|oh|o|one|two|to|too|three|four|for|five|six|seven|eight|ate|nine)\b/gi,
      (m)=>WORD_DIGITS[m.toLowerCase()] ?? m);
  }
  function collapseSpelledLetters(s=''){
    // "b o r i s at g m a i l dot com" -> "boris at gmail dot com"
    const tokens = s.split(/\s+/);
    const out = []; let buf = [];
    const pushBuf = () => { if (buf.length) { out.push(buf.join('')); buf.length = 0; } };
    for (const t of tokens) {
      const isLetter = /^[a-záéíóúñ]$/i.test(t);
      const isDigit  = /^[0-9]$/.test(t);
      if (isLetter || isDigit) { buf.push(t.toLowerCase()); continue; }
      pushBuf(); out.push(t);
    }
    pushBuf();
    return out.join(' ');
  }
  function dedupeLocalPart(t=''){
    // Fix "boris boris @gmail.com" => "boris @gmail.com" and "borisboris@gmail.com"
    let prev;
    for (let i=0;i<3;i++){
      prev = t;
      t = t.replace(/\b([a-z0-9._%+-]+)\s+\1(\s*@)/ig, '$1$2'); // word word @
      t = t.replace(/\b([a-z0-9._%+-]+)\1@/ig, '$1@');          // wordword@
      if (t === prev) break;
    }
    return t;
  }

  function normalizeEmailSpeech(s=''){
    let t = (s || '').toLowerCase().trim();
    t = collapseSpelledLetters(t);
    t = dedupeLocalPart(t);

    // Variantes típicas que dicta el STT (ES/EN)
    t = t
      // "@"
      .replace(/\b(a\s*roba|arro?ba|aroba|arrova|arova)\b/g, '@')
      .replace(/\b(at|add|ad|hat)\b/g, '@')
      // "."
      .replace(/\b(punto|puntos|dot|period|point)\b/g, '.')
      // "_" "-" "+"
      .replace(/\b(underscore|guion(?:\s*bajo)?)\b/g, '_')
      .replace(/\b(hyphen|dash|guion)\b/g, '-')
      .replace(/\b(plus|más|mas)\b/g, '+')
      // “hot mail” -> “hotmail”, “g mail” -> “gmail”
      .replace(/\bhot\s*mail\b/g, 'hotmail')
      .replace(/\bg\s*mail\b/g, 'gmail');

    // Colapsa espacios solo alrededor de signos del email
    t = t
      .replace(/(\S)\s*@\s*(\S)/g, '$1@$2')
      .replace(/(\S)\s*\.\s*(\S)/g, '$1.$2')
      .replace(/(\S)\s*_\s*(\S)/g, '$1_$2')
      .replace(/(\S)\s*-\s*(\S)/g, '$1-$2')
      .replace(/(\S)\s*\+\s*(\S)/g, '$1+$2');

    // “punto com/es/net/org”
    t = t.replace(/\b(punto\s+)(com|co|es|net|org)\b/g, '.$2');

    return t;
  }

  function maybeExtractEmail(text){
    if (!text) return null;

    const hits = [];
    const pushMatches = (s, tag) => {
      const m = s.match(emailRe);
      if (m) hits.push(m[0].trim());
      if (DEBUG) console.debug('[voice] email-scan (' + tag + '):', s);
    };

    // Raw primero (a veces Chrome clava el email perfecto)
    pushMatches(text, 'raw');

    // Normalizado (maneja “nombre arroba gmail punto com”, etc.)
    const norm = normalizeEmailSpeech(text);
    pushMatches(norm, 'norm');

    const email = hits.length ? hits[hits.length - 1] : null; // preferir el último (permite corrección por repetición)
    if (email) log('email detected:', email, 'from:', norm);
    return email;
  }

  // --- Partial email correction helpers (domain-only) -----------------
  const DOMAIN_ONLY_RE = /\b(gmail|hotmail|outlook|icloud|yahoo|proton)\b(?:\s*(?:\.|punto|dot)\s*)?(com|co|es|net|org)?\b/i;

  function maybeDomainOnly(text=''){
    const norm = normalizeEmailSpeech(text);
    const m = norm.match(DOMAIN_ONLY_RE);
    if (!m) return null;
    const d = (m[1] || '').toLowerCase();
    const t = (m[2] || 'com').toLowerCase();
    return { domain: `${d}.${t}` };
  }

  function replaceCandidateDomain(candidate='', newDomain=''){
    if (!candidate || !newDomain) return candidate;
    if (!candidate.includes('@')) return candidate;
    const local = candidate.split('@')[0];
    return `${local}@${newDomain}`;
  }

  function maybeExtractPhone(text){
    if (!text) return null;
    const n = wordsToDigits(text);
    const m = n.match(phoneRe);
    const p = m ? m[0].replace(/[^\d+]/g,'').trim() : null;
    if (p) log('phone detected:', p, 'from:', text);
    return p;
  }

  // ---- Safe capture: avoid stealing the first part of an email as a name
  function captureName(text){
    if (lead.name) return;
    const lower = (text || '').toLowerCase();
    if (EMAILISH_HINTS.test(lower)) return; // skip this turn if talking about email

    // Si hay “mi correo es / email”, solo toma el fragmento antes de esa frase
    const splitOnEmail = text.split(/\b(?:mi\s+correo\s+es|correo|email|e[-\s]?mail|my\s+email\s+is)\b/i)[0];
    const m = splitOnEmail.match(nameRe);
    if (m) { lead.name = (m[1] || '').trim(); log('name captured:', lead.name); }
  }

  function capturePhone(text){
    if (lead.phone) return;
    const p = maybeExtractPhone(text);
    if (p) {
      lead.phone = p;
      if (!lead.email && !awaitingEmailConfirm && !emailConfirmed) {
        askAndWait(
          currentRecLang.startsWith('es')
            ? '¿Cuál es tu mejor correo para la invitación del calendario?'
            : 'What’s the best email for the calendar invite?',
          currentRecLang
        );
      }
    }
  }

  function askAndWait(line, lang){
    awaitingAnswer = true;
    speak(line, lang, { longGuard: true }); // extra quiet time after TTS
  }

  function maybeStartEmailConfirm(text, lang){
    if (awaitingEmailConfirm || emailConfirmed) return false;
    const em = maybeExtractEmail(text);
    if (!em) return false;
    emailCandidate = em;
    awaitingEmailConfirm = true;
    log('→ starting email confirm for:', emailCandidate);
    askAndWait(
      lang.startsWith('es')
        ? `Tomé tu correo como ${emailCandidate}. ¿Está correcto? Di sí o no.`
        : `I heard your email as ${emailCandidate}. Is that correct? Say yes or no.`,
      lang
    );
    return true;
  }

  // Allow correction-by-repetition while awaiting confirmation (full or domain-only)
  function handleEmailConfirmTurn(text, lang){
    if (!awaitingEmailConfirm) return false;

    // (A) Full new email -> update & re-confirm
    const full = maybeExtractEmail(text);
    if (full && full !== emailCandidate) {
      emailCandidate = full;
      awaitingAnswer = true;
      log('email corrected by user (full); now candidate =', emailCandidate);
      speak(
        lang.startsWith('es')
          ? `Ahora tomé tu correo como ${emailCandidate}. ¿Está correcto? Di sí o no.`
          : `I now heard your email as ${emailCandidate}. Is that correct? Say yes or no.`,
        lang,
        { shortGuard: true }
      );
      return true;
    }

    // (B) Domain-only correction, e.g., "hotmail punto com"
    const dom = maybeDomainOnly(text);
    if (dom) {
      const updated = replaceCandidateDomain(emailCandidate, dom.domain);
      if (updated !== emailCandidate) {
        emailCandidate = updated;
        awaitingAnswer = true;
        log('email domain corrected; now candidate =', emailCandidate);
        speak(
          lang.startsWith('es')
            ? `Entendido. ¿Quedaría ${emailCandidate}? Di sí o no.`
            : `Got it. Is it ${emailCandidate}? Say yes or no.`,
          lang,
          { shortGuard: true }
        );
        return true;
      }
    }

    // (C) Yes / No (ES+EN natural variants)
    const t = (text||'').toLowerCase();
    const yes = /\b(s[ií]|sí|si|claro|correcto|exacto|as[ií]\s*es|así\s*es|est[aá]\s*bien|de\s*acuerdo|vale|listo|ese\s*es|eso\s*es|ok|okay|yes|yep|yeah|right|correct)\b/.test(t);
    const no  = /\b(no|nop|nope|incorrecto|casi|no\s*es|mejor|cambia|corrige|wrong)\b/.test(t);

    if (yes){
      lead.email = emailCandidate;
      emailCandidate = '';
      awaitingEmailConfirm = false;
      emailConfirmed = true;
      awaitingAnswer = false;
      log('email confirmed:', lead.email);
      speak(lang.startsWith('es') ? 'Perfecto, gracias.' : 'Perfect, thanks.', lang, { shortGuard:true });
      trySendLead();
      return true;
    }
    if (no){
      emailCandidate = '';
      awaitingEmailConfirm = false;
      emailConfirmed = false;
      awaitingAnswer = false;
      log('email rejected; asking again');
      askAndWait(
        lang.startsWith('es')
          ? 'Sin problema. Por favor di tu correo de nuevo con claridad.'
          : 'No problem. Please say your email again clearly.',
        lang
      );
      return true;
    }

    // Neither full email nor yes/no nor domain-only: keep listening silently
    return true;
  }

  // Consent detection (voice)
  function maybeConsent(text){
    const t = (text||'').toLowerCase();
    if (!lead.consent && /\b(yes|yep|yeah|sure|ok|okay|agree|consent|sí|si|claro|de acuerdo|vale|listo)\b/.test(t)){
      lead.consent = true;
      log('consent implied by utterance');
    }
  }

  // ---------------- Lead send (must have CONFIRMED email for router) ----------------
  // This function sends the captured lead information to the backend.
  // It only sends the lead if the user has confirmed their email address.
  async function trySendLead(){
    if (lead.sent) return;
    if (!(lead.email && emailConfirmed && emailRe.test(lead.email))) return;

    const now = Date.now();
    if (now - lead.sentAt < 1200) return;

    const transcript = turns.map(t => (t.who === 'user' ? 'User: ' : 'AI: ') + t.text).join('\n');
    const utm = Object.fromEntries(new URLSearchParams(location.search));
    const payload = {
      source:   'infusio-site',
      channel:  'voice',
      mode:     'lead',
      name:     lead.name || '',
      email:    lead.email || '',
      phone:    lead.phone || '',
      consent:  !!lead.consent,
      transcript,
      utm,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ua: navigator.userAgent
    };

    try{
      log('sending lead payload', payload);
      const r = await fetch(LEAD_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if (!r.ok) { console.warn('[voice] /api/lead HTTP error', r.status); return; }
      const jr = await r.json().catch(()=>null);
      if (jr?.status === 'invalid_email' || jr?.status === 'need_valid_email') {
        console.warn('[voice] router refused email:', jr?.status);
        return;
      }
      lead.sent = true;
      lead.sentAt = now;
      log('lead sent OK');
    }catch(e){
      console.warn('[voice] lead send failed', e);
    }
  }

  // ---------------- Runtime & language ----------------
  const turns = []; // {who:'user'|'ai', text}
  let conversationActive = false;
  let listening = false;
  let speaking  = false;
  let rec       = null;
  let lastUser  = '';
  let restartTimer = null;
  let echoGuardUntil = 0;
  let greeted = false;

  // Language lock
  const ES_TOKENS   = /\b(hola|gracias|sí|claro|por favor|para|con|de|buen[oa]s|agendar|cita|correo|tel[eé]fono|automatizaciones|sitio|web|servicios|página|páginas)\b/i;
  const ES_ACCENTS  = /[áéíóúñ¿¡]/;
  const looksSpanish = (s) => !!s && (ES_TOKENS.test(s) || ES_ACCENTS.test(s));
  let lockedLang = null; // 'en' | 'es'
  function wantSwitchToES(s=''){ return /\b(español|habla en español|en español|switch to spanish)\b/i.test(s); }
  function wantSwitchToEN(s=''){ return /\b(english|speak in english|en inglés|switch to english)\b/i.test(s); }
  function nextLangFor(utter) {
    if (!lockedLang) lockedLang = looksSpanish(utter) ? 'es' : 'en';
    if (lockedLang === 'en' && wantSwitchToES(utter)) lockedLang = 'es';
    if (lockedLang === 'es' && wantSwitchToEN(utter)) lockedLang = 'en';
    return lockedLang === 'es' ? 'es-ES' : 'en-US';
  }
  let currentRecLang = (navigator.language || 'en-US').toLowerCase().startsWith('es') ? 'es-ES' : 'en-US';

  // ---------------- UI helpers ----------------
  const setStatus = (t) => { status.textContent = t; };

  // ---------------- Voices (stable selection) ----------------
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
      else setTimeout(ready, 180);
    });
  }
  const IS_EDGE = /\bEdg\//.test(navigator.userAgent);
  const PREF = {
    en_edge: [/^Microsoft (Aria|Jenny|Ava|Emma|Michelle|Christopher) Online \(Natural\).*English \(United States\)/i],
    es_edge: [/^Microsoft (Dalia|Jorge|Paloma|Ximena|Maria|Luis|Carlos|Lorena|Andrea) Online \(Natural\).*Spanish/i],
    en_web:  [/^Google US English$/i, /^Samantha$/i, /^Daniel\b.*United Kingdom/i],
    es_web:  [/^Paulina$/i, /^M[oó]nica$/i, /^Google español( de Estados Unidos)?$/i]
  };
  function pickVoiceFor(langTag){
    const voices = voicesCache.length ? voicesCache : (synth?.getVoices?.() || []);
    const isES   = langTag.toLowerCase().startsWith('es');
    const pool   = IS_EDGE ? (isES ? PREF.es_edge : PREF.en_edge) : (isES ? PREF.es_web : PREF.en_web);
    for (const rx of pool){ const v = voices.find(v => rx.test(v.name)); if (v) return v; }
    const byLang = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langTag.toLowerCase()));
    if (byLang) return byLang;
    return voices[0] || null;
  }
  let selectedVoices = { 'en-US': null, 'es-ES': null };

  async function ensureVoiceReady(){
    if (!voicesCache.length) await loadVoices();
    if (!selectedVoices['en-US']) selectedVoices['en-US'] = pickVoiceFor('en-US');
    if (!selectedVoices['es-ES']) selectedVoices['es-ES'] = pickVoiceFor('es-ES');
  }

  function speak(text, langGuess = 'en-US', opts = {}) {
    if (!text) return;
    const { longGuard = false, shortGuard = false } = opts;

    const LONG_GUARD = 1000;
    const SHORT_GUARD = 600;
    const DEFAULT_GUARD = 700;

    (async () => {
      try {
        await ensureVoiceReady();
        // Stop recognizer while speaking
        try { if (rec && listening) rec.stop(); } catch {}

        synth.cancel(); // ensure single utterance (prevents overlap)
        const u = new SpeechSynthesisUtterance(text);
        u.lang = langGuess;
        u.rate = 1.0; u.pitch = 1.0; u.volume = 1;

        const v = selectedVoices[langGuess] || pickVoiceFor(langGuess);
        if (v) u.voice = v;

        u.onstart = () => { speaking = true; orb.classList.add('speaking'); };
        u.onend   = () => {
          speaking = false;
          orb.classList.remove('speaking');

          const guard = longGuard ? LONG_GUARD : shortGuard ? SHORT_GUARD : DEFAULT_GUARD;
          echoGuardUntil = Date.now() + guard;

          if (conversationActive) {
            queueRestartListening(shortGuard ? 450 : longGuard ? 650 : 500);
            setStatus(langGuess.startsWith('es') ? 'Escuchando…' : 'Listening…');
          } else {
            setStatus('Tap the orb to speak.');
          }
        };

        synth.speak(u);
      } catch (e) {
        console.warn('[voice] speak failed', e);
      }
    })();
  }

  // ---------------- Content fixups ----------------
  const MEDICAL_WORDS = /\b(spa|massage|masaje|wellness|terapia|therapy|doctor|m[eé]dico|cl[ií]nica|clinic|acup(?:u|)nct(?:ure|ura)|fisioterapia|tratamiento|treatment)\b/i;
  function userAskedMedical(s){ return MEDICAL_WORDS.test(s || ''); }

  function cleanAPINoise(raw) {
    if (!raw) return '';
    return raw.replace(/^\s*(Object|choices?|index|delta|finish reason|logprobs|data)[:\s].*$/gmi, ' ')
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

  // Intent detection & booking bias
  function detectIntent(s) {
    s = (s || '').toLowerCase();
    if (/\b(web|website|site|sitio|p[aá]gina)\b/.test(s)) return 'website';
    if (/\b(automation|automations|automatizaciones|zapier|make|n8n)\b/.test(s)) return 'automation';
    if (/\b(book|call|meet|meeting|agenda|agendar|cita|schedule|schedulear)\b/.test(s)) return 'book';
    if (/\b(bug|issue|error|reporte?|reportar)\b/.test(s)) return 'bug';
    if (/\b(whatsapp)\b/.test(s)) return 'whatsapp';
    return 'generic';
  }
  function isAffirmative(s='') {
    return /\b(yes|yep|yeah|sure|ok|okay|please|dale|va|claro|sí|si|de acuerdo|perfecto|vale|listo)\b/i.test(s);
  }
  function wantsToBookDirectly(s='') {
    return /\b(book|schedule|call|meet|meeting|cita|agendar|agenda|reunión|reunion|tomorrow|today|esta semana|pr[oó]xima semana|next week|this week)\b/i.test(s);
  }

  function bookingUpgrade(reply, user, lang) {
    if (lead.email || awaitingEmailConfirm) return { text: reply, nudged: false };
    const intent = detectIntent(user);
    const interested = (intent === 'website' || intent === 'automation' || intent === 'book');
    if (!interested) return { text: reply, nudged: false };
    const add = lang.startsWith('es')
      ? '¿Quieres que te agende una llamada de 10–15 minutos?'
      : 'Want me to book a 10–15 minute call?';
    const out = (reply || '').trim();
    const text = out ? `${out} ${add}` : add;
    return { text, nudged: true };
  }

  function upgradeIfGeneric(reply, user, lang) {
    const r = (reply || '').trim();
    const tooShort = r.length < 18;
    const genericish = /\b(i('?m| am) (here|happy) to help|how can i help|let me know|glad to help)\b/i.test(r);
    if (!tooShort && !genericish) return r;
    const intent = detectIntent(user);
    if (lang.startsWith('es')) {
      switch (intent) {
        case 'website':   return 'Perfecto. ¿Qué debe lograr primero tu sitio: captar leads, reservas o ventas?';
        case 'automation':return 'De acuerdo. ¿Qué tarea repetitiva quieres automatizar primero?';
        case 'book':      return 'Puedo agendar una llamada de 10–15 minutos. ¿Esta semana o la próxima?';
        case 'bug':       return 'Cuéntame el bug en una frase y, si puedes, el paso para reproducirlo.';
        case 'whatsapp':  return 'Podemos integrar WhatsApp para leads y atención. ¿Te interesa?';
        default:          return 'Puedo ayudarte con tu sitio y automatizaciones. ¿Qué quieres lograr primero?';
      }
    } else {
      switch (intent) {
        case 'website':   return 'Great. What should the site do first: leads, bookings, or sales?';
        case 'automation':return 'Got it. What repetitive task do you want to automate first?';
        case 'book':      return 'I can book a 10–15 minute intro. This week or next?';
        case 'bug':       return 'Tell me the bug in one line and how to reproduce it.';
        case 'whatsapp':  return 'We can add WhatsApp for leads and support. Interested?';
        default:          return 'I can help with your website and automations. What do you want to achieve first?';
      }
    }
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
    const payload = { mode: 'voice', locale: currentRecLang, message: userText, history: convo, messages: convo };
    const res = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let full = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim(); if (!data || data === '[DONE]') continue;
          const piece = extractChunk(data); if (piece) full += piece;
        }
      }
      return full.trim();
    }
    try {
      const j = await res.json();
      return (j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.delta?.content ?? j?.content ?? JSON.stringify(j)).trim();
    } catch {
      return (await res.text()).trim();
    }
  }

  // ---------------- Recognizer loop ----------------
  // This is the main loop of the voice receptionist.
  // It listens for the user's voice, sends it to the AI, and speaks the response.
  if (!Recognition) {
    setStatus('Voice isn’t available in this browser. Try Chrome or Edge.');
    return;
  }
  function clearRestartTimer() { if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; } }
  function queueRestartListening(delay = 500) {
    clearRestartTimer();
    if (!conversationActive) return;
    restartTimer = setTimeout(() => {
      if (!rec) return;
      if (speaking) return;
      try { if (rec.lang !== currentRecLang) rec.lang = currentRecLang; rec.start(); } catch {}
    }, delay);
  }
  async function ensureMicAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setStatus(currentRecLang.startsWith('es') ? 'Permiso de micrófono denegado.' : 'Mic permission denied.');
      } else {
        setStatus(currentRecLang.startsWith('es') ? 'Permiso de micrófono bloqueado.' : 'Mic permission blocked.');
      }
      return false;
    }
  }
  function makeRecognizer() {
    const r = new Recognition();
    r.lang = currentRecLang;
    r.continuous = false;      // short bursts; we re-arm ourselves
    r.interimResults = false;  // only final results

    r.onstart = () => {
      listening = true;
      orb.classList.add('listening');
      setStatus(r.lang.startsWith('es') ? 'Escuchando… Toca para detener.' : 'Listening… Tap to stop.');
    };
    r.onend   = () => {
      listening = false;
      orb.classList.remove('listening');
      if (conversationActive && !speaking) queueRestartListening(awaitingAnswer ? 700 : 500);
      else if (!conversationActive) setStatus('Tap the orb to speak.');
    };
    r.onspeechend = () => { try { r.stop(); } catch {} };
    r.onerror = (e) => {
      listening = false; orb.classList.remove('listening'); if (!conversationActive) return;
      const code = e?.error || 'unknown';
      if (code === 'no-speech' || code === 'aborted' || code === 'network') queueRestartListening(awaitingAnswer ? 700 : 550);
      else { setStatus((r.lang.startsWith('es') ? 'Error de micrófono: ' : 'Mic error: ') + code); queueRestartListening(700); }
    };

    r.onresult = async (ev) => {
      if (Date.now() < echoGuardUntil) { queueRestartListening(awaitingAnswer ? 700 : 500); return; }
      const utter = ev.results?.[0]?.[0]?.transcript?.trim();
      if (!utter) { if (conversationActive) queueRestartListening(awaitingAnswer ? 700 : 500); else setStatus(r.lang.startsWith('es') ? 'No se entendió.' : 'Didn’t catch that.'); return; }

      log('UTTER:', utter);
      lastUser = utter;
      currentRecLang = nextLangFor(utter);
      convo.push({ role: 'user', content: utter });
      turns.push({ who:'user', text: utter });

      // Capture user-provided data (safe)
      captureName(utter);
      capturePhone(utter);

      // If user wants to book (or says yes after a nudge) and we still lack email, ask for email immediately (skip AI)
      if ((wantsToBookDirectly(utter) || (bookingSuggested && isAffirmative(utter))) && !lead.email && !awaitingEmailConfirm && !emailConfirmed) {
        bookingSuggested = false;
        log('booking intent detected – asking for email');
        return askAndWait(
          currentRecLang.startsWith('es')
            ? 'Genial. ¿Cuál es tu mejor correo para la invitación del calendario?'
            : 'Great. What’s your best email for the calendar invite?',
          currentRecLang
        );
      }

      // If we're waiting for email confirmation, ONLY handle yes/no or a new email (or domain-only correction)
      if (awaitingEmailConfirm) {
        if (handleEmailConfirmTurn(utter, currentRecLang)) {
          return queueRestartListening(550);
        }
        return queueRestartListening(550);
      }

      // If the user just gave an email, start confirmation flow and DO NOT answer with AI
      if (maybeStartEmailConfirm(utter, currentRecLang)) {
        return; // wait for user yes/no
      }

      maybeConsent(utter);

      // If we asked a question (awaitingAnswer), don't generate AI chatter—just keep listening
      if (awaitingAnswer) {
        return queueRestartListening(600);
      }

      try {
        setStatus(currentRecLang.startsWith('es') ? 'Pensando…' : 'Thinking…');

        let raw = await askAI(utter);
        raw = cleanAPINoise(raw) || (currentRecLang.startsWith('es')
          ? 'Puedo ayudarte con tu sitio y automatizaciones.'
          : 'I can help with your site and automations.');

        let fixed = correctScope(raw, lastUser, currentRecLang);
        fixed = deJargon(fixed);
        fixed = upgradeIfGeneric(fixed, lastUser, currentRecLang);

        // Add a booking nudge when appropriate (only if we still don’t have email)
        const nudged = bookingUpgrade(fixed, lastUser, currentRecLang);
        fixed = nudged.text;
        if (nudged.nudged) bookingSuggested = true;

        convo.push({ role: 'assistant', content: fixed });
        turns.push({ who:'ai', text: fixed });

        // Attempt to send (will only proceed if email is confirmed)
        trySendLead();

        setStatus(currentRecLang.startsWith('es') ? 'Hablando…' : 'Speaking…');
        speak(fixed, currentRecLang);

      } catch {
        setStatus(currentRecLang.startsWith('es') ? 'Error de IA. Reintentando…' : 'AI error. Retrying…');
        if (conversationActive) queueRestartListening(700);
      }
    };
    return r;
  }

  // ---------------- Orb tap to start/stop ----------------
  orb.addEventListener('click', async () => {
    // Barge-in: interrupt speech
    if (speaking) {
      synth.cancel(); speaking = false; orb.classList.remove('speaking');
      echoGuardUntil = Date.now() + 500;
      if (conversationActive) { queueRestartListening(450); setStatus(currentRecLang.startsWith('es') ? 'Escuchando…' : 'Listening…'); }
      else setStatus('Tap the orb to speak.');
      return;
    }
    // Stop session
    if (conversationActive) {
      conversationActive = false; clearRestartTimer(); awaitingAnswer = false; bookingSuggested = false;
      try { rec && rec.stop(); } catch {}
      setStatus('Tap the orb to speak.');
      return;
    }
    // Start session
    if (!Recognition) { setStatus('Voice not available here.'); return; }
    if (!(await ensureMicAccess())) return;

    conversationActive = true;
    awaitingAnswer = false;
    bookingSuggested = false;
    if (!rec) rec = makeRecognizer();
    if (rec.lang !== currentRecLang) rec.lang = currentRecLang;

    // Greet once right after starting (no emoji)
    if (!greeted) {
      greeted = true;
      const greet = currentRecLang.startsWith('es')
        ? 'Hola, soy el Asistente de Infusio. ¿Como puedo ayudarte hoy?'
        : 'Welcome, I’m the Infusio Assistant. How can I assist you today?';
      speak(greet, currentRecLang, { shortGuard:true });
      return;
    }

    try { rec.start(); } catch {}
  });

  // Warm voices
  if (synth && typeof synth.onvoiceschanged !== 'undefined') {
    synth.onvoiceschanged = () => { synth.getVoices(); };
  }
})();