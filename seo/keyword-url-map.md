# Keyword-to-URL map

One primary topic per URL, so pages never compete with each other (keyword cannibalisation). Volumes
are US, verified (see keyword-research.md); "n/v" means not verified.

| URL | Primary keyword | Secondary keywords | Intent | Funnel stage | Do NOT target here |
| --- | --- | --- | --- | --- | --- |
| / | WeberAct (brand) | b2b website, technical seo, ai automation, b2b lead generation (as a summary of services) | Navigational / commercial | All | Any single service term in the title; the service pages own those |
| /services.html | b2b website, seo, automation and lead generation services | services overview, fixed fee agency | Commercial | Consideration | Individual service head terms (owned by the four service pages) |
| /website-development.html | website development company (3,600) | b2b website design (320), website design for manufacturers (390), manufacturing website design (390), website redesign services (5,400), custom website development (880), b2b web design agency (390), industrial website design (170), enterprise website development (170), website development cost (480) | Commercial | Consideration → decision | SEO terms; "how much does a website cost" as a head term (planned guide) |
| /technical-seo.html | technical seo services (1,900) | technical seo agency (1,900), seo audit services (1,600), b2b seo agency (1,000), b2b seo services (390), seo for manufacturers (320), manufacturing seo (320), industrial seo (320), international seo agency (590), how long does seo take (170, FAQ) | Commercial | Consideration → decision | Country-specific SEO terms (international page) |
| /ai-automation.html | ai business automation (260) | ai workflow automation (1,000), business process automation services (210), crm automation (590), sales automation (480), workflow automation services (140), what is ai automation (1,300, direct answer), n8n automation agency (110), lead qualification automation (10) | Commercial | Consideration | Lead generation head terms (lead generation page) |
| /b2b-lead-generation.html | b2b lead generation (1,600) | b2b lead generation agency (480), b2b lead generation services (390), lead generation for manufacturers (110), outbound lead generation (260), cold email agency (880), automated lead generation (170), international b2b lead generation (10), export lead generation (10) | Commercial | Consideration → decision | "how to generate b2b leads" as a head term (planned guide) |
| /international.html | working with international clients (brand + market) | US, UK, UAE, Canada, Australia client questions; separate country website question | Informational / commercial | Consideration | City or country "agency in X" terms (no local presence) |
| /work.html | WeberAct work, b2b website projects | case studies (when real ones exist) | Commercial | Decision | — |
| /method.html | WeberAct method: analyse, create, track | project process | Informational | Consideration | — |
| /about.html | about WeberAct | team, studio | Navigational | Decision | — |
| /proposal.html | request a proposal | contact, consultation | Transactional | Decision | — |
| /terms.html, /privacy.html | brand legal | — | Navigational | — | — |

## Planned URLs (from the content plan; not yet published)

| Planned URL | Primary keyword | Why a separate page |
| --- | --- | --- |
| /guides/website-cost.html | how much does a website cost (1,900) | Informational intent; the service page answers it briefly, a guide can go deep |
| /guides/manufacturing-website-design.html | manufacturing website design (390) / website design for manufacturers (390) | SERP is dominated by "examples" articles (informational); a guide fits the intent better than the service page |
| /guides/seo-for-manufacturers.html | seo for manufacturers (320, informational) | Separate informational intent from "manufacturing seo" service searches |
| /guides/how-to-generate-b2b-leads.html | how to generate b2b leads (110) | Informational |
| /guides/find-international-buyers.html | how to find international buyers (10, US) | Small in the US; measure other markets before investing |
| /guides/choose-an-seo-agency.html | how to choose an seo agency (90) | Answer-engine friendly checklist |

Rule: before creating a planned page, search the site for the keyword (`grep -ri "keyword" weberact/*.html`)
and check Search Console for which URL already gets impressions for it. If an existing page ranks,
improve that page instead of creating a new one.
