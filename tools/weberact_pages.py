#!/usr/bin/env python3
"""Bake WeberAct's shared page chrome into every HTML page.

The header, menu drawer, footer and logo marks used to be injected by
assets/site.js after the page had painted, which pushed the content down
(a Core Web Vitals layout shift) and hid the navigation from crawlers.
This script writes them into each page between marker comments, sets up
the <head> (self-hosted font preload, the `js` class, canonical URL) and
loads site.js with `defer`. It is idempotent: run it again after editing.

    python3 tools/weberact_pages.py                       # no canonical tags
    python3 tools/weberact_pages.py --domain weberact.com  # adds canonical, og:url, sitemap.xml, robots.txt

All editable words, lists and settings come from weberact/content.json (see tools/cms.py), which the
admin panel edits; tools/fetch_content.py refreshes that file from Supabase before a build.
"""
import argparse, json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import cms  # noqa: E402
import seo_schema  # noqa: E402

SITE = pathlib.Path(__file__).resolve().parent.parent / 'weberact'
PAGES = {  # file: (data-page key, sitemap priority)
    'index.html': ('home', '1.0'), 'services.html': ('services', '0.9'),
    'work.html': ('work', '0.8'), 'method.html': ('method', '0.7'), 'about.html': ('about', '0.7'),
    'proposal.html': ('proposal', '0.8'), 'terms.html': ('terms', '0.3'), 'privacy.html': ('privacy', '0.3'),
    'website-development.html': ('services', '0.9'), 'technical-seo.html': ('services', '0.9'),
    'ai-automation.html': ('services', '0.9'), 'b2b-lead-generation.html': ('services', '0.9'),
    'international.html': ('international', '0.6'),
}
EXTRA = {'404.html': 'notfound'}  # built like the other pages, but never canonical, indexed or in the sitemap
OG_IMAGE = 'assets/og-image.png'  # 1200 x 630, made by tools/make_brand_images.py
NAV_L = [('./', 'Home', 'home'), ('work.html', 'Work', 'work'), ('services.html', 'Services', 'services'), ('method.html', 'Method', 'method')]
NAV_R = [('about.html', 'About', 'about')]
FONT_MAIN = 'assets/fonts/schibsted-grotesk-latin.woff2'
FONT_COND = 'assets/fonts/big-shoulders-display-latin.woff2'


def mark_svg():
    js = (SITE / 'assets/site.js').read_text()
    return re.search(r"const MARK = '(<svg.*?</svg>)';", js).group(1)


def link(item, page):
    href, text, key = item
    return f'<a href="{href}"{" aria-current=\"page\"" if key == page else ""}>{text}</a>'


SOCIAL = [('linkedin', 'LinkedIn'), ('instagram', 'Instagram'), ('x', 'X')]


def chrome_top(page, mark, st):
    cta = cms.E(st.get('header_button') or 'Request a proposal')
    left = ''.join(link(i, page) for i in NAV_L)
    right = ''.join(link(i, page) for i in NAV_R)
    drawer = ''.join(link(i, page) for i in [*NAV_L, *NAV_R])
    return (
        f'<div class="topline"><div class="wrap"><span data-cms="settings.topline">{cms.E(st.get("topline", ""))}</span></div></div>\n'
        f'<header class="head"><div class="wrap">\n  <nav aria-label="Primary">{left}</nav>\n'
        f'  <a class="logo" href="./" aria-label="WeberAct home">{mark}<b>WeberAct</b></a>\n'
        f'  <div class="right"><nav aria-label="Secondary">{right}</nav><a class="btn line" href="proposal.html" data-cms="settings.header_button">{cta}</a></div>\n'
        '  <button class="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><i></i><i></i><i></i></button></div></header>\n'
        f'<div class="drawer" id="drawer">{drawer}<a class="btn solid" href="proposal.html" data-cms="settings.header_button">{cta}</a></div>'
    )


