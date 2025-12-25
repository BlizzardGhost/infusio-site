const root   = document.querySelector('.recept');
if (!root) { console.warn('Receptionist root not found'); }

const chatURL = root?.dataset.action || '/api/chat';
const leadURL = root?.dataset.lead   || '/api/lead';

const log     = root?.querySelector('.log');
const form    = root?.querySelector('#leadForm');
const input   = root?.querySelector('#chatInput');
const chipsUI = root?.querySelector('#chips');

// ----- Read config from the page -----
const CFG = (() => {
  try { return JSON.parse(document.getElementById('recept-config')?.textContent || "{}"); }
  catch { return {}; }
})();
const SYSTEM  = CFG.system || null;
const ANSWERS = CFG.answers || {};
const VARS    = CFG.vars || {};

// ----- Conversation state -----
const history = [];
if (SYSTEM) history.push({ role: 'system', content: SYSTEM });

let haveHadAUserTurn = false;

const state = {
  name:'', email:'', phone:'',
  consent:false, consentAsked:false, consentPending:false, consentSynced:false,
  leadSent:false,
  _hintName:false // whether we've pushed the "name known" hint
};

// --- Hydrate from previous session ---
try {
  const saved = JSON.parse(localStorage.getItem('recept.state') || '{}');
  if (saved && typeof saved === 'object') Object.assign(state, saved);
} catch {}

// Persist helper
function persist(){ try { localStorage.setItem('recept.state', JSON.stringify(state)); } catch {} }

// ----- UI helpers -----
function row(kind){ const r = document.createElement('div'); r.className = `rmsg ${kind}`; return r; }
function bubble(text=''){ const b = document.createElement('div'); b.className = 'rbubble'; b.textContent = text; return b; }
function user(text){ const r=row('user'); const b=bubble(text); r.appendChild(b); log.appendChild(r); log.scrollTop = log.scrollHeight; return b; }
function bot(text){ const r=row('bot');  const b=bubble(text); r.appendChild(b); log.appendChild(r); log.scrollTop = log.scrollHeight; return b; }
function typingBubble(){
  const r = row('bot');
  const b = bubble('');
  b.classList.add('typing');
  b.innerHTML = `<span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
  r.appendChild(b); log.appendChild(r); log.scrollTop = log.scrollHeight;
  return b;
}

// ----- Lightweight capture (USER ONLY) -----
const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneRe = /\+?\d[\d\s().-]{6,}/;

// “my name is / soy / me llamo / i am / this is …”
const namePhrases = /\b(?:my name is|i am|i’m|im|this is|soy|me llamo)\s+([a-záéíóúñ'-]{2,})(?:\s+([a-záéíóúñ'-]{2,}))?(?:\s+([a-záéíóúñ'-]{2,}))?/i;
const nameStop = new Set(['the','ok','okay','thanks','thank','hola','hello','si','sí','yes','no','please']);
function cleanWord(w){ return (w || '').replace(/[^a-záéíóúñ'-]/gi,'').toLowerCase(); }

function maybeCaptureFromUser(text){
  let changed = false;

  // email / phone from the user's message
  if (!state.email){ const m = text.match(emailRe); if (m) { state.email = m[0].trim(); changed = true; } }
  if (!state.phone){ const m = text.match(phoneRe); if (m) { state.phone = m[0].trim(); changed = true; } }

  // name: phrase-based first…
  if (!state.name){
    const nm = text.match(namePhrases);
    if (nm){
      const parts = [nm[1], nm[2], nm[3]].filter(Boolean).map(cleanWord);
      const valid = parts.filter(p => p.length >= 2 && !nameStop.has(p));
      if (valid.length){
        state.name = valid.map(s => s[0].toUpperCase() + s.slice(1)).join(' ');
        changed = true;
      }
    }
    // …otherwise accept a single capitalized word (e.g., “Ana”)
    if (!state.name){
      const oneWord = text.trim().match(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]{1,}$/);
      if (oneWord && !nameStop.has(oneWord[0].toLowerCase())){
        state.name = oneWord[0];
        changed = true;
      }
    }
  }

  // consent only if we asked for it
  const t = (text || '').toLowerCase();
  if (!state.consent && state.consentPending && /\b(yes|yep|sure|okay|ok|agree|consent|sí|si|claro|de acuerdo)\b/.test(t)){
    state.consent = true;
    state.consentPending = false;
    changed = true;
  }

  if (changed) persist();

  // if we just learned the name, push a tiny non-invasive hint so the model doesn't ask again
  if (state.name && !state._hintName){
    history.push({ role:'system', content:`The user's name is ${state.name}. Do not ask for their name again.` });
    state._hintName = true;
    persist();
  }
}

// Ask consent once (after we have an email/phone)
function maybeAskConsent(){
  if (state.consent || state.consentAsked) return;
  if (!(state.email || state.phone)) return;
  bot("Quick check: may I store your details and send follow-ups about Infusio? (yes/no)");
  state.consentAsked   = true;
  state.consentPending = true;
  persist();
}

