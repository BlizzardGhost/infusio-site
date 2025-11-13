const root   = document.querySelector('.recept');
if (!root) { console.warn('Receptionist root not found'); }

const chatURL = root?.dataset.action || '/api/chat';
const leadURL = root?.dataset.lead   || '/api/lead';

const log     = root?.querySelector('.log');
const form    = root?.querySelector('#leadForm');
const input   = root?.querySelector('#chatInput');
const chipsUI = root?.querySelector('#chips');

const CFG = (() => {
  try { return JSON.parse(document.getElementById('recept-config')?.textContent || "{}"); }
  catch { return {}; }
})();
const SYSTEM  = CFG.system || null;
const ANSWERS = CFG.answers || {};
const VARS    = CFG.vars || {};

const history = [];
if (SYSTEM) history.push({ role: 'system', content: SYSTEM });

let haveHadAUserTurn = false;

const state = {
  name:'', email:'', phone:'',
  consent:false, consentAsked:false, consentPending:false, consentSynced:false,
  leadSent:false,
  _hintName:false
};

try {
  const saved = JSON.parse(localStorage.getItem('recept.state') || '{}');
  if (saved && typeof saved === 'object') Object.assign(state, saved);
} catch {}

function persist(){ try { localStorage.setItem('recept.state', JSON.stringify(state)); } catch {} }

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

const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneRe = /\+?\d[\d\s().-]{6,}/;

const namePhrases = /\b(?:my name is|i am|i’m|im|this is|soy|me llamo)\s+([a-záéíóúñ'-]{2,})(?:\s+([a-záéíóúñ'-]{2,}))?(?:\s+([a-záéíóúñ'-]{2,}))?/i;
const nameStop = new Set(['the','ok','okay','thanks','thank','hola','hello','si','sí','yes','no','please']);
function cleanWord(w){ return (w || '').replace(/[^a-záéíóúñ'-]/gi,'').toLowerCase(); }

function maybeCaptureFromUser(text){
  let changed = false;

  if (!state.email){ const m = text.match(emailRe); if (m) { state.email = m[0].trim(); changed = true; } }
  if (!state.phone){ const m = text.match(phoneRe); if (m) { state.phone = m[0].trim(); changed = true; } }

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
    if (!state.name){
      const oneWord = text.trim().match(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]{1,}$/);
      if (oneWord && !nameStop.has(oneWord[0].toLowerCase())){
        state.name = oneWord[0];
        changed = true;
      }
    }
  }

  const t = (text || '').toLowerCase();
  if (!state.consent && state.consentPending && /\b(yes|yep|sure|okay|ok|agree|consent|sí|si|claro|de acuerdo)\b/.test(t)){
    state.consent = true;
    state.consentPending = false;
    changed = true;
  }

  if (changed) persist();

  if (state.name && !state._hintName){
    history.push({ role:'system', content:`The user's name is ${state.name}. Do not ask for their name again.` });
    state._hintName = true;
    persist();
  }
}

function maybeAskConsent(){
  if (state.consent || state.consentAsked) return;
  if (!(state.email || state.phone)) return;
  bot("Quick check: may I store your details and send follow-ups about Infusio? (yes/no)");
  state.consentAsked   = true;
  state.consentPending = true;
  persist();
}

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

function extractChunk(payload){
  try{
    const j = JSON.parse(payload);
    const ch = j?.choices?.[0] ?? {};
    return ch?.delta?.content ?? ch?.message?.content ?? '';
  }catch{ return ''; }
}

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

chipsUI?.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  input.value = btn.dataset.pick;
  input.focus();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  if (!raw) return;

  if (log.hidden) log.hidden = false;

  user(raw);
  history.push({ role:'user', content: raw });
  maybeCaptureFromUser(raw);
  input.value = '';

  const _promptForThisTurn = haveHadAUserTurn
    ? `Follow-up (same conversation; please do not greet again): ${raw}`
    : raw;
  haveHadAUserTurn = true;

  const reply = await streamAI();

  if (reply && chipsUI && chipsUI.hidden) chipsUI.hidden = false;

  maybeAskConsent();
  trySendLead();
  tryUpdateConsent();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    form.requestSubmit();
  }
});
