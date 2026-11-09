// WeberAct shared behaviour: menu drawer, reveals, hairlines, terminal typing, smooth scroll, carousel. Loaded with defer.
(function(){
  const d = document;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  d.documentElement.classList.add('js');

  // The WeberAct mark, traced from the client's logo artwork
  const MARK = '<svg viewBox="0 0 1146 398" aria-hidden="true" fill="currentColor"><path d="M323.4 397.0C314.7 395.8 309.5 394.3 301.4 390.6C285.2 383.1 275.0 374.0 260.7 354.4C256.2 348.2 243.7 331.3 233.0 316.8C222.3 302.4 202.8 275.9 189.6 258.0C176.4 240.1 157.5 214.5 147.5 201.0C137.5 187.5 119.5 163.2 107.5 147.0C95.5 130.8 81.8 112.3 77.1 106.0C72.4 99.7 59.4 82.1 48.1 67.0C36.9 51.9 21.8 31.6 14.7 22.0C7.5 12.4 1.2 3.9 0.7 3.2C-0.2 2.1 11.3 2.0 64.6 2.2L129.5 2.6L139.2 5.2C158.2 10.4 177.5 21.5 191.1 35.0C196.0 39.9 216.1 65.7 248.5 109.0C289.5 163.7 329.7 217.2 413.7 328.9C417.2 333.5 420.0 337.5 420.0 337.9C420.0 339.3 400.5 362.7 393.1 370.3C384.5 379.1 372.2 387.9 363.0 391.6C351.0 396.5 335.2 398.6 323.4 397.0Z"/><path d="M576.2 397.0C558.0 394.5 540.1 385.0 525.8 370.3C517.2 361.5 502.8 342.0 503.8 340.6C504.3 340.0 507.3 336.1 510.6 332.0C527.7 310.6 672.7 127.1 734.7 48.4C746.9 32.9 758.9 18.5 761.3 16.4C785.3 -4.7 819.2 -5.2 843.7 15.1C850.9 21.0 856.3 27.5 905.5 90.0C925.2 115.0 951.8 148.8 964.6 165.0C977.4 181.2 998.3 207.8 1011.1 224.0C1042.7 264.1 1097.7 333.6 1124.2 366.8C1136.2 381.9 1146.0 394.6 1146.0 395.1C1146.0 395.6 1056.0 396.0 922.9 396.0C707.0 396.0 699.9 395.9 701.2 394.2C701.9 393.2 718.0 372.7 737.0 348.7L771.5 305.0L836.8 305.0C872.8 305.0 902.0 304.6 901.8 304.2C901.6 303.7 893.0 292.6 882.5 279.5C815.8 195.9 803.4 180.4 802.7 180.2C802.0 180.0 790.7 194.0 696.2 312.0C653.1 365.8 650.4 369.0 639.7 377.5C620.6 392.7 597.3 399.9 576.2 397.0Z"/><path d="M460.3 298.8C457.6 295.3 452.7 288.9 449.4 284.5C446.1 280.1 438.9 270.6 433.4 263.5C427.9 256.4 416.8 241.9 408.9 231.5C400.9 221.1 381.1 195.2 364.9 174.0C330.5 129.0 284.2 68.3 254.7 29.4L233.8 1.9L300.2 2.2L366.5 2.6L376.2 5.2C393.0 9.8 407.6 17.6 420.7 28.8C427.2 34.4 450.6 63.8 477.0 99.7L484.5 109.9L549.5 110.1C585.2 110.1 615.7 110.1 617.2 110.0C618.8 109.9 620.0 110.2 620.0 110.5C620.0 111.3 622.1 108.6 565.9 179.5C510.3 249.5 500.6 261.8 481.7 285.8C473.4 296.3 466.3 305.0 465.9 305.0C465.5 305.0 463.0 302.2 460.3 298.8Z"/></svg>';
  window.WA_MARK = MARK;

  // Header, drawer and footer are written into each page's HTML (tools/weberact_pages.py), so nothing shifts on load.
  const head = d.querySelector('.head'), drawer = d.getElementById('drawer'), burger = head && head.querySelector('.burger');
  if (burger && drawer){
    const setOpen = o => { drawer.classList.toggle('open', o); burger.setAttribute('aria-expanded', o); burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); d.body.style.overflow = o ? 'hidden' : ''; };
    burger.addEventListener('click', () => setOpen(!drawer.classList.contains('open')));
    d.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')){ setOpen(false); burger.focus(); } });
  }
  if (head) addEventListener('scroll', () => head.classList.toggle('scrolled', scrollY > 30), { passive:true });
  d.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
  d.querySelectorAll('[data-mark]').forEach(el => { if (!el.querySelector('svg')) el.innerHTML = MARK; });

  // hero lines rise once fonts are in
  const ready = () => d.body.classList.add('ready');
  (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(ready));
  setTimeout(ready, 700);

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

  // reading progress: a gold hairline across the top
  const bar = d.createElement('div'); bar.className = 'progress-line'; bar.setAttribute('aria-hidden', 'true'); d.body.appendChild(bar);
  const prog = () => { const h = d.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
  addEventListener('scroll', prog, { passive:true }); addEventListener('resize', prog); prog();

  // service icons draw their lines when they come into view
  d.querySelectorAll('.col .ic svg *').forEach(el => el.setAttribute('pathLength', '100'));

  // testimonials carousel: auto-advances, pauses on hover or focus, arrows, dots, swipe, keyboard
  d.querySelectorAll('.tcar').forEach(car => {
    const slides = [...car.querySelectorAll('.tslide')], dots = car.querySelector('.tdots'), count = car.querySelector('.tcount');
    const wait = +car.dataset.auto || 7000; let i = 0, timer = null, t0 = 0, left = wait, paused = false;
    slides.forEach((s, k) => { const b = d.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Show testimonial ${k + 1}`); b.innerHTML = '<i></i>'; b.addEventListener('click', () => go(k, true)); dots.appendChild(b);
      if (s.tagName !== 'FIGURE') s.setAttribute('role', 'group'); s.setAttribute('aria-roledescription', 'slide'); s.setAttribute('aria-label', `${k + 1} of ${slides.length}`); });
    const dbtns = [...dots.children];
    function show(){
      slides.forEach((s, k) => { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', k !== i); s.inert = k !== i; });
      dbtns.forEach((b, k) => { b.classList.toggle('on', k === i); b.firstChild.style.animation = 'none'; void b.offsetWidth; b.firstChild.style.animation = ''; b.firstChild.style.animationDuration = wait + 'ms'; b.classList.toggle('run', k === i && !reduce && !paused); });
      if (count) count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    }
    function schedule(ms){ clearTimeout(timer); if (reduce || paused) return; t0 = performance.now(); left = ms; timer = setTimeout(() => go(i + 1), ms); }
    function go(k, user){ i = (k + slides.length) % slides.length; show(); schedule(wait); if (user) car.querySelector('.tslides').focus({ preventScroll:true }); }
    car.querySelector('.prev').addEventListener('click', () => go(i - 1));
    car.querySelector('.next').addEventListener('click', () => go(i + 1));
    const pause = () => { if (paused) return; paused = true; clearTimeout(timer); left = Math.max(400, left - (performance.now() - t0)); car.classList.add('paused'); };
    const resume = () => { if (!paused) return; paused = false; car.classList.remove('paused'); schedule(left); };
    car.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pause(); });
    car.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') resume(); });
    car.addEventListener('focusin', pause); car.addEventListener('focusout', e => { if (!car.contains(e.relatedTarget)) resume(); });
    car.addEventListener('keydown', e => { if (e.key === 'ArrowRight'){ e.preventDefault(); go(i + 1); } if (e.key === 'ArrowLeft'){ e.preventDefault(); go(i - 1); } });
    let sx = null; car.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive:true });
    car.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); sx = null; });
    const startIo = new IntersectionObserver(([e]) => { if (e.isIntersecting){ show(); schedule(wait); startIo.disconnect(); } }, { threshold:.3 });
    show(); startIo.observe(car);
  });

  // legal pages: highlight the section in view
  const toc = d.querySelector('.toc');
  if (toc){
    const links = [...toc.querySelectorAll('a')], heads = links.map(a => d.querySelector(a.getAttribute('href')));
    const spy = () => { let i = 0; heads.forEach((h, k) => { if (h && h.getBoundingClientRect().top < 160) i = k; }); links.forEach((a, k) => a.classList.toggle('on', k === i)); };
    addEventListener('scroll', spy, { passive:true }); spy();
  }
})();
