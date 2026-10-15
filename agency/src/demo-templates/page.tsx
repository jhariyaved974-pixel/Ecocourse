import { ArrowRight, Briefcase, Check, Footprints, GraduationCap, Home, MessageCircle, Shirt, Sparkles, Sprout, Store, Utensils, type LucideIcon } from "lucide-react";
import type { DemoConfig, SectionType } from "../server/demo/schema";

/**
 * Approved demo page template. Renders ONLY data from a validated DemoConfig; every string goes through
 * React's escaping. There is no dangerouslySetInnerHTML and no AI-controlled markup, script or URL.
 */

const ICONS: Record<DemoConfig["icon"], LucideIcon> = {
  utensils: Utensils,
  shirt: Shirt,
  footprints: Footprints,
  graduation: GraduationCap,
  home: Home,
  briefcase: Briefcase,
  sprout: Sprout,
  store: Store,
};

const UI = {
  en: {
    demo: "Demo concept",
    ribbon: "Website concept preview — not a live website. Sample content is illustrative.",
    menu: "Menu",
    nav: { about: "About", offerings: "Offerings", highlights: "Why us", process: "How it works", gallery: "Gallery", faq: "FAQ", contact: "Contact" },
    sample: "Sample",
    photo: "Your photo here",
    name: "Your name",
    phone: "Phone or WhatsApp",
    message: "How can we help?",
    send: "Send enquiry",
    formNote: "Demo form — nothing is sent from this preview.",
    footer: "Concept preview prepared for",
    disclosure: "This page is a design concept. Products, services and text are placeholders until confirmed by the business. Anonymous view counts are recorded for this preview.",
    faq: "Questions",
    step: "Step",
  },
  hi: {
    demo: "डेमो कॉन्सेप्ट",
    ribbon: "वेबसाइट कॉन्सेप्ट प्रीव्यू — यह लाइव वेबसाइट नहीं है। सामग्री केवल उदाहरण है।",
    menu: "मेन्यू",
    nav: { about: "परिचय", offerings: "सेवाएँ", highlights: "क्यों हम", process: "प्रक्रिया", gallery: "गैलरी", faq: "प्रश्न", contact: "संपर्क" },
    sample: "उदाहरण",
    photo: "आपकी फ़ोटो यहाँ",
    name: "आपका नाम",
    phone: "फ़ोन या व्हाट्सऐप",
    message: "हम कैसे मदद करें?",
    send: "पूछताछ भेजें",
    formNote: "डेमो फ़ॉर्म — इस प्रीव्यू से कुछ नहीं भेजा जाता।",
    footer: "कॉन्सेप्ट प्रीव्यू तैयार किया गया:",
    disclosure: "यह पेज एक डिज़ाइन कॉन्सेप्ट है। उत्पाद, सेवाएँ और टेक्स्ट व्यवसाय द्वारा पुष्टि होने तक उदाहरण हैं। इस प्रीव्यू के लिए गुमनाम व्यू गिने जाते हैं।",
    faq: "प्रश्न",
    step: "चरण",
  },
} as const;

type Props = { config: DemoConfig; studioName: string; fontsHref: string; logoFile: string | null; modelFile: string | null };

