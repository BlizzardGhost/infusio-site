// tests/voice-receptionist.test.mjs
// Purpose: Automated acceptance tests for the hero voice orb (Spec 001, AC-1 … AC-10).
// How it works (for debug operators):
//   - Loads public/scripts/voice-receptionist.js into an isolated Node `vm` context.
//   - Replaces browser APIs with controllable fakes:
//       FakeRecognition  → window.webkitSpeechRecognition (we decide when the "user" speaks)
//       FakeSynth        → window.speechSynthesis         (we decide when TTS finishes)
//       fetch            → scripted /api/chat (SSE) and /api/lead responses
//   - Each test drives the orb like a user (click, speak, wait) and asserts on state/history.
// Run: pnpm test   (or: node --test tests/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = fs.readFileSync(path.join(__dirname, '../public/scripts/voice-receptionist.js'), 'utf8');

// Small helper: real-time sleep (the script uses real timers: 100 ms polls + 450 ms TTS tail).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Time needed after TTS ends before the mic re-opens (poll + tail + margin).
const MIC_REOPEN_MS = 750;

/** Builds a fresh fake browser + loads the script. Returns handles used by tests. */
function setup({ aiReplies = [], aiChunkSplit = false } = {}) {
  // ---- Fake DOM elements (only what the script touches) ----
  const mkClassList = () => {
    const s = new Set();
    return { add: (c) => s.add(c), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)) };
  };
  const orb = { classList: mkClassList(), _click: null, addEventListener: (ev, fn) => { if (ev === 'click') orb._click = fn; }, setAttribute() {} };
  const status = { textContent: '' };
  const document = {
    getElementById: (id) => (id === 'voice-orb' ? orb : id === 'voice-status' ? status : null),
    querySelector: () => null,
  };

  // ---- Fake SpeechRecognition: every `new` is recorded so tests can see how many mics opened ----
  const recognizers = [];
  class FakeRecognition {
    constructor() { this.started = false; this.ended = false; this.lang = ''; recognizers.push(this); }
    start() { this.started = true; this.startedWhileSpeaking = synth.speaking; setTimeout(() => this.onstart?.(), 0); }
    stop() { this._end(); }
    abort() { this._end(); }
    _end() { if (this.ended) return; this.ended = true; setTimeout(() => this.onend?.(), 0); }
    // Test helper: simulate the user saying `text` (final result) then the engine ending.
    say(text) {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true })] });
      this._end();
    }
    // Test helper: simulate a silent window (Chrome fires onend with no result).
    silence() { this._end(); }
  }
  const liveRec = () => recognizers.filter((r) => r.started && !r.ended).at(-1);

  // ---- Fake speechSynthesis: TTS "plays" until the test calls synth.finish() ----
  const spoken = [];
  const synth = {
    speaking: false, pending: false, _u: null, cancelled: 0,
    getVoices: () => [{ name: 'Samantha', lang: 'en-US' }, { name: 'Paulina', lang: 'es-MX' }],
    speak(u) { this._u = u; this.speaking = true; spoken.push(u.text); setTimeout(() => u.onstart?.(), 0); },
    cancel() { this.cancelled++; if (this._u) { const u = this._u; this._u = null; this.speaking = false; setTimeout(() => u.onend?.(), 0); } },
    finish() { const u = this._u; this._u = null; this.speaking = false; u?.onend?.(); },
  };
  class SpeechSynthesisUtterance { constructor(t) { this.text = t; } }

  // ---- Fake fetch: /api/chat returns SSE built from aiReplies; /api/lead records payloads ----
  const chatCalls = [];
  const leadCalls = [];
  let replyIdx = 0;
  const fetch = async (url, opts = {}) => {
    const body = JSON.parse(opts.body || '{}');
    if (String(url).includes('/api/lead')) { leadCalls.push(body); return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'content-type': 'application/json' } }); }
    chatCalls.push(body);
    const reply = aiReplies[replyIdx++] ?? 'Sure, tell me more about your project.';
    // Build an OpenRouter-style SSE stream, one token per word.
    const sse = reply.split(/(?<= )/).map((w) => `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    const enc = new TextEncoder().encode(sse);
    const stream = new ReadableStream({
      start(c) {
        if (aiChunkSplit) { for (let i = 0; i < enc.length; i += 7) c.enqueue(enc.slice(i, i + 7)); } // split mid-line (AC-10)
        else c.enqueue(enc);
        c.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };

  // ---- Assemble the global scope the script sees ----
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, JSON, Date, Math, URLSearchParams,
    TextDecoder, TextEncoder, Response, ReadableStream, AbortController, Intl,
    document, fetch, SpeechSynthesisUtterance,
    navigator: { language: 'en-US', userAgent: 'node-test' },
    location: { search: '' },
    localStorage: { getItem: () => null, setItem() {} },
  };
  ctx.window = ctx;
  ctx.webkitSpeechRecognition = FakeRecognition;
  ctx.speechSynthesis = synth;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);

  const api = ctx.__infusioVoice; // operator/debug handle exposed by the script (FR-014)
  return { orb, status, synth, recognizers, liveRec, spoken, chatCalls, leadCalls, api, click: () => orb._click() };
}

/** Starts a session and finishes the greeting so the mic is open. */
async function startAndGreet(h) {
  await h.click();
  await sleep(50);
  h.synth.finish();
  await sleep(MIC_REOPEN_MS);
}

/** User says `text`, AI replies, TTS finishes, mic re-opens. */
async function userTurn(h, text) {
  const rec = h.liveRec();
  assert.ok(rec, `expected an open mic before saying "${text}"`);
  rec.say(text);
  await sleep(150);           // AI fetch + parse
  h.synth.finish();           // assistant finishes speaking
  await sleep(MIC_REOPEN_MS); // tail delay → mic reopens
}

test('AC-1/AC-2: greeting plays with mic closed, then exactly one recognizer opens', async () => {
  const h = setup();
  await h.click();
  await sleep(300);
  assert.equal(h.api.state, 'SPEAKING');
  assert.equal(h.recognizers.length, 0, 'no mic may open while greeting is playing');
  h.synth.finish();
  await sleep(MIC_REOPEN_MS);
  assert.equal(h.api.state, 'LISTENING');
  assert.equal(h.recognizers.filter((r) => r.started).length, 1);
  assert.ok(h.recognizers.every((r) => !r.startedWhileSpeaking), 'mic never starts while TTS speaking');
});

test('AC-3: user reusing assistant words is answered, not dropped as echo (RC-3 regression)', async () => {
  const h = setup({ aiReplies: ['We build fast websites. What do you want to achieve first?', 'Great, a bakery site with online orders.'] });
  await startAndGreet(h);
  await userTurn(h, 'hello');
  await userTurn(h, 'I want a website');
  assert.equal(h.chatCalls.length, 2);
  assert.equal(h.chatCalls[1].messages.at(-1).content, 'I want a website');
});

test('AC-4: booking intent does not deadlock; next utterance is also answered (RC-1/RC-2)', async () => {
  const h = setup({ aiReplies: ['Sure, what day works?', 'Tuesday at 10 works.'] });
  await startAndGreet(h);
  await userTurn(h, 'Can we schedule a call tomorrow?');
  await userTurn(h, 'Maybe Tuesday morning');
  assert.equal(h.chatCalls.length, 2);
  assert.ok(!h.spoken.some((s) => /10–15 minute call/.test(s)), 'no client-side booking nudge');
});

test('AC-5: email dictation → confirm → yes → lead POST', async () => {
  const h = setup();
  await startAndGreet(h);
  await userTurn(h, 'my email is boris at gmail dot com');
  assert.match(h.spoken.at(-1), /boris@gmail\.com/);
  await userTurn(h, 'yes');
  await sleep(50);
  assert.equal(h.leadCalls.length, 1);
  assert.equal(h.leadCalls[0].email, 'boris@gmail.com');
  assert.equal(h.chatCalls.length, 0, 'email turns are handled locally');
});

test('AC-6: pending email confirmation + unrelated question goes to the AI', async () => {
  const h = setup({ aiReplies: ['We charge per project.'] });
  await startAndGreet(h);
  await userTurn(h, 'my email is boris at gmail dot com');
  await userTurn(h, 'how much does a website cost');
  assert.equal(h.chatCalls.length, 1);
  assert.equal(h.chatCalls[0].messages.at(-1).content, 'how much does a website cost');
});

test('AC-7: tap while speaking = barge-in → listening', async () => {
  const h = setup();
  await h.click();
  await sleep(50);
  assert.equal(h.api.state, 'SPEAKING');
  await h.click(); // barge-in
  await sleep(MIC_REOPEN_MS);
  assert.ok(h.synth.cancelled >= 1);
  assert.equal(h.api.state, 'LISTENING');
});

test('AC-8: four silent windows end the session gracefully', async () => {
  const h = setup();
  await startAndGreet(h);
  for (let i = 0; i < 4; i++) {
    h.liveRec()?.silence();
    await sleep(400);
  }
  assert.equal(h.api.state, 'IDLE');
});

test('AC-9: late result from a stale recognizer is ignored', async () => {
  const h = setup();
  await startAndGreet(h);
  const old = h.liveRec();
  old.silence();             // window 1 ends silently → new recognizer opens
  await sleep(400);
  assert.notEqual(h.liveRec(), old);
  old.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'ghost words' }], { isFinal: true })] });
  await sleep(100);
  assert.equal(h.chatCalls.length, 0, 'stale recognizer events must not reach the AI');
  assert.equal(h.api.state, 'LISTENING');
});

test('AC-10: SSE split mid-line is reassembled intact', async () => {
  const reply = 'We design calm websites and practical automations for small businesses.';
  const h = setup({ aiReplies: [reply], aiChunkSplit: true });
  await startAndGreet(h);
  await userTurn(h, 'what do you do');
  assert.equal(h.spoken.at(-1), reply);
});

test('FR-012 support: client never sends system messages to /api/chat', async () => {
  const h = setup();
  await startAndGreet(h);
  await userTurn(h, 'hi there');
  assert.ok(h.chatCalls[0].messages.every((m) => m.role === 'user' || m.role === 'assistant'));
});
