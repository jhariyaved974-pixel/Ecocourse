"""WeberAct content engine.

Every editable piece of the website lives in weberact/content.json (the admin panel edits the same
document in Supabase). This module writes that content into the HTML pages:

  data-cms="a.b.c"        the element's text becomes content["a"]["b"]["c"] (HTML-escaped)
  data-cms-list="name"    the element's inner HTML is rebuilt by RENDER[name](content)

It is run by tools/weberact_pages.py, so a page always matches content.json after a build.
"""
import html, re

E = lambda s: html.escape('' if s is None else str(s), quote=False)
A = lambda s: html.escape('' if s is None else str(s), quote=True)

ICON = {
    'websites': '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="15" rx="1.5"/><path d="M3 8.5h18"/></svg>',
    'systems': '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l3 8M16 7.5l-3 8"/></svg>',
    'automations': '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    'search': '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
}
AV_ATTR = 'width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'
AV = [f'<svg viewBox="0 0 24 24" {AV_ATTR}><rect x="3" y="4" width="18" height="15" rx="1.5"/><path d="M3 8.5h18"/></svg>',
      f'<svg viewBox="0 0 24 24" {AV_ATTR}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
      f'<svg viewBox="0 0 24 24" {AV_ATTR}><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>']
CATS = {'web': 'Premium website', 'sys': 'Web system', 'auto': 'Automation', 'seo': 'Search optimisation (SEO)'}
SHOTS = [('#f6efe4,#ead9bb', '#7a1c33,#94263f'), ('#e9eef6,#cfd9ea', '#0f1b33,#17264a'), ('#eef6f3,#d4ebe4', '#1f6f63,#3fd0b6'),
         ('#f7f1e1,#e8d7a9', '#a8862f,#c6a24e'), ('#f3e9ec,#e3c9d0', '#5f1427,#7a1c33'), ('#e6ecf5,#c9d6e8', '#17264a,#3fd0b6')]
ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
roman = lambda i: ROMAN[i] if i < len(ROMAN) else str(i + 1)


def safe_url(u):
    """Links and images typed in the admin panel: no javascript:, data: or vbscript: addresses."""
    u = '' if u is None else str(u).strip()
    return '' if re.match(r'(?i)^(javascript|data|vbscript):', re.sub(r'[\s\x00-\x1f]', '', u)) else u


def get(c, path):
    cur = c
    for k in path.split('.'):
        cur = (cur[int(k)] if int(k) < len(cur) else '') if isinstance(cur, list) else cur.get(k, '') if isinstance(cur, dict) else ''
    return '' if cur is None else cur


# ------------------------------------------------------------------ renderers
def lines(items, delays):
    out = ''
    for i, t in enumerate(items):
        d = delays(i)
        st = ' style="transition-delay:%ss"' % d if d else ''
        out += f'<span class="line-mask"><span{st}>{E(t)}</span></span>'
    return out


def sec(x): return f'{x:.2f}'.rstrip('0').rstrip('.').lstrip('0') or '0'
def r_home_hero(c): return lines(c['home']['hero'], lambda i: sec(.05 + i * .1))
def page_lines(key): return lambda c: lines(get(c, key), lambda i: sec(i * .12) if i else None)


def r_make(c):
    out = ''
    for m in c['home']['make']:
        badge = f'<span class="new">{E(m["badge"])}</span>' if m.get('badge') else ''
        out += (f'\n      <a class="col rv" href="services.html#{m["key"]}">{badge}<span class="ic">{ICON[m["key"]]}</span><h3>{E(m["title"])}</h3>'
                f'<p>{E(m["text"])}</p><span class="more">Explore →</span></a>')
    return out + '\n    '


def r_terminal(c):
    t = c['common']['method']['terminal']
    out = '\n      <div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>'
    for i, row in enumerate(t):
        ok = ' <span class="ok">✓</span>' if i == len(t) - 1 else ''
        out += f'\n      <div class="cmd" data-cmd="{A(row["cmd"])}"><b>$</b> {E(row["cmd"])}</div>\n      <div class="out">{E(row["out"])}{ok}</div>'
    return out + '\n    '


def r_method_title(c): return ''.join(f'<span>{E(t)}</span>' for t in c['common']['method']['title'])


def slides(items):
    out = ''
    for i, t in enumerate(items):
        who = ', '.join(x for x in (t.get('role'), t.get('company')) if x)
        out += (f'\n        <figure class="tslide{" on" if i == 0 else ""}"><span class="tag">{E(t["tag"])}</span><blockquote>“{E(t["quote"])}”</blockquote>'
                f'\n          <figcaption><span class="av" aria-hidden="true">{AV[i % 3]}</span><span><b>{E(t["name"])}</b><span>{E(who)}</span></span></figcaption></figure>')
    return out + '\n      '