export function DemoPage({ config, studioName, fontsHref, logoFile, modelFile }: Props) {
  const t = config.language === "hi" ? UI.hi : UI.en;
  const c = config.content;
  const Icon = ICONS[config.icon];
  const navSections = config.sections.filter((s): s is Exclude<SectionType, "hero"> => s !== "hero" && s !== "contact" && s in t.nav);
  const initials = config.businessName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const sceneData = JSON.stringify({ mode: config.three, palette: config.palette, model: modelFile ? `${config.assetBase}${modelFile}` : null });

  return (
    <html lang={config.language === "hi" ? "hi" : "en"} className={`family-${config.family}`}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="referrer" content="no-referrer" />
        <title>{`${config.businessName} — ${t.demo}`}</title>
        <meta name="description" content={c.heroSubheadline} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={fontsHref} />
        <link rel="stylesheet" href={`${config.assetBase}site.css`} />
        <script src={`${config.assetBase}boot.js`} />
        <script type="module" src={`${config.assetBase}runtime.js`} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="demo-ribbon" role="note" data-demo-label="true">
          <span className="demo-pill">
            <Sparkles aria-hidden="true" size={14} /> {t.demo}
          </span>
          <span className="demo-ribbon-text">{t.ribbon}</span>
        </div>

        <header className="site-header">
          <div className="wrap header-inner">
            <a className="brand" href="#top" aria-label={config.businessName}>
              {logoFile ? <img src={`${config.assetBase}${logoFile}`} alt="" width={40} height={40} className="brand-logo" /> : <span className="brand-mark" aria-hidden="true">{initials}</span>}
              <span className="brand-name">{config.businessName}</span>
            </a>
            <nav className="nav-desktop" aria-label="Main">
              {navSections.map((s) => (
                <a key={s} href={`#${s}`}>
                  {t.nav[s]}
                </a>
              ))}
              <a className="btn btn-primary btn-sm" href="#contact">
                {c.primaryCta}
              </a>
            </nav>
            <details className="nav-mobile">
              <summary>{t.menu}</summary>
              <nav aria-label="Mobile">
                {navSections.map((s) => (
                  <a key={s} href={`#${s}`}>
                    {t.nav[s]}
                  </a>
                ))}
                <a href="#contact">{t.nav.contact}</a>
              </nav>
            </details>
          </div>
        </header>

        <main id="main">
          <section id="top" className={`hero hero--${config.heroStyle}`} aria-labelledby="hero-title">
            <div className="hero-bg" aria-hidden="true">
              <span className="blob blob-a" data-depth="0.2" />
              <span className="blob blob-b" data-depth="0.35" />
              <span className="grain" />
            </div>
            <div className="wrap hero-inner">
              <div className="hero-copy">
                <p className="eyebrow" data-hero-item>
                  {c.tagline}
                </p>
                <h1 id="hero-title" className="hero-title" data-split>
                  {c.heroHeadline}
                </h1>
                <p className="hero-sub" data-hero-item>
                  {c.heroSubheadline}
                </p>
                <div className="hero-ctas" data-hero-item>
                  <a className="btn btn-primary" href="#contact">
                    <MessageCircle aria-hidden="true" size={18} /> {c.primaryCta}
                  </a>
                  <a className="btn btn-ghost" href={`#${navSections[0] ?? "contact"}`}>
                    {c.secondaryCta} <ArrowRight aria-hidden="true" size={18} />
                  </a>
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="stage3d" data-scene={sceneData} />
                <div className="fallback3d">
                  {c.offerings.slice(0, 3).map((o, i) => (
                    <div key={o.name} className={`float-card fc-${i}`} data-depth={String(0.15 + i * 0.12)}>
                      <span className="fc-icon">
                        <Icon size={22} />
                      </span>
                      <span className="fc-name">{o.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {config.family === "editorial" && (
              <div className="marquee" aria-hidden="true">
                <div className="marquee-track">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i}>
                      {c.tagline} <Sparkles size={16} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {config.sections.map((s) => {
            switch (s) {
              case "about":
                return (
                  <section key={s} id="about" className="section about">
                    <div className="wrap about-grid">
                      <div data-reveal>
                        <p className="eyebrow">{t.nav.about}</p>
                        <h2 className="section-title">{c.aboutTitle}</h2>
                      </div>
                      <p className="lead" data-reveal>
                        {c.aboutBody}
                      </p>
                    </div>
                  </section>
                );
              case "offerings":
                return (
                  <section key={s} id="offerings" className="section offerings">
                    <div className="wrap">
                      <div className="section-head" data-reveal>
                        <p className="eyebrow">{t.nav.offerings}</p>
                        <h2 className="section-title">{c.offeringsTitle}</h2>
                        <p className="section-intro">{c.offeringsIntro}</p>
                      </div>
                      <ul className="card-grid" role="list">
                        {c.offerings.map((o, i) => (
                          <li key={o.name} className="card tilt" data-reveal>
                            <div className="card-art" aria-hidden="true">
                              <span className="card-index">{String(i + 1).padStart(2, "0")}</span>
                              <Icon size={34} />
                            </div>
                            <div className="card-body">
                              <div className="card-tags">
                                <span className="tag tag-sample">{t.sample}</span>
                                {o.tag && <span className="tag">{o.tag}</span>}
                              </div>
                              <h3 className="card-title">{o.name}</h3>
                              <p className="card-text">{o.description}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                );
              case "highlights":
                return (
                  <section key={s} id="highlights" className="section highlights">
                    <div className="wrap">
                      <div className="section-head" data-reveal>
                        <p className="eyebrow">{t.nav.highlights}</p>
                        <h2 className="section-title">{c.highlightsTitle}</h2>
                      </div>
                      <ul className="highlight-grid" role="list">
                        {c.highlights.map((h) => (
                          <li key={h.title} className="highlight" data-reveal>
                            <span className="highlight-icon" aria-hidden="true">
                              <Check size={20} />
                            </span>
                            <h3>{h.title}</h3>
                            <p>{h.body}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                );
              case "process":
                return (
                  <section key={s} id="process" className="section process">
                    <div className="wrap">
                      <div className="section-head" data-reveal>
                        <p className="eyebrow">{t.nav.process}</p>
                        <h2 className="section-title">{c.processTitle}</h2>
                      </div>
                      <ol className="steps">
                        {c.process.map((p, i) => (
                          <li key={p.title} className="step" data-reveal>
                            <span className="step-num" aria-hidden="true">
                              {i + 1}
                            </span>
                            <div>
                              <h3>
                                <span className="sr-only">{`${t.step} ${i + 1}: `}</span>
                                {p.title}
                              </h3>
                              <p>{p.body}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </section>
                );
              case "gallery":
                return (
                  <section key={s} id="gallery" className="section gallery" aria-label={t.nav.gallery}>
                    <div className="wrap">
                      <div className="gallery-grid">
                        {Array.from({ length: 5 }, (_, i) => (
                          <figure key={i} className={`tile tile-${i}`} data-reveal data-depth={String(0.05 * (i % 3))}>
                            <span className="tile-art" aria-hidden="true">
                              <Icon size={42} />
                            </span>
                            <figcaption>{t.photo}</figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              case "faq":
                return (
                  <section key={s} id="faq" className="section faq">
                    <div className="wrap faq-grid">
                      <div data-reveal>
                        <p className="eyebrow">{t.nav.faq}</p>
                        <h2 className="section-title">{t.faq}</h2>
                      </div>
                      <div className="faq-list">
                        {c.faq.map((f) => (
                          <details key={f.q} className="faq-item" data-reveal>
                            <summary>{f.q}</summary>
                            <p>{f.a}</p>
                          </details>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              case "contact":
                return (
                  <section key={s} id="contact" className="section contact">
                    <div className="wrap contact-grid">
                      <div data-reveal>
                        <p className="eyebrow">{t.nav.contact}</p>
                        <h2 className="section-title">{c.contactTitle}</h2>
                        <p className="lead">{c.contactBody}</p>
                      </div>
                      <form className="demo-form" action="#contact" method="get" data-demo-form data-reveal>
                        <label>
                          <span>{t.name}</span>
                          <input name="n" autoComplete="off" />
                        </label>
                        <label>
                          <span>{t.phone}</span>
                          <input name="p" inputMode="tel" autoComplete="off" />
                        </label>
                        <label>
                          <span>{t.message}</span>
                          <textarea name="m" rows={3} />
                        </label>
                        <button className="btn btn-primary" type="submit">
                          {t.send}
                        </button>
                        <p className="form-note" role="status">
                          {t.formNote}
                        </p>
                      </form>
                    </div>
                  </section>
                );
              default:
                return null;
            }
          })}
        </main>

        <footer className="site-footer">
          <div className="wrap footer-inner">
            <div>
              <p className="brand-name">{config.businessName}</p>
              <p className="footer-small">
                {t.footer} {config.businessName} · {studioName}
              </p>
            </div>
            <p className="footer-small disclosure" data-demo-label="true">
              <strong>{t.demo}.</strong> {t.disclosure}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
