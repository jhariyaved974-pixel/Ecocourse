// Shared behaviour for the inner pages: header, menu, footer, tilt cards, legal table of contents.
(function(){
  const page = document.body.dataset.page;
  const NAV = [['./','Home','home'],['services.html','Services','services'],['about.html','About Us','about'],['enquiry.html','Enquiry','enquiry']];
  const head = document.createElement('header'); head.className = 'site-head';
  head.innerHTML = `<div class="wrap"><a class="brand" href="./"><i aria-hidden="true"></i>Your Brand</a>
    <button class="menu-btn" aria-expanded="false" aria-controls="site-nav">Menu</button>
    <nav class="site-nav" id="site-nav" aria-label="Main">${NAV.map(([h, t, k]) => `<a href="${h}"${k === page ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
    <a class="btn hot" href="./#build">Get my free plan</a></nav></div>`;
  document.body.prepend(head);
  const btn = head.querySelector('.menu-btn'), nav = head.querySelector('.site-nav');
  btn.addEventListener('click', () => { const o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o); btn.textContent = o ? 'Close' : 'Menu'; });
  addEventListener('scroll', () => head.classList.toggle('scrolled', scrollY > 8), {passive:true});

  const foot = document.createElement('footer'); foot.className = 'site-foot';
  foot.innerHTML = `<div class="wrap">
    <div><a class="brand" href="./"><i aria-hidden="true"></i>Your Brand</a><p>Automation, websites and SEO for small teams in India and worldwide. Fixed written quotes. You own everything we build.</p></div>
    <div><h4>Services</h4><ul><li><a href="services.html#automation">Automation</a></li><li><a href="services.html#website">Websites</a></li><li><a href="services.html#seo">SEO &amp; AI search</a></li><li><a href="services.html#pipeline">B2B pipeline</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="about.html">About Us</a></li><li><a href="enquiry.html">Enquiry</a></li><li><a href="./#build">Free plan</a></li></ul></div>
    <div><h4>Legal</h4><ul><li><a href="terms.html">Terms &amp; Conditions</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>
    <div class="base"><span>© ${new Date().getFullYear()} Your Brand. All rights reserved.</span><span>Replies within one working day</span></div></div>`;
  document.body.appendChild(foot);

  // 3D tilt: cards lean toward the pointer
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && matchMedia('(hover:hover)').matches){
    document.querySelectorAll('.tilt').forEach(c => {
      c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-2px)`; });
      c.addEventListener('pointerleave', () => c.style.transform = '');
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
