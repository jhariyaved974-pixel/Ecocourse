#!/usr/bin/env python3
"""WeberAct technical SEO audit: crawl the site and check every page.

    python3 tools/seo_audit.py https://weberact.vercel.app          # live site
    python3 tools/seo_audit.py weberact                             # local build folder
    python3 tools/seo_audit.py https://weberact.vercel.app --json audit.json

Checks, per page: HTTP status, redirects, title and description length, canonical, robots meta,
one H1, heading order, image alt text, internal links that break, JSON-LD that does not parse,
Open Graph tags, lang attribute, word count and page weight. Standard library only, so it runs
anywhere (locally, in CI, or from an n8n "Execute Command" node).
"""
import argparse, html.parser, json, pathlib, re, sys, urllib.error, urllib.parse, urllib.request

UA = 'WeberAct-SEO-Audit/1.0 (+https://weberact.co)'


class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.meta, self.links, self.imgs, self.heads, self.jsonld = '', {}, [], [], [], []
        self.canonical, self.lang, self.hreflang = None, None, []
        self._in, self._buf, self._skip, self.text = None, [], 0, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html': self.lang = a.get('lang')
        if tag in ('script', 'style', 'svg', 'noscript'):
            self._skip += 1
            if tag == 'script' and a.get('type') == 'application/ld+json': self._in, self._buf = 'ld', []
        if tag == 'title': self._in, self._buf = 'title', []
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'): self._in, self._buf, self._h = 'h', [], int(tag[1])
        if tag == 'meta':
            k = a.get('name') or a.get('property')
            if k: self.meta[k.lower()] = a.get('content', '')
        if tag == 'link' and a.get('rel') == 'canonical': self.canonical = a.get('href')
        if tag == 'link' and a.get('rel') == 'alternate' and a.get('hreflang'): self.hreflang.append((a['hreflang'], a.get('href')))
        if tag == 'a' and a.get('href'): self.links.append(a['href'])
        if tag == 'img': self.imgs.append(a)

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'svg', 'noscript'):
            self._skip = max(0, self._skip - 1)
            if tag == 'script' and self._in == 'ld': self.jsonld.append(''.join(self._buf)); self._in = None
        if tag == 'title' and self._in == 'title': self.title = ''.join(self._buf).strip(); self._in = None
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6') and self._in == 'h':
            self.heads.append((self._h, re.sub(r'\s+', ' ', ''.join(self._buf)).strip())); self._in = None

    def handle_data(self, d):
        if self._in: self._buf.append(d)
        if not self._skip and self._in != 'title': self.text.append(d)


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, r.geturl(), r.read().decode('utf-8', 'replace'), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, url, e.read().decode('utf-8', 'replace'), dict(e.headers)


def types(node):
    out = []
    if isinstance(node, list):
        for n in node: out += types(n)
    elif isinstance(node, dict):
        t = node.get('@type')
        if t: out += t if isinstance(t, list) else [t]
        for v in node.values():
            if isinstance(v, (dict, list)): out += types(v)
    return out