// ----- Lead capture: SILENT upsert -----
async function trySendLead(){
  if (state.leadSent) return;
  if (!state.email && !state.phone) return;

  const transcript = [...log.querySelectorAll('.rbubble')].slice(-14).map(n=>n.textContent).join('\n');
  const utm = Object.fromEntries(new URLSearchParams(location.search));

  const payload = {
    source:'infusio-site',
    channel:'receptionist',
    mode:'lead',
    name: state.name,
    email: state.email,
    phone: state.phone,
    consent: !!state.consent,
    message: transcript,
    utm,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent
  };

  try{
    const r = await fetch(leadURL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('lead endpoint returned ' + r.status);
    state.leadSent = true;
    persist();
  }catch(e){
    console.error('Lead save failed:', e);
  }
}

// If consent arrives after first send, update silently (once)
let consentUpdateInFlight = false;
async function tryUpdateConsent(){
  if (!state.consent || !state.email || state.consentSynced || consentUpdateInFlight) return;
  consentUpdateInFlight = true;
  try{
    const r = await fetch(leadURL, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'consent-update', email: state.email, consent:true })
    });
    if (r.ok){
      state.consentSynced = true;
      persist();
    }
  }catch(e){
    console.error('Consent update failed:', e);
  } finally {
    consentUpdateInFlight = false;
  }
}

// ----- Streaming (LLM-first; local answers only as fallback) -----
function extractChunk(payload){
  try{
    const j = JSON.parse(payload);
    const ch = j?.choices?.[0] ?? {};
    return ch?.delta?.content ?? ch?.message?.content ?? '';
  }catch{ return ''; }
}

// Local quick answers (used only if the network/LLM call fails)
const compiled = Object.entries(ANSWERS).map(([k, v]) => ({
  key: k,
  patterns: (v?.patterns || []).map(p => { try{ return new RegExp(p, 'i'); } catch { return null; } }).filter(Boolean),
  responses: v?.responses || {}
}));
const looksSpanish = (s) => /[áéíóúñ¿¡]|\b(hola|número|correo|agendar|cita|whatsapp|tel[eé]fono)\b/i.test(s || '');
function fillVars(text){ return (text || '').replace(/\{([a-z0-9_]+)\}/gi, (_, k) => (VARS[k] ?? `{${k}}`)); }
function tryLocalAnswer(userText){
  if (!compiled.length) return null;
  for (const a of compiled){
    if (a.patterns.some(rx => rx?.test(userText))){
      const lang = looksSpanish(userText) ? 'es' : 'en';
      const raw  = a.responses[lang] || a.responses.en || '';
      return fillVars(raw);
    }
  }
  return null;
}

async function streamAI(){
  const b = typingBubble();
  try{
    const res = await fetch(chatURL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages: history })
    });

    let full = '';
    const ct = res.headers.get('content-type') || '';

    if (ct.includes('text/event-stream') && res.body){
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true){
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream:true });
        for (const line of chunk.split('\n')){
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          const piece = extractChunk(data);
          if (piece){
            if (b.classList.contains('typing')) { b.classList.remove('typing'); b.textContent = ''; }
            full += piece;
            b.textContent = full;
            log.scrollTop = log.scrollHeight;
          }
        }
      }
    } else {
      try{
        const j = await res.json();
        full = j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.delta?.content ?? JSON.stringify(j);
      }catch{
        full = await res.text();
      }
      b.classList.remove('typing');
      b.textContent = full || 'I’m here.';
    }

    const reply = (b.textContent || '').trim();
    if (reply) history.push({ role:'assistant', content: reply });
    return reply;
  }catch(err){
    console.error('AI stream error:', err);
    const lastUser = [...history].reverse().find(m => m.role === 'user')?.content || '';
    const local = tryLocalAnswer(lastUser);
    const msg = local || 'Network error talking to the AI.';
    b.classList.remove('typing'); b.textContent = msg;
    if (local) history.push({ role:'assistant', content: msg });
    return msg;
  }
}

// Chips behave as type-ahead
chipsUI?.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  input.value = btn.dataset.pick;
  input.focus();
});

// Main submit
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  if (!raw) return;

  if (log.hidden) log.hidden = false;

  user(raw);
  history.push({ role:'user', content: raw });
  maybeCaptureFromUser(raw);      // <-- capture ONLY user turns
  input.value = '';

  const _promptForThisTurn = haveHadAUserTurn
    ? `Follow-up (same conversation; please do not greet again): ${raw}`
    : raw;
  haveHadAUserTurn = true;

  const reply = await streamAI();
  // IMPORTANT: no maybeCapture(reply) — never parse assistant messages

  if (reply && chipsUI && chipsUI.hidden) chipsUI.hidden = false;

  maybeAskConsent();
  trySendLead();
  tryUpdateConsent();
});

// Enter = send, Shift+Enter = newline
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    form.requestSubmit();
  }
});
