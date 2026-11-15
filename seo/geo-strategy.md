# Generative Engine Optimisation (GEO): entity and brand consistency

Generative engines build their picture of a company from the company's own site, its structured data
and what other trustworthy sites say about it. The aim is that every source says the same, true thing
about WeberAct.

## The canonical WeberAct entity (as published in structured data)

| Field | Value | Where it is set |
| --- | --- | --- |
| Name | WeberAct | Fixed |
| Official website | https://weberact.co/ (once registered) | Build `--domain` |
| Tagline | Build. Automate. Accelerate. | Admin → Header, footer and contact → Brand |
| Description | WeberAct designs and builds premium websites, technical SEO, AI business automation and B2B lead generation systems for manufacturers, exporters and established B2B companies, with a fixed scope, a fixed fee and a launch date agreed in writing. | Admin → Brand |
| Services | Website development, Technical SEO, AI business automation, B2B lead generation (each with its own page and Service entity) | Admin → Service pages |
| Industries served | Manufacturers, exporters and importers, B2B and professional services, growing international businesses | Service pages ("Who it is for") |
| Countries served | United States, United Kingdom, United Arab Emirates, Canada, Australia | Admin → Brand → Countries served |
| Logo | https://weberact.co/assets/logo-512.png | tools/make_brand_images.mjs |
| Email, phone, social profiles | **Added automatically once filled in** in the admin panel (placeholders are never published as data) | Admin → Contact details, Social profiles |
| Legal name, address | Added to structured data once the legal placeholders are filled in (legal name only; the address is not published as structured data until it is a real, complete address) | Admin → Legal details |

Entity type: `Organization` (not LocalBusiness), because WeberAct has no public premises in its
markets. This avoids claiming a local presence.

## Consistency rules

1. Use the same name everywhere: "WeberAct" (capital W and A, one word).
2. Use the same one-line description (above) on LinkedIn, directory profiles and proposals.
3. Use the same four service names: Website development, Technical SEO, AI business automation,
   B2B lead generation.
4. Link every profile back to https://weberact.co/, and add every real profile URL to the admin panel
   (Social profiles), which publishes them as `sameAs` in structured data.
5. Never create profiles, reviews or mentions that are not real.

## Legitimate profiles to create or claim (owner action)

| Profile | Why | Priority |
| --- | --- | --- |
| LinkedIn company page | The most important B2B entity signal; also a distribution channel | 1 |
| Google Search Console + Bing Webmaster Tools | Ownership verification of the site (fields ready in the admin panel) | 1 |
| Clutch, GoodFirms, DesignRush agency listings | B2B buyers and generative engines read these; listings are free (paid placement is optional and should be disclosed) | 2 |
| Crunchbase organisation profile | Widely used as an entity source | 2 |
| Google Business Profile | **Only if** WeberAct has a staffed, eligible address; Google's guidelines do not allow virtual offices. Skip otherwise. | Conditional |
| X / Instagram | Only if they will be maintained | 3 |

## Authorship and expertise

- Founder names, photos and bios are placeholders on the About page. Once real, add Person structured
  data (name, jobTitle, worksFor → WeberAct, sameAs → their LinkedIn) and author articles with their names.
- Guides in the content plan should carry a named author and a "last reviewed" date.
- Evidence beats adjectives: real project results (with permission), certifications held, tools
  partnerships held. None should be stated until they exist.

## Monitoring

Quarterly: ask ChatGPT, Perplexity, Gemini and Copilot "What is WeberAct?" and "Who builds websites
and lead generation systems for manufacturers?" and record the answers. Correct inconsistencies at
the source (site copy, LinkedIn, directories), never by creating artificial mentions.
