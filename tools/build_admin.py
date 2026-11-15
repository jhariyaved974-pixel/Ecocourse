#!/usr/bin/env python3
"""Assemble the WeberAct admin dashboard as its own deployment, separate from the website.

    python3 tools/build_admin.py            # writes dist-admin/

dist-admin/
  index.html              the dashboard (weberact-admin/index.html)
  assets/                 its scripts, fonts and icon (connect.js is shared with the website)
  site/                   a private copy of the website, used only for the dashboard's live preview
                          (the preview edits the page in place, so it must come from the same address)
  robots.txt              keeps the whole deployment out of search engines

The website itself (weberact/) no longer contains any admin page.
"""
import pathlib, re, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, ADMIN, OUT = ROOT / 'weberact', ROOT / 'weberact-admin', ROOT / 'dist-admin'
NOINDEX = '<meta name="robots" content="noindex, nofollow">'


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / 'assets').mkdir(parents=True)
    # the dashboard
    shutil.copy(ADMIN / 'index.html', OUT / 'index.html')
    if (ADMIN / 'assets').is_dir():  # optional: the dashboard's own scripts (the renderer is shared with the site)
        for f in (ADMIN / 'assets').iterdir():
            shutil.copy(f, OUT / 'assets' / f.name)
    shutil.copy(SITE / 'assets/connect.js', OUT / 'assets/connect.js')
    shutil.copy(SITE / 'assets/cms-render.js', OUT / 'assets/cms-render.js')  # the same renderer the website uses for live updates
    shutil.copy(SITE / 'assets/favicon.svg', OUT / 'assets/favicon.svg')
    shutil.copytree(SITE / 'assets/fonts', OUT / 'assets/fonts')
    # the preview copy of the website, kept out of search results
    shutil.copytree(SITE, OUT / 'site', ignore=shutil.ignore_patterns('sitemap.xml', 'robots.txt'))
    for page in (OUT / 'site').glob('*.html'):
        s = page.read_text()
        s = re.sub(r'<meta name="robots"[^>]*>\n?', '', s)
        page.write_text(s.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + NOINDEX, 1))
    (OUT / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
    n = sum(1 for _ in OUT.rglob('*') if _.is_file())
    print(f'build_admin: wrote {n} files to {OUT.relative_to(ROOT)}/')


if __name__ == '__main__':
    main()
