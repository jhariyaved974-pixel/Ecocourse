"""Run Harvey's trainer on local copies of autowebly.vercel.app (the live site is blocked by network policy)."""
import asyncio, sys
from pathlib import Path
from bs4 import BeautifulSoup
from harvey import trainer

PAGES_DIR = Path(sys.argv[1])
BASE = "https://autowebly.vercel.app"
MAP = {"index.html": "/", "b2b-lead-generation.html": "/b2b-lead-generation/", "blog.html": "/blog/"}

def page_text(raw_html):
    # Same cleanup as FallbackCrawler._fetch_page
    soup = BeautifulSoup(raw_html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "noscript", "iframe"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    return "\n".join(l.strip() for l in text.splitlines() if l.strip())

async def local_crawl(self, base_url, max_pages=100):
    self.blocked = False
    pages = {BASE + path: page_text((PAGES_DIR / f).read_text()) for f, path in MAP.items()}
    print(f"      Loaded {len(pages)} local pages.")
    return pages

trainer.FallbackCrawler.crawl = local_crawl
asyncio.run(trainer.run_training(BASE))