def chrome_foot(mark, st, content):
    pages = content.get('pages', {})
    svc = cms.r_footer_services(content)
    intl = '<li><a href="international.html">International clients</a></li>' if 'international' in pages else ''
    contact = contact_links(st)
    contact = f'<span class="contact">{contact}</span>' if contact else ''
    social = ''.join(f'<a href="{cms.A(cms.safe_url(st[k]))}" target="_blank" rel="noopener">{label}</a>' for k, label in SOCIAL if cms.safe_url(st.get(k)))
    social = f'<span class="social">{social}</span>' if social else ''
    return (
        '<footer class="foot"><div class="wrap">\n'
        f'  <div><a class="logo" href="./" aria-label="WeberAct home">{mark}<b>WeberAct</b></a><p data-cms="settings.footer_blurb">{cms.E(st.get("footer_blurb", ""))}</p></div>\n'
        f'  <div><h2>Services</h2><ul data-cms-list="footer.services">{svc}</ul></div>\n'
        f'  <div><h2>Studio</h2><ul><li><a href="work.html">Work</a></li><li><a href="method.html">Method</a></li><li><a href="about.html">About</a></li>{intl}<li><a href="proposal.html">Request a proposal</a></li></ul></div>\n'
        '  <div><h2>Legal</h2><ul><li><a href="terms.html">Terms &amp; Conditions</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>\n'
        f'  <div class="base"><span><span data-cms="settings.footer_left">{cms.E(st.get("footer_left", ""))}</span> © <span data-year>2026</span> WeberAct</span>{contact}{social}<span data-cms="settings.footer_right">{cms.E(st.get("footer_right", ""))}</span></div></div></footer>'
    )


def contact_links(st):
    """WhatsApp, email and booking links, shown only once the real details are filled in (not placeholders)."""
    out = []
    digits = re.sub(r'\D', '', st.get('whatsapp', '') or '')
    if len(digits) >= 8:
        out.append(f'<a href="https://wa.me/{digits}" target="_blank" rel="noopener" data-track="whatsapp_click">WhatsApp</a>')
    email = (st.get('email') or '').strip()
    if seo_schema.real(email) and re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        out.append(f'<a href="mailto:{cms.A(email)}" data-track="email_click">{cms.E(email)}</a>')
    book = cms.safe_url(st.get('booking_url'))
    if book.startswith('https://'):
        out.append(f'<a href="{cms.A(book)}" target="_blank" rel="noopener" data-track="booking_click">Book a call</a>')
    return ''.join(out)


def head_block(name, domain, content):
    st = content.get('settings', {})
    key = name[:-5]
    seo = content.get('seo', {}).get(key, {})
    lines = ["<script>document.documentElement.classList.add('js')</script>", '<script src="assets/connect.js" defer></script>',
             f'<link rel="preload" href="{FONT_MAIN}" as="font" type="font/woff2" crossorigin>']
    if name == 'method.html':
        lines.append(f'<link rel="preload" href="{FONT_COND}" as="font" type="font/woff2" crossorigin>')
    lines.append('<meta name="referrer" content="strict-origin-when-cross-origin">')
    lines.append(f'<meta name="wa-version" content="{cms.A(content.get("_published_at", ""))}">')
    texts = content.get('texts') or {}
    if name == 'proposal.html' and texts:  # the proposal form is drawn by a script, so its edited texts are applied in the browser too
        lines.append('<script>window.WA_TEXTS=' + json.dumps(texts, ensure_ascii=False).replace('</', '<\\/') + '</script>')
    if name in EXTRA:
        lines.append('<meta name="robots" content="noindex">')
    for meta, val in (('google-site-verification', st.get('google_site_verification')), ('msvalidate.01', st.get('bing_site_verification'))):
        val = (val or '').strip()
        if name == 'index.html' and re.fullmatch(r'[A-Za-z0-9_\-]{10,100}', val):
            lines.append(f'<meta name="{meta}" content="{val}">')
    ga = (st.get('ga4_id') or '').strip()
    if re.fullmatch(r'G-[A-Z0-9]{4,20}', ga):  # site.js loads Google Analytics only after the visitor accepts
        consent = {k: st.get(k, '') for k in ('consent_text', 'consent_accept', 'consent_decline')}
        lines.append(f"<script>window.WA_GA='{ga}';window.WA_CONSENT=" + json.dumps(consent, ensure_ascii=False).replace('</', '<\\/') + '</script>')
    if domain and name not in EXTRA:
        base = f'https://{domain}/'
        url = base + ('' if name == 'index.html' else name)
        title = seo.get('og_title') or seo.get('title') or 'WeberAct'
        desc = seo.get('og_description') or seo.get('description') or st.get('org_description', '')
        img = base + OG_IMAGE
        lines += [f'<link rel="canonical" href="{url}">',
                  '<meta property="og:type" content="website">', '<meta property="og:site_name" content="WeberAct">', '<meta property="og:locale" content="en_US">',
                  f'<meta property="og:url" content="{url}">', f'<meta property="og:title" content="{cms.A(title)}">',
                  f'<meta property="og:description" content="{cms.A(desc)}">', f'<meta property="og:image" content="{img}">',
                  '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
                  '<meta property="og:image:alt" content="WeberAct: Build. Automate. Accelerate.">',
                  '<meta name="twitter:card" content="summary_large_image">', f'<meta name="twitter:title" content="{cms.A(title)}">',
                  f'<meta name="twitter:description" content="{cms.A(desc)}">', f'<meta name="twitter:image" content="{img}">',
                  seo_schema.graph(key, content, domain, img)]
    return '<!-- wa:head -->\n' + '\n'.join(lines) + '\n<!-- /wa:head -->'