def steps(items):
    return ''.join(f'\n      <div class="rv"><span class="n">{roman(i)}</span><div><b>{E(s["title"])}</b><p>{E(s["text"])}</p></div></div>' for i, s in enumerate(items)) + '\n    '


def work_card(p, i, href):
    bg, hero = SHOTS[i % len(SHOTS)]
    img, link = safe_url(p.get('image')), safe_url(p.get('link'))
    if img:
        shot = f'<div class="shot"><img src="{A(img)}" alt="{A(p["name"])}" loading="lazy" style="width:100%;height:100%;object-fit:cover"></div>'
    else:
        shot = f'<div class="shot" style="background:linear-gradient(160deg,{bg})"><div class="scr"><i></i><i></i><div class="hero-b" style="background:linear-gradient(135deg,{hero})"></div></div></div>'
    tgt = ' target="_blank" rel="noopener"' if link else ''
    return (f'<a class="wcard rv" data-c="{A(p["category"])}" href="{A(link or href)}"{tgt}>{shot}'
            f'<div class="meta"><h3>{E(p["name"])}</h3><span class="tag">{E(CATS.get(p["category"], p["category"]))}</span></div><p>{E(p["result"])}</p></a>')


def r_home_work(c): return ''.join('\n      ' + work_card(p, i, 'work.html') for i, p in enumerate(c['work']['projects'][:3])) + '\n    '
def r_work_cards(c): return ''.join('\n      ' + work_card(p, i, 'proposal.html') for i, p in enumerate(c['work']['projects'])) + '\n    '


def r_work_filters(c):
    used = [k for k in CATS if any(p['category'] == k for p in c['work']['projects'])]
    labels = {'web': 'Premium websites', 'sys': 'Web systems', 'auto': 'Automations', 'seo': 'Search optimisation (SEO)'}
    return '\n      <button aria-pressed="true" data-f="all">All</button>' + ''.join(f'<button aria-pressed="false" data-f="{k}">{labels[k]}</button>' for k in used) + '\n    '


def r_services_index(c): return ''.join(f'<a href="#{s["key"]}">{E(s["chip"])}</a>' for s in c['services']['items'])


FLOW = ('\n        <div class="flow rv" id="flow" aria-label="An automation running: enquiry, qualify, reply, CRM, alert" role="img">'
        '\n          <span class="lab">Live example · one enquiry</span>'
        '\n          <ol><li><i>01</i>Enquiry arrives</li><li><i>02</i>Qualified</li><li><i>03</i>WhatsApp reply</li><li><i>04</i>Logged in CRM</li><li><i>05</i>Owner alerted</li></ol>'
        '\n          <div class="clock" id="clock">00.0 s</div>\n        </div>')
EXTRA_LINK = {'websites': '<a class="ulink" href="work.html">See work</a>', 'automations': '<a class="ulink" href="./#method">How it runs</a>'}


def r_services(c):
    out = ''
    for s in c['services']['items']:
        pts = ''.join(f'\n          <div class="rv"><span class="k">{chr(97 + i)}</span><div><b>{E(p["title"])}</b><p>{E(p["text"])}</p></div></div>' for i, p in enumerate(s['points']))
        n = len(s['facts'])
        style = f' style="grid-template-columns:repeat({n},minmax(0,1fr))"' if n != 3 else ''
        facts = ''.join(f'<div><span>{E(f["label"])}</span><b>{E(f["value"])}</b></div>' for f in s['facts'])
        out += (f'\n    <article class="svc" id="{s["key"]}">'
                f'\n      <div class="stick rv"><span class="num">{E(s["label"])}</span><h2>{E(s["heading"])}</h2><p>{E(s["intro"])}</p>'
                f'\n        <div class="row"><a class="btn solid" href="proposal.html#{s["key"]}">Request a proposal</a>{EXTRA_LINK.get(s["key"], "")}</div></div>'
                f'\n      <div>\n        <div class="list">{pts}\n        </div>{FLOW if s["key"] == "automations" else ""}'
                f'\n        <div class="facts rv"{style}>{facts}</div>\n      </div>\n    </article>\n')
    return out + '  '


def r_faq(c): return ''.join(f'\n      <details><summary>{E(f["q"])}</summary><p>{E(f["a"])}</p></details>' for f in c['services']['faq']) + '\n    '


def r_phases(c):
    out = ''
    ph = c['method']['phases']
    for i, p in enumerate(ph):
        items = ''.join(f'<li><b>{E(x["label"])}</b><span>{E(x["tag"])}</span></li>' for x in p['items'])
        ok = ' <span class="ok">✓</span>' if i == len(ph) - 1 else ''
        pid = re.sub(r'[^a-z0-9]+', '-', p['title'].lower()).strip('-') or f'step-{i + 1}'
        last = ' style="border-bottom:0"' if i == len(ph) - 1 else ''
        out += (f'\n    <section class="phase" id="{pid}"{last}>'
                f'\n      <div class="rv"><div class="k">{i + 1:02d}</div><h2>{E(p["title"])}</h2><p>{E(p["text"])}</p>'
                f'\n        <div class="term small" role="img" aria-label="{A(p["cmd"].split(" --")[0])}"><div class="dots" aria-hidden="true"><i></i><i></i><i></i></div><div class="cmd" data-cmd="{A(p["cmd"])}"><b>$</b> {E(p["cmd"])}</div><div class="out">{E(p["out"])}{ok}</div></div></div>'
                f'\n      <ul class="rv">{items}</ul>\n    </section>')
    return out + '\n  '


