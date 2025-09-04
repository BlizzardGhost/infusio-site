(() => {
  const talkBtn = document.getElementById('voice-toggle');
  if (!talkBtn) return;

  const canSTT = 'webkitSpeechRecognition' in window;
  let listening = false;
  let recognition;

  if (canSTT) {
    recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'en-US';            // TODO: read from data-lang
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      // TODO: send transcript to your /api/chat, then speak reply
      speak(`You said: ${transcript}. I’ll connect this to the receptionist soon.`);
    };
    recognition.onend = () => {
      listening = false;
      talkBtn.setAttribute('aria-pressed', 'false');
      talkBtn.textContent = 'Talk';
    };
  } else {
    talkBtn.title = 'Speech recognition not available in this browser.';
  }

  talkBtn.addEventListener('click', () => {
    if (!canSTT) {
      speak("Voice input isn’t available here. I’ll use text chat for now.");
      return;
    }
    if (!listening) {
      listening = true;
      talkBtn.setAttribute('aria-pressed', 'true');
      talkBtn.textContent = 'Listening…';
      try { recognition.start(); } catch {}
    } else {
      recognition.stop();
    }
  });

  function speak(text){
    if (!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02; utter.pitch = 1; utter.volume = 1;
    // optional: choose a calmer voice if available
    const v = speechSynthesis.getVoices().find(v => /Samantha|Google UK English Female|Victoria/i.test(v.name));
    if (v) utter.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }
})();