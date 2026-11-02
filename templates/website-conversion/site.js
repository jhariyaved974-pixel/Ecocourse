// Shared behaviour for the inner pages: header, menu, footer, tilt cards, legal table of contents.
(function(){
  const page = document.body.dataset.page;
  const NAV = [['./','Home','home'],['services.html','Services','services'],['about.html','About Us','about'],['enquiry.html','Enquiry','enquiry']];
  const head = document.createElement('header'); head.className = 'site-head';
  head.innerHTML = `<div class="wrap"><a class="brand" href="./"><i aria-hidden="true"></i>Your Brand</a>
    <button class="menu-btn" aria-expanded="false" aria-controls="site-nav">Menu</button>
    <nav class="site-nav" id="site-nav" aria-label="Main">${NAV.map(([h, t, k]) => `<a href="${h}"${k === page ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
    <a class="btn hot" href="./#plan">Get my free plan</a></nav></div>`;
  document.body.prepend(head);
  const btn = head.querySelector('.menu-btn'), nav = head.querySelector('.site-nav');
  btn.addEventListener('click', () => { const o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o); btn.textContent = o ? 'Close' : 'Menu'; });
  addEventListener('scroll', () => head.classList.toggle('scrolled', scrollY > 8), {passive:true});

  const foot = document.createElement('footer'); foot.className = 'site-foot';
  foot.innerHTML = `<div class="wrap">
    <div><a class="brand" href="./"><i aria-hidden="true"></i>Your Brand</a><p>Automation, websites and SEO that turn visitors into customers, for businesses in India and worldwide. Fixed written quotes. You own everything we build.</p></div>
    <div><h4>Services</h4><ul><li><a href="services.html#automation">Automation</a></li><li><a href="services.html#website">Websites</a></li><li><a href="services.html#seo">SEO &amp; AI search</a></li><li><a href="services.html#pipeline">B2B pipeline</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="about.html">About Us</a></li><li><a href="enquiry.html">Enquiry</a></li><li><a href="./#plan">Free plan</a></li></ul></div>
    <div><h4>Legal</h4><ul><li><a href="terms.html">Terms &amp; Conditions</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>
    <div class="base"><span>© ${new Date().getFullYear()} Your Brand. All rights reserved.</span><span>Replies within one working day</span></div></div>`;
  document.body.appendChild(foot);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  // headline words rise in
  const h1 = document.querySelector('.page-hero h1');
  if (h1 && !reduce){
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3){ const frag = document.createDocumentFragment(); n.textContent.split(/(\s+)/).forEach(t => { if (!t) return; if (/^\s+$/.test(t)) frag.append(t); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = t; frag.append(s); } }); n.replaceWith(frag); }
      else if (n.nodeType === 1) walk(n);
    });
    walk(h1); h1.querySelectorAll('.w').forEach((w, i) => w.style.setProperty('--i', i));
  }

  // reveal content as it scrolls into view, staggered within each group
  const targets = document.querySelectorAll('.page-hero .lede, .page-hero .crumbs, section .mono, section h2, .card, .svc-text, .svc-card, .finder, .cta-band, .doc, .toc, form.enq, .side > *, .stage, .story p, .promise > div, .team > *');
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold:.1, rootMargin:'0px 0px -5% 0px' });
  targets.forEach(el => { const sib = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0; el.classList.add('rv'); el.style.setProperty('--d', Math.min(sib, 5) * 70 + 'ms'); io.observe(el); });

  // smooth scrolling
  if (!reduce){
    const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js';
    sc.onload = () => { try { const l = new Lenis({ lerp:.09 }); const raf = t => { l.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
      document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const t = document.querySelector(a.getAttribute('href')); if (t){ e.preventDefault(); l.scrollTo(t, { offset:-80 }); } })); } catch(e){} };
    document.head.appendChild(sc);
  }

  // cards: soft spotlight follows the pointer; tilt cards lean toward it
  document.querySelectorAll('.card, .svc-card').forEach(c => c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }));
  if (!reduce && matchMedia('(hover:hover)').matches){
    document.querySelectorAll('.tilt').forEach(c => {
      c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.classList.add('moving'); c.style.transform = `perspective(1100px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-3px)`; });
      c.addEventListener('pointerleave', () => { c.classList.remove('moving'); c.style.transform = ''; });
    });
  }

  // legal pages: highlight the section in view
  const toc = document.querySelector('.toc');
  if (toc){
    const links = [...toc.querySelectorAll('a')], heads = links.map(a => document.querySelector(a.getAttribute('href')));
    const spy = () => { let i = 0; heads.forEach((h, k) => { if (h && h.getBoundingClientRect().top < 140) i = k; }); links.forEach((a, k) => a.classList.toggle('on', k === i)); };
    addEventListener('scroll', spy, {passive:true}); spy();
  }
})();
