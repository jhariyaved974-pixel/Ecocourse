#!/usr/bin/env python3
"""Validate the JSON-LD on every built WeberAct page.

    python3 tools/validate_schema.py weberact [--domain weberact.co]

Checks: the JSON parses; every {"@id": ...} reference points to a node in the same graph; no node is
defined twice; required properties are present (Organization, WebSite, WebPage, BreadcrumbList,
Service, FAQPage questions); every URL is absolute https on the site's domain (or an allowed
external host); breadcrumb positions run 1..n; and every FAQ question and answer in the markup is
also visible on the page. Exits 1 if anything fails.
"""
import html, json, pathlib, re, sys

REQUIRED = {
    'Organization': ['name', 'url', 'logo'], 'WebSite': ['name', 'url', 'publisher'], 'WebPage': ['url', 'name', 'isPartOf'],
    'AboutPage': ['url', 'name'], 'ContactPage': ['url', 'name'], 'FAQPage': ['mainEntity'], 'BreadcrumbList': ['itemListElement'],
    'Service': ['name', 'provider', 'description'], 'Question': ['name', 'acceptedAnswer'], 'Answer': ['text'],
}


def types(n):
    t = n.get('@type', [])
    return t if isinstance(t, list) else [t]


def walk(n, fn):
    if isinstance(n, dict):
        fn(n)
        for v in n.values(): walk(v, fn)
    elif isinstance(n, list):
        for v in n: walk(v, fn)


def visible_text(s):
    s = re.sub(r'<script.*?</script>|<style.*?</style>|<svg.*?</svg>', ' ', s, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s)))


def main():
    folder = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'weberact')
    domain = sys.argv[sys.argv.index('--domain') + 1] if '--domain' in sys.argv else 'weberact.co'
    errors, count = [], 0
    for f in sorted(folder.glob('*.html')):
        s = f.read_text()
        blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, flags=re.S)
        if not blocks:
            if 'noindex' not in s: errors.append(f'{f.name}: no JSON-LD')
            continue
        text = visible_text(s)
        for raw in blocks:
            count += 1
            try: data = json.loads(raw.replace('<\\/', '</'))
            except Exception as e: errors.append(f'{f.name}: JSON does not parse: {e}'); continue
            nodes = data.get('@graph', [data])
            ids = {}
            for n in nodes:
                if '@id' in n:
                    if n['@id'] in ids: errors.append(f'{f.name}: {n["@id"]} defined twice')
                    ids[n['@id']] = n
            refs, inner = [], set()
            walk(data, lambda n: inner.add(n['@id']) if '@id' in n and len(n) > 1 else None)
            walk(data, lambda n: refs.append(n['@id']) if list(n) == ['@id'] else None)
            for r in refs:
                if r not in ids and r not in inner: errors.append(f'{f.name}: reference {r} has no node')
            def check(n):
                for t in types(n):
                    for prop in REQUIRED.get(t, []):
                        if prop not in n: errors.append(f'{f.name}: {t} missing {prop}')
                for k in ('url', 'item', 'contentUrl'):
                    v = n.get(k)
                    if isinstance(v, str) and not v.startswith(f'https://{domain}/'):
                        errors.append(f'{f.name}: {k} not on https://{domain}/: {v}')
                if 'BreadcrumbList' in types(n):
                    pos = [i.get('position') for i in n['itemListElement']]
                    if pos != list(range(1, len(pos) + 1)): errors.append(f'{f.name}: breadcrumb positions {pos}')
                if 'Question' in types(n):
                    q, a = n.get('name', ''), n.get('acceptedAnswer', {}).get('text', '')
                    if q not in text: errors.append(f'{f.name}: FAQ question not visible: {q[:60]}')
                    if a not in text: errors.append(f'{f.name}: FAQ answer not visible: {a[:60]}')
                if t := [x for x in types(n) if x in ('Organization',)]:
                    for v in n.get('sameAs', []):
                        if not v.startswith('https://'): errors.append(f'{f.name}: sameAs not https: {v}')
            walk(data, check)
            canon = re.search(r'<link rel="canonical" href="([^"]+)"', s)
            page = [n for n in nodes if any(t in ('WebPage', 'AboutPage', 'ContactPage') for t in types(n))]
            if canon and page and page[0].get('url') != canon.group(1):
                errors.append(f'{f.name}: WebPage url {page[0].get("url")} differs from canonical {canon.group(1)}')
    for e in errors: print('FAIL', e)
    print(f'{count} JSON-LD blocks checked in {folder}/: {"no problems" if not errors else str(len(errors)) + " problems"}')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
