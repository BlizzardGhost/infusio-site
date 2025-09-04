document.addEventListener('scroll', () => {
  const links = document.querySelectorAll('header a[data-scroll]');
  const sections = [...document.querySelectorAll('section[id]')];
  const y = window.scrollY + 120;
  let active = sections[0]?.id;
  for (const s of sections) if (s.offsetTop <= y) active = s.id;
  links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${active}`));
});