def put(s, tag, content, anchor_re, where):
    """Replace the marked block, or insert it at the anchor the first time."""
    block = f'<!-- wa:{tag} -->\n{content}\n<!-- /wa:{tag} -->'
    marked = re.compile(rf'<!-- wa:{tag} -->.*?<!-- /wa:{tag} -->', re.S)
    if marked.search(s):
        return marked.sub(lambda _: block, s, count=1)
    m = re.search(anchor_re, s)
    if not m:
        raise SystemExit(f'anchor not found for {tag}')
    i = m.end() if where == 'after' else m.start()
    return s[:i] + ('\n' if where == 'after' else '') + block + ('\n' if where == 'before' else '') + s[i:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--domain', help='production domain, e.g. weberact.com (adds canonical tags, sitemap.xml, robots.txt)')
    ap.add_argument('--content', default=str(SITE / 'content.json'), help='content file (default weberact/content.json)')
    args = ap.parse_args()
    domain = (args.domain or '').strip().strip('/').removeprefix('https://').removeprefix('http://')
    content = json.loads(pathlib.Path(args.content).read_text())
    st = content.get('settings', {})
    mark = mark_svg()
    for name, page in [*((n, v[0]) for n, v in PAGES.items()), *EXTRA.items()]:
        p = SITE / name
        s = p.read_text()
        # social tags now live in the generated head block, for every page
        s = re.sub(r'\n<meta property="og:(title|description)" content="[^"]*">', '', s)
        # Google Fonts are replaced by the self-hosted files in assets/fonts
        s = re.sub(r'\n<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"[^>]*>', '', s)
        s = re.sub(r'\n<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">', '', s)
        # head: js class, font preload, canonical
        s = re.sub(r'\n<!-- wa:head -->.*?<!-- /wa:head -->', '', s, flags=re.S)
        s = s.replace('<link rel="stylesheet" href="assets/site.css">', head_block(name, domain, content) + '\n<link rel="stylesheet" href="assets/site.css">', 1)
        # body: header and footer baked in
        s = put(s, 'top', chrome_top(page, mark, st), r'<body[^>]*>', 'after')
        s = put(s, 'foot', chrome_foot(mark, st, content), r'<script src="assets/site\.js"', 'before')
        # words, lists and SEO from content.json
        s = cms.apply(s, content, name[:-5])
        s = cms.apply_texts(s, content.get('texts'))
        s = s.replace('<script src="assets/site.js"></script>', '<script src="assets/site.js" defer></script>')
        # logo marks that site.js used to fill in
        s = re.sub(r'(<div[^>]*\bdata-mark\b[^>]*>)\s*(?:<svg.*?</svg>)?\s*(</div>)', lambda m: m.group(1) + mark + m.group(2), s, flags=re.S)
        p.write_text(s)
    if domain:
        urls = ''.join(f'  <url><loc>https://{domain}/{"" if n == "index.html" else n}</loc><priority>{pr}</priority></url>\n' for n, (_, pr) in PAGES.items())
        (SITE / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
        (SITE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: https://{domain}/sitemap.xml\n')
    print('updated', len(PAGES) + len(EXTRA), 'pages', f'(canonical: https://{domain}/)' if domain else '(no domain: canonical tags not added)')


if __name__ == '__main__':
    main()
