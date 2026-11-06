// WeberAct shared chrome and motion: header, drawer menu, footer, reveals, hairlines, terminal typing, smooth scroll.
(function(){
  const d = document, page = d.body.dataset.page || '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  d.documentElement.classList.add('js');

  // The WeberAct mark: two slanted bars and an open A
  const MARK = '<svg viewBox="0 0 78 40" aria-hidden="true" fill="currentColor"><path d="M0 6h14l16 28H16z"/><path d="M18 6h14l16 28H34z"/><path fill-rule="evenodd" d="M40 34 58 6l18 28zm12 0 6-10 6 10z"/></svg>';
  window.WA_MARK = MARK;

  const NAV_L = [['work.html','Work','work'],['services.html','Services','services'],['method.html','Method','method']];
  const NAV_R = [['about.html','About','about']];
  const link = ([h, t, k]) => `<a href="${h}"${k === page ? ' aria-current="page"' : ''}>${t}</a>`;

  const top = d.createElement('div'); top.className = 'topline';
  top.innerHTML = '<div class="wrap"><span>Premium websites, web systems and automations</span><span>India and abroad</span></div>';
  const head = d.createElement('header'); head.className = 'head';
  head.innerHTML = `<div class="wrap">
    <nav aria-label="Primary">${NAV_L.map(link).join('')}</nav>
    <a class="logo" href="./" aria-label="WeberAct home">${MARK}<b>WeberAct</b></a>
    <div class="right"><nav aria-label="Secondary">${NAV_R.map(link).join('')}</nav><a class="btn line" href="proposal.html">Request a proposal</a></div>
    <button class="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><i></i><i></i><i></i></button></div>`;
  const drawer = d.createElement('div'); drawer.className = 'drawer'; drawer.id = 'drawer';
  drawer.innerHTML = [['./','Home','home'], ...NAV_L, ...NAV_R].map(link).join('') + '<a class="btn solid" href="proposal.html">Request a proposal</a>';
  d.body.prepend(drawer); d.body.prepend(head); d.body.prepend(top);
  const burger = head.querySelector('.burger');
  burger.addEventListener('click', () => { const o = drawer.classList.toggle('open'); burger.setAttribute('aria-expanded', o); burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); d.body.style.overflow = o ? 'hidden' : ''; });
  addEventListener('scroll', () => head.classList.toggle('scrolled', scrollY > 30), { passive:true });

  const foot = d.createElement('footer'); foot.className = 'foot';
  foot.innerHTML = `<div class="wrap">
    <div><a class="logo" href="./">${MARK}<b>WeberAct</b></a><p>Premium websites, web systems, automations and search, built on a written promise.</p></div>
    <div><h4>Services</h4><ul><li><a href="services.html#websites">Premium websites</a></li><li><a href="services.html#systems">Web systems</a></li><li><a href="services.html#automations">Automations</a></li><li><a href="services.html#search">Search and growth</a></li></ul></div>
    <div><h4>Studio</h4><ul><li><a href="work.html">Work</a></li><li><a href="method.html">Method</a></li><li><a href="about.html">About</a></li><li><a href="proposal.html">Request a proposal</a></li></ul></div>
    <div><h4>Legal</h4><ul><li><a href="terms.html">Terms &amp; Conditions</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>
    <div class="base"><span>Built on a promise. © ${new Date().getFullYear()} WeberAct</span><span>Replies within one working day</span></div></div>`;
  d.body.appendChild(foot);
  d.querySelectorAll('[data-mark]').forEach(el => el.innerHTML = MARK);

  // hero lines rise once fonts are in
  const ready = () => d.body.classList.add('ready');
  (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(ready));
  setTimeout(ready, 1200);

  // reveal on scroll, staggered within a group; hairlines draw across
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); if (e.target.matches('.term')) typeTerm(e.target); } }), { threshold:.15, rootMargin:'0px 0px -6% 0px' });
  if (!reduce) d.querySelectorAll('.term [data-cmd], .term .out').forEach(l => l.style.visibility = 'hidden');
  d.querySelectorAll('.rv, .rule, .term').forEach(el => {
    if (el.classList.contains('rv') && el.dataset.stagger !== 'off'){ const i = [...el.parentElement.children].filter(c => c.classList.contains('rv')).indexOf(el); el.style.setProperty('--d', Math.max(0, Math.min(i, 5)) * 90 + 'ms'); }
    io.observe(el);
  });

  // terminal: types each command, then prints its output
  function typeTerm(t){
    if (t.dataset.done) return; t.dataset.done = 1;
    const lines = [...t.querySelectorAll('[data-cmd], .out')];
    if (reduce){ lines.forEach(l => { if (l.dataset.cmd) l.innerHTML = `<b>$</b> ${l.dataset.cmd}`; l.hidden = false; }); return; }
    lines.forEach(l => { l.hidden = true; l.style.visibility = ''; });
    let i = 0;
    const cursor = d.createElement('span'); cursor.className = 'cur';
    (function next(){
      if (i >= lines.length){ const last = lines[lines.length - 1]; last.appendChild(cursor); return; }
      const l = lines[i++]; l.hidden = false;
      if (l.dataset.cmd){
        const txt = l.dataset.cmd; let k = 0; l.innerHTML = '<b>$</b> '; const s = d.createElement('span'); l.appendChild(s); l.appendChild(cursor);
        (function type(){ s.textContent = txt.slice(0, ++k); if (k < txt.length) setTimeout(type, 28 + Math.random() * 40); else setTimeout(next, 380); })();
      } else { setTimeout(next, 260); }
    })();
  }

  // arch mock drifts with the pointer
  const mock = d.querySelector('.arch .mock');
  if (mock && !reduce && matchMedia('(hover:hover)').matches){
    addEventListener('pointermove', e => { const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5; mock.style.transform = `translate(${x * 14}px, ${y * 12}px) rotate(${x * 1.5}deg)`; });
  }

  // smooth scrolling
  if (!reduce){
    const sc = d.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js';
    sc.onload = () => { try {
      const l = new Lenis({ lerp:.1 }); const raf = t => { l.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
      d.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const id = a.getAttribute('href'); const t = id.length > 1 && d.querySelector(id); if (t){ e.preventDefault(); l.scrollTo(t, { offset:-90 }); } }));
      if (location.hash){ const t = d.querySelector(location.hash); if (t) setTimeout(() => l.scrollTo(t, { offset:-90, immediate:true }), 60); }
    } catch(e){} };
    d.head.appendChild(sc);
  }

  // legal pages: highlight the section in view
  const toc = d.querySelector('.toc');
  if (toc){
    const links = [...toc.querySelectorAll('a')], heads = links.map(a => d.querySelector(a.getAttribute('href')));
    const spy = () => { let i = 0; heads.forEach((h, k) => { if (h && h.getBoundingClientRect().top < 160) i = k; }); links.forEach((a, k) => a.classList.toggle('on', k === i)); };
    addEventListener('scroll', spy, { passive:true }); spy();
  }
})();
