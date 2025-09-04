// Minimal drawer toggle + streaming text sink
(() => {
  const btn = document.querySelector('[data-chat-open]');
  const panel = document.querySelector('[data-chat-panel]');
  const form = panel?.querySelector('form');
  const stream = panel?.querySelector('[data-stream]');
  btn?.addEventListener('click', () => panel?.classList.toggle('open'));
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = form.querySelector('textarea').value.trim();
    if (!q) return;
    stream.textContent = '…';
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ message: q })
    });
    const reader = res.body.getReader();
    stream.textContent = '';
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      stream.textContent += decoder.decode(value, { stream: true });
    }
  });
})();

(() => {
  const fab = document.getElementById('rec-fab');
  const panel = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const log = document.getElementById('chat-log');
  if (!fab || !panel || !form || !input || !log) return;

  const open = () => { panel.hidden = false; input.focus(); addAssistant("Hi! I’m your AI Receptionist. How can I help today?"); };
  const close = () => { panel.hidden = true; };
  fab.addEventListener('click', () => { panel.hidden ? open() : close(); });
  closeBtn.addEventListener('click', close);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addUser(text);
    input.value = '';
    const stopTyping = addTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      stopTyping();
      addAssistant(data.reply || "I’m here. (Demo mode reply)");
    } catch (err) {
      stopTyping();
      addAssistant("Hmm, I couldn’t reach the server. Try again in a bit?");
      console.error(err);
    }
  });

  function addUser(text){
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }
  function addAssistant(text){
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = `<div class="avatar">A</div><div class="bubble">${escapeHtml(text)}</div>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }
  function addTyping(){
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = `<div class="avatar">A</div><div class="bubble">Typing…</div>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return () => el.remove();
  }
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
})();