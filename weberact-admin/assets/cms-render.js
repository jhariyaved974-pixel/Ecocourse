// WeberAct content renderer for the admin panel's live preview.
// It mirrors tools/cms.py exactly (tools/test_cms_parity.mjs checks that both produce the same HTML),
// so what you see in the preview is what the next build publishes. The public pages do not load this file.
(function(root){
  const E = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const A = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));

  const ICON = {
    websites: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="15" rx="1.5"/><path d="M3 8.5h18"/></svg>',
    systems: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l3 8M16 7.5l-3 8"/></svg>',
    automations: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  };
  const AV_ATTR = 'width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const AV = [`<svg viewBox="0 0 24 24" ${AV_ATTR}><rect x="3" y="4" width="18" height="15" rx="1.5"/><path d="M3 8.5h18"/></svg>`,
              `<svg viewBox="0 0 24 24" ${AV_ATTR}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
              `<svg viewBox="0 0 24 24" ${AV_ATTR}><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>`];
  const CATS = { web: 'Premium website', sys: 'Web system', auto: 'Automation', seo: 'Search optimisation (SEO)' };
  const SHOTS = [['#f6efe4,#ead9bb', '#7a1c33,#94263f'], ['#e9eef6,#cfd9ea', '#0f1b33,#17264a'], ['#eef6f3,#d4ebe4', '#1f6f63,#3fd0b6'],
                 ['#f7f1e1,#e8d7a9', '#a8862f,#c6a24e'], ['#f3e9ec,#e3c9d0', '#5f1427,#7a1c33'], ['#e6ecf5,#c9d6e8', '#17264a,#3fd0b6']];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const roman = i => i < ROMAN.length ? ROMAN[i] : String(i + 1);

  // links and images typed in the admin panel: no javascript:, data: or vbscript: addresses
  const safeUrl = u => { u = String(u == null ? '' : u).trim(); return /^(javascript|data|vbscript):/i.test(u.replace(/[\s\x00-\x1f]/g, '')) ? '' : u; };

  function get(c, path){
    let cur = c;
    for (const k of path.split('.')){
      cur = Array.isArray(cur) ? cur[parseInt(k, 10)] : (cur && typeof cur === 'object') ? (k in cur ? cur[k] : '') : '';
    }
    return cur == null ? '' : cur;
  }

  // ------------------------------------------------------------------ renderers
  function lines(items, delays){
    return (items || []).map((t, i) => { const d = delays(i); return `<span class="line-mask"><span${d ? ` style="transition-delay:${d}s"` : ''}>${E(t)}</span></span>`; }).join(' ');
  }
  const sec = x => x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace(/^0+/, '') || '0';
  const rHomeHero = c => lines(c.home.hero, i => sec(.05 + i * .1));
  const pageLines = key => c => lines(get(c, key), i => i ? sec(i * .12) : null);

  // the dedicated page for a service key (websites, search, ...), if there is one
  const pageFor = (c, key) => { for (const [slug, p] of Object.entries(c.pages || {})) if (p.service_key === key) return slug + '.html'; return null; };
  function rMake(c){
    return c.home.make.map(m => `\n      <a class="col rv" href="${pageFor(c, m.key) || 'services.html#' + m.key}">${m.badge ? `<span class="new">${E(m.badge)}</span>` : ''}<span class="ic">${ICON[m.key]}</span><h3>${E(m.title)}</h3>` +
      `<p>${E(m.text)}</p><span class="more">Explore →</span></a>`).join('') + '\n    ';
  }
  function rTerminal(c){
    const t = c.common.method.terminal;
    return '\n      <div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>' + t.map((row, i) =>
      `\n      <div class="cmd" data-cmd="${A(row.cmd)}"><b>$</b> ${E(row.cmd)}</div>\n      <div class="out">${E(row.out)}${i === t.length - 1 ? ' <span class="ok">✓</span>' : ''}</div>`).join('') + '\n    ';
  }
  const rMethodTitle = c => c.common.method.title.map(t => `<span>${E(t)}</span>`).join(' ');
  function slides(items){
    return items.map((t, i) => {
      const who = [t.role, t.company].filter(Boolean).join(', ');
      return `\n        <figure class="tslide${i === 0 ? ' on' : ''}"><span class="tag">${E(t.tag)}</span><blockquote>“${E(t.quote)}”</blockquote>` +
        `\n          <figcaption><span class="av" aria-hidden="true">${AV[i % 3]}</span><span><b>${E(t.name)}</b><span>${E(who)}</span></span></figcaption></figure>`;
    }).join('') + '\n      ';
  }
  const steps = items => items.map((s, i) => `\n      <div class="rv"><span class="n">${roman(i)}</span><div><b>${E(s.title)}</b><p>${E(s.text)}</p></div></div>`).join('') + '\n    ';
  function workCard(p, i, href){
    const [bg, hero] = SHOTS[i % SHOTS.length];
    const img = safeUrl(p.image), link = safeUrl(p.link);
    const shot = img ? `<div class="shot"><img src="${A(img)}" alt="${A(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover"></div>`
      : `<div class="shot" style="background:linear-gradient(160deg,${bg})"><div class="scr"><i></i><i></i><div class="hero-b" style="background:linear-gradient(135deg,${hero})"></div></div></div>`;
    return `<a class="wcard rv" data-c="${A(p.category)}" href="${A(link || href)}"${link ? ' target="_blank" rel="noopener"' : ''}>${shot}` +
      `<div class="meta"><h3>${E(p.name)}</h3><span class="tag">${E(CATS[p.category] || p.category)}</span></div><p>${E(p.result)}</p></a>`;
  }
  const rHomeWork = c => c.work.projects.slice(0, 3).map((p, i) => '\n      ' + workCard(p, i, 'work.html')).join('') + '\n    ';
  const rWorkCards = c => c.work.projects.map((p, i) => '\n      ' + workCard(p, i, 'proposal.html')).join('') + '\n    ';
  function rWorkFilters(c){
    const labels = { web: 'Premium websites', sys: 'Web systems', auto: 'Automations', seo: 'Search optimisation (SEO)' };
    const used = Object.keys(CATS).filter(k => c.work.projects.some(p => p.category === k));
    return '\n      <button aria-pressed="true" data-f="all">All</button>' + used.map(k => `<button aria-pressed="false" data-f="${k}">${labels[k]}</button>`).join('') + '\n    ';
  }
  function rServicesIndex(c){
    const keys = new Set(c.services.items.map(s => s.key));
    const extra = Object.entries(c.pages || {}).filter(([, p]) => p.service_key && !keys.has(p.service_key));
    return c.services.items.map(s => `<a href="#${s.key}">${E(s.chip)}</a>`).join('') + extra.map(([slug, p]) => `<a href="${slug}.html">${E(p.crumb)}</a>`).join('');
  }
  const FLOW = '\n        <div class="flow rv" id="flow" aria-label="An automation running: enquiry, qualify, reply, CRM, alert" role="img">' +
    '\n          <span class="lab">Live example · one enquiry</span>' +
    '\n          <ol><li><i>01</i>Enquiry arrives</li><li><i>02</i>Qualified</li><li><i>03</i>WhatsApp reply</li><li><i>04</i>Logged in CRM</li><li><i>05</i>Owner alerted</li></ol>' +
    '\n          <div class="clock" id="clock">00.0 s</div>\n        </div>';
  const EXTRA_LINK = { websites: '<a class="ulink" href="work.html">See work</a>', automations: '<a class="ulink" href="./#method">How it runs</a>' };
  const more = (c, s) => {
    const page = pageFor(c, s.key); if (!page) return EXTRA_LINK[s.key] || '';
    let name = c.pages[page.slice(0, -5)].crumb;
    if (!(name.length > 1 && name[1] === name[1].toUpperCase() && name[1] !== name[1].toLowerCase())) name = name.charAt(0).toLowerCase() + name.slice(1);  // "technical SEO", "AI business automation"
    return `<a class="ulink" href="${page}">More about ${E(name)}</a>`;
  };
  function rServices(c){
    return c.services.items.map(s => {
      const pts = s.points.map((p, i) => `\n          <div class="rv"><span class="k">${String.fromCharCode(97 + i)}</span><div><b>${E(p.title)}</b><p>${E(p.text)}</p></div></div>`).join('');
      const n = s.facts.length, style = n !== 3 ? ` style="grid-template-columns:repeat(${n},minmax(0,1fr))"` : '';
      const facts = s.facts.map(f => `<div><span>${E(f.label)}</span><b>${E(f.value)}</b></div>`).join('');
      return `\n    <article class="svc" id="${s.key}">` +
        `\n      <div class="stick rv"><span class="num">${E(s.label)}</span><h2>${E(s.heading)}</h2><p>${E(s.intro)}</p>` +
        `\n        <div class="row"><a class="btn solid" href="proposal.html#${s.key}">Request a proposal</a>${more(c, s)}</div></div>` +
        `\n      <div>\n        <div class="list">${pts}\n        </div>${s.key === 'automations' ? FLOW : ''}` +
        `\n        <div class="facts rv"${style}>${facts}</div>\n      </div>\n    </article>\n`;
    }).join('') + '  ';
  }
  const rFaq = c => c.services.faq.map(f => `\n      <details><summary>${E(f.q)}</summary><p>${E(f.a)}</p></details>`).join('') + '\n    ';
  function rPhases(c){
    const ph = c.method.phases;
    return ph.map((p, i) => {
      const items = p.items.map(x => `<li><b>${E(x.label)}</b><span>${E(x.tag)}</span></li>`).join('');
      const last = i === ph.length - 1, pid = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `step-${i + 1}`;
      return `\n    <section class="phase" id="${pid}"${last ? ' style="border-bottom:0"' : ''}>` +
        `\n      <div class="rv"><div class="k">${String(i + 1).padStart(2, '0')}</div><h2>${E(p.title)}</h2><p>${E(p.text)}</p>` +
        `\n        <div class="term small" role="img" aria-label="${A(p.cmd.split(' --')[0])}"><div class="dots" aria-hidden="true"><i></i><i></i><i></i></div><div class="cmd" data-cmd="${A(p.cmd)}"><b>$</b> ${E(p.cmd)}</div><div class="out">${E(p.out)}${last ? ' <span class="ok">✓</span>' : ''}</div></div></div>` +
        `\n      <ul class="rv">${items}</ul>\n    </section>`;
    }).join('') + '\n  ';
  }
  const rStory = c => c.about.story.map(p => `\n      <p class="rv">${E(p)}</p>`).join('') + '\n      <a class="btn solid rv" href="proposal.html" style="margin-top:10px">Request a proposal</a>\n    ';
  const rPeople = c => c.about.people.map(p => {
    const photo = safeUrl(p.photo);
    const ph = photo ? `<div class="ph" aria-hidden="true"><img src="${A(photo)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>` : `<div class="ph" aria-hidden="true">${E(p.initials || '')}</div>`;
    return `\n      <div class="person rv">${ph}<span class="role">${E(p.role)}</span><h3>${E(p.name)}</h3><p>${E(p.bio)}</p></div>`;
  }).join('') + '\n    ';
  const rValues = c => c.about.values.map(v => `\n      <div class="rv"><b>${E(v.title)}</b><p>${E(v.text)}</p></div>`).join('') + '\n    ';
  function rNext(c){
    const n = c.proposal.next;
    return n.map((s, i) => `\n          <div${i === n.length - 1 ? ' style="border-bottom:0"' : ''}><span class="n">${roman(i)}</span><div><b>${E(s.title)}</b><p>${E(s.text)}</p></div></div>`).join('') + '\n        ';
  }

  // dedicated service and information pages, rendered from content.pages[slug] (mirrors r_page in tools/cms.py)
  function rPage(c, slug){
    const p = c.pages[slug], svc = p.service_key || '', cta = 'proposal.html' + (svc ? '#' + svc : '');
    const crumbs = '<a href="./">Home</a><span>/</span>' + (svc ? '<a href="services.html">Services</a><span>/</span>' : '') + `<span>${E(p.crumb)}</span>`;
    const section = (cls, title, body, sid) => `\n  <section class="sp-sec ${cls}"${sid ? ` id="${sid}"` : ''}><div class="wrap sp-grid">` +
      `\n    <h2 class="h2 rv">${E(title)}</h2>\n    <div class="rv">${body}</div>\n  </div></section>`;
    let out = `\n  <section class="page-hero"><div class="wrap">` +
      `\n    <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>` +
      `\n    <h1 class="display">${lines(p.hero, i => i ? sec(i * .12) : null)}</h1>` +
      `\n    <p class="lede rv">${E(p.lede)}</p>` +
      `\n    <div class="sp-cta rv"><a class="btn solid" href="${cta}">${E(p.cta_label || 'Request a proposal')}</a><a class="ulink" href="#faq">Questions answered</a></div>` +
      `\n  </div></section>` +
      `\n  <section class="sp-answer"><div class="wrap"><div class="sp-box rv"><h2>${E(p.answer_q)}</h2><p>${E(p.answer)}</p></div></div></section>`;
    out += section('sp-who', p.who_title, '<div class="sp-cards">' + p.who.map(i => `<div><h3>${E(i.title)}</h3><p>${E(i.text)}</p></div>`).join('') + '</div>');
    out += section('sp-inc', p.included_title, '<div class="list">' + p.included.map((i, n) => `<div><span class="k">${String.fromCharCode(97 + n)}</span><div><h3>${E(i.title)}</h3><p>${E(i.text)}</p></div></div>`).join('') + '</div>');
    out += section('sp-proc', p.process_title, '<ol class="sp-steps">' + p.process.map((i, n) => `<li><span class="n">${String(n + 1).padStart(2, '0')}</span><div><h3>${E(i.title)}</h3><p>${E(i.text)}</p></div></li>`).join('') + '</ol>');
    let cost = p.cost_text.map(t => `<p>${E(t)}</p>`).join('');
    if (p.cost_factors && p.cost_factors.length) cost += '<ul class="sp-ticks">' + p.cost_factors.map(t => `<li>${E(t)}</li>`).join('') + '</ul>';
    out += section('sp-cost', p.cost_title, cost);
    let faq = p.faq.map(f => `<details><summary><h3>${E(f.q)}</h3></summary><p>${E(f.a)}</p></details>`).join('');
    const src = (p.sources || []).filter(s => safeUrl(s.url));
    if (src.length) faq += '<p class="sp-src">Sources: ' + src.map(s => `<a href="${A(safeUrl(s.url))}" rel="noopener" target="_blank">${E(s.label)}</a>`).join(' · ') + '</p>';
    out += section('sp-faq', p.faq_title, faq, 'faq');
    const rel = (p.related || []).filter(r => c.pages[r] && r !== slug);
    if (rel.length) out += section('sp-rel', 'Related services', '<div class="sp-related">' + rel.map(r => `<a href="${r}.html"><b>${E(c.pages[r].crumb)}</b><span>${E(c.pages[r].answer_q)}</span></a>`).join('') + '</div>');
    return out + '\n';
  }
  const renderKey = (key, c) => key.startsWith('page.') ? rPage(c, key.slice(5)) : RENDER[key] ? RENDER[key](c) : null;

  const RENDER = {
    'home.hero': rHomeHero, 'home.make': rMake, 'home.testimonials': c => slides(c.home.testimonials), 'home.steps': c => steps(c.home.steps),
    'home.work': rHomeWork, 'method.terminal': rTerminal, 'method.title': rMethodTitle,
    'services.hero': pageLines('services.hero'), 'services.index': rServicesIndex, 'services.items': rServices, 'services.faq': rFaq,
    'work.hero': pageLines('work.hero'), 'work.filters': rWorkFilters, 'work.cards': rWorkCards,
    'methodpage.hero': pageLines('method.hero'), 'methodpage.phases': rPhases,
    'about.hero': pageLines('about.hero'), 'about.story': rStory, 'about.people': rPeople, 'about.values': rValues,
    'about.testimonials': c => slides(c.about.testimonials), 'about.steps': c => steps(c.about.steps),
    'proposal.hero': pageLines('proposal.hero'), 'proposal.next': rNext,
  };
  // which content path each list element shows (for jumping from a field to its place on the page)
  const LIST_PATH = { 'method.terminal': 'common.method.terminal', 'method.title': 'common.method.title', 'methodpage.hero': 'method.hero', 'methodpage.phases': 'method.phases',
    'work.filters': 'work.projects', 'work.cards': 'work.projects', 'home.work': 'work.projects', 'services.index': 'services.items' };

  // Apply content to a loaded page (used on the preview frame). Shared header and footer text too.
  function apply(doc, c){
    doc.querySelectorAll('[data-cms-list]').forEach(el => { const k = el.getAttribute('data-cms-list'); if (!k.startsWith('page.') && !RENDER[k]) return; el.innerHTML = renderKey(k, c); });
    doc.querySelectorAll('[data-cms]').forEach(el => { el.textContent = String(get(c, el.getAttribute('data-cms'))); });
    const st = c.settings || {}, q = s => doc.querySelector(s);
    if (q('.topline span')) q('.topline span').textContent = st.topline || '';
    if (q('.foot .wrap > div:first-child p')) q('.foot .wrap > div:first-child p').textContent = st.footer_blurb || '';
    const cta = st.header_button || 'Request a proposal';
    doc.querySelectorAll('.head .right > .btn, #drawer > .btn').forEach(el => { el.textContent = cta; });
    const svc = doc.querySelector('.foot .wrap > div:nth-child(2) ul');
    if (svc && c.services) svc.innerHTML = c.services.items.map(x => `<li><a href="services.html#${x.key}">${E(x.chip)}</a></li>`).join('');
    const base = doc.querySelectorAll('.foot .base > span');
    if (base.length >= 2){ base[0].firstChild.textContent = (st.footer_left || '') + ' © '; base[base.length - 1].textContent = st.footer_right || ''; }
  }

  root.WA_RENDER = { E, A, safeUrl, get, RENDER, LIST_PATH, CATS, apply, renderKey };
})(typeof window !== 'undefined' ? window : globalThis);
