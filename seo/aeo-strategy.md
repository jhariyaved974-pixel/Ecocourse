# Answer Engine Optimisation (AEO)

Goal: make WeberAct's pages easy for Google AI Overviews, ChatGPT Search, Perplexity, Microsoft
Copilot, Gemini and Bing to find, understand, quote and cite, without writing for machines at the
expense of people.

Evidence that this matters for WeberAct's searches: a live Google results check (9 November 2026,
US, "website design for manufacturers") showed an **AI Overview** on the results page.

## What was implemented

### A. Direct-answer architecture (every service page)

Each of the four service pages and the international page follows the same order:

1. **H1** naming the service and audience ("Technical SEO for B2B companies.").
2. **Direct answer block** directly under the hero: a question as an H2 ("What is technical SEO?")
   and a self-contained 50–70 word answer that makes sense when quoted on its own.
3. **Who it is for**: four buyer types (manufacturers, exporters, B2B services, growing companies).
4. **What is included**: concrete deliverables.
5. **How it works**: a numbered process.
6. **Cost section**: phrased as the question buyers ask ("How much does B2B website development
   cost?"), with the factors that drive the price. No invented prices.
7. **FAQs**: 4–5 questions, each a real buyer question; the question is an H3 inside the
   expandable item, the answer is in the HTML (crawlable even when collapsed).
8. **Sources**: links to official sources for any factual claim (FTC, ICO, Government of Canada, ACMA,
   Google).
9. **Related services**: internal links to the neighbouring topics.

### B. Question clusters covered

| Question (from the brief) | Where it is answered |
| --- | --- |
| How much does professional website development cost? | /website-development.html → "How much does B2B website development cost?" (cost factors; fixed fee in writing) |
| How does technical SEO improve organic visibility? | /technical-seo.html FAQ |
| What is AI business automation? | /ai-automation.html direct answer |
| How can manufacturers generate international B2B leads? | /b2b-lead-generation.html FAQ |
| How long does SEO take? | /technical-seo.html FAQ |
| What should businesses look for in an SEO agency? | /technical-seo.html FAQ |
| How can companies automate their lead generation? | /ai-automation.html FAQ |
| Additional: Is cold email legal in the US, UK, Canada, Australia and the UAE? | /b2b-lead-generation.html FAQ, with official sources |
| Additional: Should we have a separate website for each country? | /international.html |

### C. Answer extraction

- Concise opening answers (the direct-answer block).
- Descriptive headings phrased as the question or the topic.
- Clear definitions in the first sentence ("Technical SEO is the work that lets…").
- Numbered processes (ordered lists).
- Checklists for cost factors.
- FAQPage structured data that mirrors the visible questions word for word (checked automatically by
  `tools/validate_schema.py`).
- No keyword stuffing: each answer was written for a buyer first.

### D. Facts and sources policy

Only verifiable facts are stated. During this work, one planned claim was **removed**: the often-quoted
"Google says SEO takes four months to a year" could not be found on Google's current "Do you need an
SEO?" page (it comes from a 2017 video), so the answer now states the timeline in plain terms without
attributing it. Legal summaries are labelled "general information, not legal advice".

## What answer engines need that only the owner can provide

| Signal | Status | Action |
| --- | --- | --- |
| Real case studies with numbers (with client permission) | Missing (placeholders) | Add in the admin panel → Work; one well-documented project is worth more than six placeholders |
| Named authors with real expertise (Person data) | Missing (founder names are placeholders) | Add founder names, photos and short bios in About; then Person schema can be added |
| Consistent business details across the web | Partial | See geo-strategy.md (LinkedIn page, directories) |
| Original data or research | None yet | One small original study per quarter (content-strategy-90-days.md) |

## How to check answer-engine visibility (monthly)

1. Ask each engine the question-cluster questions above with and without "WeberAct" and log whether
   WeberAct is mentioned or cited (a Google Sheet; the n8n workflow in automation-architecture.md
   can schedule this where the engine offers an API).
2. In Search Console, filter queries starting with "what", "how", "why", "is" to see which questions
   bring impressions.
3. In Bing Webmaster Tools, check the Copilot/AI performance reports where available.
