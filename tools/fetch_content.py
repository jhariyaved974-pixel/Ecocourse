#!/usr/bin/env python3
"""Refresh weberact/content.json from the copy published in the admin dashboard.

Run before tools/weberact_pages.py in the hosting build:

    python3 tools/fetch_content.py && python3 tools/weberact_pages.py --domain weberact.co

It reads the 'live' row of public.site_content (visitors may read only that row) with the
Supabase URL and publishable key in weberact/assets/connect.js, or SUPABASE_URL and
SUPABASE_KEY if set. Anything missing from the published copy keeps the value in the
committed content.json, and if the database cannot be reached, or the published copy does
not render, the committed file is used unchanged, so a build never fails because of it.
"""
import json, os, pathlib, re, sys, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
SITE = HERE.parent / 'weberact'
sys.path.insert(0, str(HERE))
import cms  # noqa: E402


def keys():
    js = (SITE / 'assets/connect.js').read_text()
    url = os.environ.get('SUPABASE_URL') or re.search(r"SUPABASE_URL = '([^']*)'", js).group(1)
    key = os.environ.get('SUPABASE_KEY') or re.search(r"SUPABASE_KEY = '([^']*)'", js).group(1)
    return url.rstrip('/'), key


def merge(base, new):
    """The published copy wins; keys it lacks (added to the site later) keep the committed value."""
    if isinstance(base, dict) and isinstance(new, dict):
        return {k: merge(base[k], new[k]) if k in base and k in new else new.get(k, base.get(k)) for k in {**base, **new}}
    return new if type(new) is type(base) or base is None else base


def main():
    path = SITE / 'content.json'
    committed = json.loads(path.read_text())
    url, key = keys()
    if not (url and key):
        print('fetch_content: no Supabase keys in connect.js; using the committed content.json'); return
    headers = {'apikey': key, 'Accept': 'application/json'}
    if not key.startswith('sb_'):
        headers['Authorization'] = 'Bearer ' + key
    try:
        req = urllib.request.Request(f'{url}/rest/v1/site_content?id=eq.live&select=content,updated_at,updated_by', headers=headers)
        rows = json.load(urllib.request.urlopen(req, timeout=20))
    except Exception as e:  # network or permission problem: keep the committed copy
        print(f'fetch_content: could not reach the database ({e}); using the committed content.json'); return
    if not rows:
        print('fetch_content: nothing published from the dashboard yet; using the committed content.json'); return
    content = merge(committed, rows[0]['content'])
    try:
        for f in cms.RENDER.values():
            f(content)
    except Exception as e:
        print(f'fetch_content: the published content does not render ({e!r}); using the committed content.json'); return
    path.write_text(json.dumps(content, indent=1, ensure_ascii=False) + '\n')
    print(f'fetch_content: using the copy published {rows[0]["updated_at"]} by {rows[0].get("updated_by") or "unknown"}')


if __name__ == '__main__':
    main()
