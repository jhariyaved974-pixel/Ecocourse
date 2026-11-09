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
"""
import argparse, pathlib, re

SITE = pathlib.Path(__file__).resolve().parent.parent / 'weberact'
PAGES = {  # file: (data-page key, sitemap priority)
    'index.html': ('home', '1.0'), 'services.html': ('services', '0.9'),
    'work.html': ('work', '0.8'), 'method.html': ('method', '0.7'), 'about.html': ('about', '0.7'),
    'proposal.html': ('proposal', '0.8'), 'terms.html': ('terms', '0.3'), 'privacy.html': ('privacy', '0.3'),
}
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


def chrome_top(page, mark):
    left = ''.join(link(i, page) for i in NAV_L)
    right = ''.join(link(i, page) for i in NAV_R)
    drawer = ''.join(link(i, page) for i in [*NAV_L, *NAV_R])
    return (
        '<div class="topline"><div class="wrap"><span>Premium websites, web systems and automations</span></div></div>\n'
        f'<header class="head"><div class="wrap">\n  <nav aria-label="Primary">{left}</nav>\n'
        f'  <a class="logo" href="./" aria-label="WeberAct home">{mark}<b>WeberAct</b></a>\n'
        f'  <div class="right"><nav aria-label="Secondary">{right}</nav><a class="btn line" href="proposal.html">Request a proposal</a></div>\n'
        '  <button class="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><i></i><i></i><i></i></button></div></header>\n'
        f'<div class="drawer" id="drawer">{drawer}<a class="btn solid" href="proposal.html">Request a proposal</a></div>'
    )


def chrome_foot(mark):
    return (
        '<footer class="foot"><div class="wrap">\n'
        f'  <div><a class="logo" href="./" aria-label="WeberAct home">{mark}<b>WeberAct</b></a><p>Premium websites, web systems, automations and search, built on a written promise.</p></div>\n'
        '  <div><h2>Services</h2><ul><li><a href="services.html#websites">Premium websites</a></li><li><a href="services.html#systems">Web systems</a></li><li><a href="services.html#automations">Automations</a></li><li><a href="services.html#search">Search optimisation (SEO)</a></li></ul></div>\n'
        '  <div><h2>Studio</h2><ul><li><a href="work.html">Work</a></li><li><a href="method.html">Method</a></li><li><a href="about.html">About</a></li><li><a href="proposal.html">Request a proposal</a></li></ul></div>\n'
        '  <div><h2>Legal</h2><ul><li><a href="terms.html">Terms &amp; Conditions</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>\n'
        '  <div class="base"><span>Built on a promise. © <span data-year>2026</span> WeberAct</span><span>Replies within one working day</span></div></div></footer>'
    )


def head_block(name, domain):
    lines = ["<script>document.documentElement.classList.add('js')</script>",
             f'<link rel="preload" href="{FONT_MAIN}" as="font" type="font/woff2" crossorigin>']
    if name == 'method.html':
        lines.append(f'<link rel="preload" href="{FONT_COND}" as="font" type="font/woff2" crossorigin>')
    if domain:
        url = f'https://{domain}/' + ('' if name == 'index.html' else name)
        lines += [f'<link rel="canonical" href="{url}">', f'<meta property="og:url" content="{url}">']
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
    domain = (ap.parse_args().domain or '').strip().strip('/').removeprefix('https://').removeprefix('http://')
    mark = mark_svg()
    for name, (page, _) in PAGES.items():
        p = SITE / name
        s = p.read_text()
        # Google Fonts are replaced by the self-hosted files in assets/fonts
        s = re.sub(r'\n<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"[^>]*>', '', s)
        s = re.sub(r'\n<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">', '', s)
        # head: js class, font preload, canonical
        s = re.sub(r'\n<!-- wa:head -->.*?<!-- /wa:head -->', '', s, flags=re.S)
        s = s.replace('<link rel="stylesheet" href="assets/site.css">', head_block(name, domain) + '\n<link rel="stylesheet" href="assets/site.css">', 1)
        # body: header and footer baked in
        s = put(s, 'top', chrome_top(page, mark), r'<body[^>]*>', 'after')
        s = put(s, 'foot', chrome_foot(mark), r'<script src="assets/site\.js"', 'before')
        s = s.replace('<script src="assets/site.js"></script>', '<script src="assets/site.js" defer></script>')
        # logo marks that site.js used to fill in
        s = re.sub(r'(<div[^>]*\bdata-mark\b[^>]*>)\s*(?:<svg.*?</svg>)?\s*(</div>)', lambda m: m.group(1) + mark + m.group(2), s, flags=re.S)
        p.write_text(s)
    if domain:
        urls = ''.join(f'  <url><loc>https://{domain}/{"" if n == "index.html" else n}</loc><priority>{pr}</priority></url>\n' for n, (_, pr) in PAGES.items())
        (SITE / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
        (SITE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: https://{domain}/sitemap.xml\n')
    print('updated', len(PAGES), 'pages', f'(canonical: https://{domain}/)' if domain else '(no domain: canonical tags not added)')


if __name__ == '__main__':
    main()
