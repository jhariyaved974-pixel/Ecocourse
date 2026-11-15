# Structured data (JSON-LD)

Built by `tools/seo_schema.py` at every build, from `weberact/content.json`, so edits in the admin
panel update the structured data automatically. One `<script type="application/ld+json">` with an
`@graph` per page.

## Entities and their @id

| @id | Type | On which pages | Key properties |
| --- | --- | --- | --- |
| https://weberact.co/#organization | Organization | Every page | name, url, logo (→ #logo), slogan, description, areaServed (5 countries), knowsAbout, hasOfferCatalog (the 4 services). Added automatically when real values exist: email, telephone, contactPoint, legalName, sameAs |
| https://weberact.co/#logo | ImageObject | Every page | 512x512 PNG |
| https://weberact.co/#website | WebSite | Every page | name, url, publisher → organization, inLanguage en |
| PAGE#webpage | WebPage / AboutPage / ContactPage (+ FAQPage) | Every page | url (= canonical), name (= title), description, isPartOf → website, breadcrumb, about, primaryImageOfPage |
| PAGE#breadcrumb | BreadcrumbList | Every page except home | Home → (Services →) page |
| PAGE#service | Service | The 4 service pages | name, serviceType, description (the direct answer), provider → organization, areaServed, audience (BusinessAudience) |
| — | Question / Answer | Pages with visible FAQs (services + 5 dedicated pages) | name, acceptedAnswer.text, identical to the visible text |

## Choices and why

- **Organization, not LocalBusiness or ProfessionalService.** ProfessionalService is a LocalBusiness
  subtype, which implies premises that customers can visit. WeberAct works remotely with no offices
  in its markets.
- **FAQPage only where the FAQ is visible.** Since August 2023 Google shows FAQ rich results only for
  well-known government and health sites ([Google Search Central blog](https://developers.google.com/search/blog/2023/08/howto-faq-changes)),
  so no rich result is expected. The markup is kept because it is valid, accurate and helps machines
  pair questions with answers.
- **No Review, AggregateRating, Offer prices, Person or Article.** None are verified yet. Adding them
  would be misleading. Person and Article will be added when founders' details and authored guides exist.
- **Placeholders never become data.** Any value like "[EMAIL]" or "[WeberAct legal name]" is
  skipped.

## Validation (9 November 2026)

| Check | Result |
| --- | --- |
| `python3 tools/validate_schema.py weberact` (JSON parses, references resolve, no duplicate @id, required properties present, URLs on https://weberact.co/, breadcrumb positions 1..n, FAQ text visible on the page, WebPage url equals canonical) | 13 pages, **no problems** |
| Schema.org validator (validator.schema.org), all 13 pages | **0 errors, 0 warnings** |
| Google Rich Results Test | Not run: it has no public API. Run it manually on https://weberact.co/website-development.html and the home page after the domain is live |

During validation, one real defect was found and fixed: the organisation's service catalogue pointed
to service entities defined only on other pages (dangling references); each catalogue item now
carries its own name, URL, description and provider.

## How to change it

- Wording: edit content in the admin panel (Service pages, Brand, Contact details); the next build
  regenerates the JSON-LD.
- Structure: edit `tools/seo_schema.py`, then run the validator before committing.
