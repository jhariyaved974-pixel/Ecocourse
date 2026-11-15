"""JSON-LD structured data for the WeberAct website, built from content.json.

One @graph per page, with stable @id references so every page describes the same entities:

  https://DOMAIN/#organization   Organization (WeberAct)   on every page
  https://DOMAIN/#website        WebSite                   on every page
  https://DOMAIN/#logo           ImageObject (logo)
  PAGE_URL#webpage               WebPage / AboutPage / ContactPage (+ FAQPage where the page shows FAQs)
  PAGE_URL#breadcrumb            BreadcrumbList            on every page except the home page
  PAGE_URL#service               Service                   on each dedicated service page

Rules followed:
  * Only facts that are visible on the site or set in the admin panel. Placeholders such as
    "[EMAIL]" or "[WeberAct legal name]" are left out, never published as data.
  * Organization, not LocalBusiness or ProfessionalService: WeberAct works remotely and has no public
    address or local offices in its markets, and LocalBusiness implies a physical location.
  * FAQPage only where the same questions and answers are visible on the page. Google shows FAQ rich
    results only for well-known government and health sites (August 2023), so this markup is for
    understanding and answer engines, not for a rich result.
  * No ratings, reviews, prices or people: none are verified yet.
"""
import json, re

PH = re.compile(r'^\s*\[.*\]\s*$')  # an unfilled placeholder such as [EMAIL]


def real(v):
    return isinstance(v, str) and v.strip() and not PH.match(v)


KNOWS = ['Website development', 'B2B website design', 'Website redesign', 'Technical SEO', 'International SEO',
         'Structured data', 'Core Web Vitals', 'AI business automation', 'Workflow automation', 'CRM automation',
         'B2B lead generation', 'Lead qualification']


def organization(base, c):
    st, legal = c.get('settings', {}), c.get('legal', {})
    org = {
        '@type': 'Organization', '@id': base + '#organization', 'name': 'WeberAct', 'url': base,
        'logo': {'@type': 'ImageObject', '@id': base + '#logo', 'url': base + 'assets/logo-512.png', 'contentUrl': base + 'assets/logo-512.png',
                 'width': 512, 'height': 512, 'caption': 'WeberAct'},
        'image': {'@id': base + '#logo'},
    }
    if real(st.get('tagline')): org['slogan'] = st['tagline']
    if real(st.get('org_description')): org['description'] = st['org_description']
    if real(legal.get('legal_name')): org['legalName'] = legal['legal_name']
    areas = [a for a in st.get('areas_served', []) if real(a)]
    if areas: org['areaServed'] = [{'@type': 'Country', 'name': a} for a in areas]
    org['knowsAbout'] = KNOWS
    contact = {}
    if real(st.get('email')) and '@' in st['email']:
        org['email'] = st['email'].strip(); contact['email'] = st['email'].strip()
    digits = re.sub(r'\D', '', st.get('whatsapp', '') or '')
    if len(digits) >= 8:
        org['telephone'] = '+' + digits; contact['telephone'] = '+' + digits
    if contact:
        org['contactPoint'] = [dict({'@type': 'ContactPoint', 'contactType': 'sales', 'availableLanguage': ['English']}, **contact,
                                    **({'areaServed': [a for a in areas]} if areas else {}))]
    same = [st[k].strip() for k in ('linkedin', 'instagram', 'x') if real(st.get(k)) and st[k].strip().startswith('https://')]
    if same: org['sameAs'] = same
    services = [(slug, p) for slug, p in c.get('pages', {}).items() if p.get('service_key')]
    if services:
        org['hasOfferCatalog'] = {'@type': 'OfferCatalog', 'name': 'WeberAct services', 'itemListElement': [
            {'@type': 'Offer', 'itemOffered': {'@type': 'Service', 'name': p['crumb'], 'url': f'{base}{slug}.html', 'provider': {'@id': base + '#organization'},
                                               'description': c.get('seo', {}).get(slug, {}).get('description') or p['answer']}} for slug, p in services]}
    return org


def website(base, c):
    w = {'@type': 'WebSite', '@id': base + '#website', 'url': base, 'name': 'WeberAct', 'publisher': {'@id': base + '#organization'}, 'inLanguage': 'en'}
    tag = c.get('settings', {}).get('tagline')
    if real(tag): w['description'] = tag
    return w


def faq(items):
    return [{'@type': 'Question', 'name': f['q'], 'acceptedAnswer': {'@type': 'Answer', 'text': f['a']}} for f in items if real(f.get('q')) and real(f.get('a'))]


PAGE_TYPE = {'about': 'AboutPage', 'proposal': 'ContactPage'}
CRUMB = {'services': 'Services', 'work': 'Work', 'method': 'Method', 'about': 'About', 'proposal': 'Request a proposal',
         'terms': 'Terms and Conditions', 'privacy': 'Privacy Policy'}


def graph(key, c, domain, og_image):
    """Structured data for one page. key is the file name without .html (index, services, website-development ...)."""
    base = f'https://{domain}/'
    url = base if key == 'index' else f'{base}{key}.html'
    seo = c.get('seo', {}).get(key, {})
    page = c.get('pages', {}).get(key)
    nodes = [organization(base, c), website(base, c)]

    wp = {'@type': PAGE_TYPE.get(key, 'WebPage'), '@id': url + '#webpage', 'url': url, 'name': seo.get('title', 'WeberAct'),
          'isPartOf': {'@id': base + '#website'}, 'inLanguage': 'en', 'primaryImageOfPage': {'@type': 'ImageObject', 'url': og_image}}
    if real(seo.get('description')): wp['description'] = seo['description']
    if key == 'index':
        wp['about'] = {'@id': base + '#organization'}

    questions = faq(page['faq']) if page else faq(c['services']['faq']) if key == 'services' else []
    if questions:
        wp['@type'] = [wp['@type'], 'FAQPage']
        wp['mainEntity'] = questions

    if key != 'index':
        trail = [('Home', base)]
        if page and page.get('service_key'):
            trail.append(('Services', base + 'services.html'))
        trail.append((page['crumb'] if page else CRUMB.get(key, key.title()), url))
        nodes.append({'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', 'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(trail)]})
        wp['breadcrumb'] = {'@id': url + '#breadcrumb'}

    if page and page.get('service_key'):
        areas = [a for a in c.get('settings', {}).get('areas_served', []) if real(a)]
        svc = {'@type': 'Service', '@id': url + '#service', 'name': page['crumb'], 'serviceType': page['crumb'], 'url': url,
               'description': page['answer'], 'provider': {'@id': base + '#organization'},
               'audience': {'@type': 'BusinessAudience', 'audienceType': ', '.join(w['title'] for w in page['who'])}}
        if areas: svc['areaServed'] = [{'@type': 'Country', 'name': a} for a in areas]
        nodes.append(svc)
        wp['about'] = {'@id': url + '#service'}
    elif page:
        wp['about'] = {'@id': base + '#organization'}

    nodes.insert(2, wp)
    data = {'@context': 'https://schema.org', '@graph': nodes}
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return f'<script type="application/ld+json">{text}</script>'