def r_story(c): return ''.join(f'\n      <p class="rv">{E(p)}</p>' for p in c['about']['story']) + '\n      <a class="btn solid rv" href="proposal.html" style="margin-top:10px">Request a proposal</a>\n    '


def r_people(c):
    out = ''
    for p in c['about']['people']:
        photo = safe_url(p.get('photo'))
        ph = f'<div class="ph" aria-hidden="true"><img src="{A(photo)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>' if photo else f'<div class="ph" aria-hidden="true">{E(p.get("initials", ""))}</div>'
        out += f'\n      <div class="person rv">{ph}<span class="role">{E(p["role"])}</span><h3>{E(p["name"])}</h3><p>{E(p["bio"])}</p></div>'
    return out + '\n    '


def r_values(c): return ''.join(f'\n      <div class="rv"><b>{E(v["title"])}</b><p>{E(v["text"])}</p></div>' for v in c['about']['values']) + '\n    '


def r_next(c):
    n = c['proposal']['next']
    last = lambda i: ' style="border-bottom:0"' if i == len(n) - 1 else ''
    return ''.join(f'\n          <div{last(i)}><span class="n">{roman(i)}</span><div><b>{E(s["title"])}</b><p>{E(s["text"])}</p></div></div>' for i, s in enumerate(n)) + '\n        '


RENDER = {
    'home.hero': r_home_hero, 'home.make': r_make, 'home.testimonials': lambda c: slides(c['home']['testimonials']), 'home.steps': lambda c: steps(c['home']['steps']),
    'home.work': r_home_work, 'method.terminal': r_terminal, 'method.title': r_method_title,
    'services.hero': page_lines('services.hero'), 'services.index': r_services_index, 'services.items': r_services, 'services.faq': r_faq,
    'work.hero': page_lines('work.hero'), 'work.filters': r_work_filters, 'work.cards': r_work_cards,
    'methodpage.hero': page_lines('method.hero'), 'methodpage.phases': r_phases,
    'about.hero': page_lines('about.hero'), 'about.story': r_story, 'about.people': r_people, 'about.values': r_values,
    'about.testimonials': lambda c: slides(c['about']['testimonials']), 'about.steps': lambda c: steps(c['about']['steps']),
    'proposal.hero': page_lines('proposal.hero'), 'proposal.next': r_next,
}


# ------------------------------------------------------------------ HTML element replacement
TAG = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(/?)>')
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}


def _close(s, name, pos):
    """Index of the matching </name> for an element whose start tag ends at pos."""
    depth = 1
    for m in TAG.finditer(s, pos):
        if m.group(2).lower() != name: continue
        if m.group(1): depth -= 1
        elif not m.group(3): depth += 1
        if depth == 0: return m.start(), m.end()
    raise ValueError(f'unclosed <{name}>')


def _replace_inner(s, attr, fn):
    pat = re.compile(r'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\s' + attr + r'="([^"]+)"[^>]*>')
    out, pos = [], 0
    for m in pat.finditer(s):
        if m.start() < pos: continue  # inside an element already replaced
        name = m.group(1).lower()
        cs, ce = _close(s, name, m.end())
        out.append(s[pos:m.end()]); out.append(fn(m.group(2))); out.append(s[cs:ce]); pos = ce
    out.append(s[pos:])
    return ''.join(out)


def apply(page_html, content, page_key=None):
    s = _replace_inner(page_html, 'data-cms-list', lambda key: RENDER[key](content))
    s = _replace_inner(s, 'data-cms', lambda key: E(get(content, key)))
    if page_key and page_key in content.get('seo', {}):
        seo = content['seo'][page_key]
        s = re.sub(r'<title>.*?</title>', lambda m: f'<title>{E(seo["title"])}</title>', s, count=1, flags=re.S)
        s = re.sub(r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{A(seo["description"])}">', s, count=1)
        if page_key == 'index':
            s = re.sub(r'<meta property="og:title" content="[^"]*">', lambda m: f'<meta property="og:title" content="{A(seo.get("og_title") or seo["title"])}">', s, count=1)
            s = re.sub(r'<meta property="og:description" content="[^"]*">', lambda m: f'<meta property="og:description" content="{A(seo.get("og_description") or seo["description"])}">', s, count=1)
    return s
