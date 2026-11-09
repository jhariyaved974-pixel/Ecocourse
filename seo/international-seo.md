# International SEO architecture

Target markets: United States, United Kingdom, United Arab Emirates, Canada, Australia.

## Decision: one English site, no hreflang (for now)

| Option | Verdict | Reason |
| --- | --- | --- |
| One English site, one URL per topic, plus one honest "international clients" page | **Chosen** | WeberAct offers the same services in all five markets, in English, delivered remotely. Duplicating pages per country would create near-identical content (doorway pages), which Google's spam policies warn against. |
| Country folders (/us/, /uk/, /ae/, /ca/, /au/) with hreflang | Not now | Justified only when content genuinely differs by country: prices, regulations, language or local proof. None of these differ yet. |
| Country-code domains | No | Five domains to build authority for, with no local presence to support them. |

**hreflang**: not implemented, deliberately. hreflang helps Google choose between *alternate versions* of
the same page for different languages or regions. WeberAct has one version of each page, so there is
nothing to annotate. An `x-default` is only meaningful when alternates exist.

**Canonical consistency**: every page has a self-referencing canonical on https://weberact.co/, the
same URL appears in the sitemap, Open Graph and structured data. (This depends on registering
weberact.co; see technical-audit.md issue 1.)

## What is localised now

The international page (`/international.html`) gives genuinely useful country information instead of
copies of the same page:

| Market | What the page tells buyers |
| --- | --- |
| United States | US spelling and imperial units where buyers use them; CAN-SPAM for business email; state privacy laws such as California's |
| United Kingdom | UK spelling; UK GDPR and PECR; consent before analytics or marketing cookies |
| United Arab Emirates | Clear English for international and local buyers; the UAE's federal data protection law; DIFC and ADGM free-zone rules |
| Canada | Canadian spelling; CASL (consent for commercial email); PIPEDA |
| Australia | Australian spelling; Spam Act 2003 (consent); Privacy Act 1988 |

It also answers the questions international buyers ask (offices, currency, time zones, separate
country sites) and states plainly that WeberAct has **no offices** in these countries.

The B2B lead generation page explains the email rules for each market, with links to the official
sources (FTC, ICO, Government of Canada, ACMA).

## Country-specific conversion messaging

| Market | Message emphasis (already in copy or recommended) |
| --- | --- |
| All | Fixed fee in US dollars or local currency; written scope; reply within one working day; accounts in the client's name |
| UK, Canada, Australia | Compliance-first outreach and consent-based analytics (already implemented: GA4 loads only after consent) |
| UAE | English-first sites for international buyers; free-zone data rules mentioned |
| US | Speed and conversion focus; CAN-SPAM-compliant outreach |

## When to add country pages (decision rule)

Create a country page or folder only when at least two of these are true for that country:

1. Products, prices or delivery terms differ.
2. Regulations, certifications or standards that buyers must see differ.
3. A different language or units matter to buyers.
4. There is real local proof: projects, clients or partners in that country.
5. Search Console shows meaningful impressions from that country for queries the site cannot answer well.

When a country page is created, add hreflang between it and the general page, with `x-default`
pointing to the general page, and localise title, description, examples and currency.

## Measuring by country (after launch)

- Search Console → Performance → Countries: clicks, impressions and position by country.
- GA4 (after consent): sessions and `generate_lead` events by country.
- The enquiry dashboard records the visitor's referrer and landing page; budget currency (USD/INR) is
  captured in each enquiry.