def audit_page(path, body):
    p = Page(); p.feed(body)
    issues = []
    t, d = p.title, p.meta.get('description', '')
    if not t: issues.append(('high', 'Missing <title>'))
    elif not 30 <= len(t) <= 65: issues.append(('low', f'Title length {len(t)} (aim for 30–65 characters)'))
    if not d: issues.append(('high', 'Missing meta description'))
    elif not 70 <= len(d) <= 165: issues.append(('low', f'Description length {len(d)} (aim for 70–165)'))
    if not p.canonical: issues.append(('medium', 'No canonical URL'))
    h1 = [h for h in p.heads if h[0] == 1]
    if len(h1) != 1: issues.append(('high' if not h1 else 'medium', f'{len(h1)} H1 headings (expected 1)'))
    last = 0
    for lvl, txt in p.heads:
        if last and lvl > last + 1: issues.append(('low', f'Heading jumps from H{last} to H{lvl} at “{txt[:40]}”'))
        last = lvl
    for im in p.imgs:
        if 'alt' not in im: issues.append(('medium', f'Image without alt: {im.get("src", "")[:60]}'))
    if not p.lang: issues.append(('medium', 'No lang attribute on <html>'))
    for k in ('og:title', 'og:description', 'og:image'):
        if k not in p.meta: issues.append(('low', f'Missing {k}'))
    ld = []
    for raw in p.jsonld:
        try: ld += types(json.loads(raw))
        except Exception as e: issues.append(('high', f'JSON-LD does not parse: {e}'))
    if not p.jsonld: issues.append(('medium', 'No structured data (JSON-LD)'))
    words = len(re.findall(r"[A-Za-z][A-Za-z'’-]+", ' '.join(p.text)))
    robots = p.meta.get('robots', '')
    return {'path': path, 'title': t, 'title_len': len(t), 'description_len': len(d), 'canonical': p.canonical, 'robots': robots,
            'h1': [h[1] for h in h1], 'headings': p.heads, 'words': words, 'bytes': len(body.encode()), 'jsonld_types': sorted(set(ld)),
            'links': p.links, 'hreflang': p.hreflang, 'issues': issues}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target', help='site URL or local build folder')
    ap.add_argument('--json', help='write full results to this file')
    a = ap.parse_args()
    local = not a.target.startswith('http')
    base = pathlib.Path(a.target) if local else a.target.rstrip('/') + '/'
    seen, queue, pages, broken = set(), ['index.html'], [], []
    while queue:
        rel = queue.pop(0) or 'index.html'
        if rel in seen: continue
        seen.add(rel)
        if not local and rel == 'index.html': rel = ''
        if local:
            f = base / (rel or 'index.html')
            if not f.exists(): broken.append(rel); continue
            status, body, final = 200, f.read_text(), rel
        else:
            status, final, body, _ = fetch(base + rel)
            if status >= 400: broken.append(f'{rel} ({status})'); continue
        r = audit_page(rel or 'index.html', body); r['status'] = status
        if not local and final.rstrip('/') != (base + rel).rstrip('/'): r['issues'].append(('medium', f'Redirects to {final}'))
        pages.append(r)
        for href in r['links']:
            u = urllib.parse.urlparse(href)
            if u.scheme in ('http', 'https', 'mailto', 'tel') or href.startswith('#'): continue
            path = u.path.lstrip('./').lstrip('/') if u.path not in ('./', '/', '') else ''
            if path.endswith('/') : path += 'index.html'
            if path and not path.endswith('.html'): continue
            if (path or 'index.html') not in seen: queue.append(path or 'index.html')
    # sitemap and robots
    extra = []
    if local:
        sm = (base / 'sitemap.xml').read_text() if (base / 'sitemap.xml').exists() else ''
        rb = (base / 'robots.txt').read_text() if (base / 'robots.txt').exists() else ''
    else:
        sm = fetch(base + 'sitemap.xml')[2]; rb = fetch(base + 'robots.txt')[2]
    locs = re.findall(r'<loc>([^<]+)</loc>', sm)
    if not locs: extra.append(('high', 'sitemap.xml missing or empty'))
    if 'Sitemap:' not in rb: extra.append(('medium', 'robots.txt does not reference the sitemap'))
    found = {p['path'] for p in pages}
    for loc in locs:
        tail = urllib.parse.urlparse(loc).path.lstrip('/') or 'index.html'
        if tail not in found: extra.append(('medium', f'Sitemap URL not reachable by internal links: {loc}'))
    for p in pages:
        if p['path'] not in [urllib.parse.urlparse(l).path.lstrip('/') or 'index.html' for l in locs] and 'noindex' not in p['robots']:
            extra.append(('low', f'Indexable page missing from sitemap: {p["path"]}'))
    titles = {}
    for p in pages: titles.setdefault(p['title'], []).append(p['path'])
    for t, ps in titles.items():
        if len(ps) > 1: extra.append(('high', f'Duplicate title “{t}” on {", ".join(ps)}'))
    # report
    print(f'# Audit of {a.target}: {len(pages)} pages, {len(broken)} broken internal links\n')
    print('| Page | Status | Title chars | Desc chars | H1 | Words | KB | JSON-LD types | Issues |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for p in pages:
        print(f"| {p['path']} | {p['status']} | {p['title_len']} | {p['description_len']} | {len(p['h1'])} | {p['words']} | {p['bytes'] // 1024} | {', '.join(p['jsonld_types']) or '—'} | {len(p['issues'])} |")
    print('\n## Issues\n')
    for p in pages:
        for sev, msg in p['issues']: print(f'- [{sev}] {p["path"]}: {msg}')
    for sev, msg in extra: print(f'- [{sev}] site: {msg}')
    for b in broken: print(f'- [high] broken internal link target: {b}')
    if a.json:
        pathlib.Path(a.json).write_text(json.dumps({'pages': pages, 'site_issues': extra, 'broken': broken}, indent=1))
    sys.exit(0)


if __name__ == '__main__':
    main()
