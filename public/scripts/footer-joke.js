window.addEventListener('load', () => {
  const el = document.querySelector('[data-joke]');
  if (el) el.textContent = '© ' + new Date().getFullYear() + ' INFUSIO. No pixels were harmed.';
});