(() => {
  const orb = document.getElementById('voice-orb');
  const status = document.getElementById('voice-status');
  if (!orb || !status) return;

  const synth = window.speechSynthesis;
  const rec = ('webkitSpeechRecognition' in window) ? new webkitSpeechRecognition() : null;

  let listening = false;

  function speak(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1.02;
    synth.cancel(); synth.speak(u);
  }

  function setState(s) { status.textContent = s; }

  orb.addEventListener('click', () => {
    if (!rec) { setState('Voice not supported on this browser.'); speak('Voice is not supported here.'); return; }

    if (!listening) {
      rec.lang = 'en-US'; rec.continuous = false; rec.interimResults = false;
      rec.onstart = () => { listening = true; setState('Listening…'); orb.classList.add('active'); };
      rec.onerror = () => { setState('Mic error.'); orb.classList.remove('active'); listening = false; };
      rec.onend = () => { setState('Processing…'); orb.classList.remove('active'); listening = false; };
      rec.onresult = async (e) => {
        const utterance = e.results[0][0].transcript.trim();
        setState('You said: ' + utterance);
        // TODO: call your /api/chat and then speak(reply)
        // const reply = await fetch('/api/chat',{method:'POST',body:JSON.stringify({message:utterance})}).then(r=>r.text());
        const reply = "Thanks for asking. This is a placeholder reply."; // demo
        speak(reply);
        setState('Ready.');
      };
      rec.start();
    }
  });
})();