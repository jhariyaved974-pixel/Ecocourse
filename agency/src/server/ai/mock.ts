import type { DemoContent } from "../demo/schema";
import { BUILT_IN_TEMPLATES, industryFromText, matchTemplate } from "../demo/templates";
import { detectKeywords, detectLanguage } from "../sales/keywords";
import type { AiProvider, AiResult, BriefContext, DemoContentContext, SalesContext } from "./provider";
import { LEAD_FIELDS, NO_SIGNALS, type BriefDraft, type LeadDetails, type LeadField, type SalesTurnOutput } from "./schemas";

/**
 * Deterministic, rule-based stand-in for Claude used in local development and automated tests.
 * It makes NO network calls; all usage it reports is marked `simulated: true` and costs $0.
 * Quality is intentionally basic — it exists to exercise the real pipeline end to end.
 */

const usage = (purpose: string) => ({ model: `mock:${purpose}`, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, simulated: true });

type Lang = "en" | "hi" | "hinglish";

/** Question order, with bilingual phrasings. */
const QUESTIONS: { field: LeadField; en: string; hinglish: string; hi: string }[] = [
  { field: "businessName", en: "First, what is your business name and what do you do?", hinglish: "Sabse pehle, aapke business ka naam kya hai aur aap kya kaam karte hain?", hi: "सबसे पहले, आपके बिज़नेस का नाम क्या है और आप क्या काम करते हैं?" },
  { field: "industry", en: "What kind of business is it — for example a café, clothing store, coaching centre or a service business?", hinglish: "Aapka business kis type ka hai — jaise café, clothing store, coaching ya koi service?", hi: "आपका बिज़नेस किस प्रकार का है — जैसे कैफ़े, कपड़ों की दुकान, कोचिंग या कोई सेवा?" },
  { field: "location", en: "Where is your business located?", hinglish: "Aapka business kahan located hai?", hi: "आपका बिज़नेस कहाँ स्थित है?" },
  { field: "goal", en: "What would you most like your website to achieve — more enquiries, online sales, bookings, or showcasing your services?", hinglish: "Website se aapko sabse zyada kya chahiye — zyada enquiries, online sales, bookings ya apni services dikhana?", hi: "वेबसाइट से आप सबसे ज़्यादा क्या चाहते हैं — ज़्यादा पूछताछ, ऑनलाइन बिक्री, बुकिंग या अपनी सेवाएँ दिखाना?" },
  { field: "services", en: "Which main products or services should the website feature?", hinglish: "Website par kaun se main products ya services dikhane hain?", hi: "वेबसाइट पर कौन से मुख्य उत्पाद या सेवाएँ दिखानी हैं?" },
  { field: "currentWebsite", en: "Do you have a current website or Instagram page? (It's fine if not.)", hinglish: "Kya aapki abhi koi website ya Instagram page hai? (Nahi hai to bhi theek hai.)", hi: "क्या आपकी अभी कोई वेबसाइट या इंस्टाग्राम पेज है? (नहीं है तो भी ठीक है।)" },
  { field: "style", en: "Any preferred style or colours — for example modern and bold, elegant, or minimal?", hinglish: "Koi pasand ka style ya colours — jaise modern/bold, elegant ya minimal?", hi: "कोई पसंदीदा स्टाइल या रंग — जैसे मॉडर्न, एलिगेंट या मिनिमल?" },
  { field: "pages", en: "Which pages or features do you need — e.g. Home, Products, Gallery, Contact, WhatsApp button?", hinglish: "Kaun se pages ya features chahiye — jaise Home, Products, Gallery, Contact, WhatsApp button?", hi: "कौन से पेज या फ़ीचर चाहिए — जैसे होम, प्रोडक्ट्स, गैलरी, संपर्क, व्हाट्सऐप बटन?" },
  { field: "assets", en: "Do you have a logo, photos or product videos we can use?", hinglish: "Kya aapke paas logo, photos ya product videos hain jo hum use kar sakein?", hi: "क्या आपके पास लोगो, फ़ोटो या प्रोडक्ट वीडियो हैं जिन्हें हम इस्तेमाल कर सकें?" },
  { field: "needsAdminPanel", en: "Would you like an admin panel to update products or content yourself?", hinglish: "Kya aapko admin panel chahiye jisse aap khud products ya content update kar sakein?", hi: "क्या आपको एडमिन पैनल चाहिए जिससे आप खुद कंटेंट अपडेट कर सकें?" },
  { field: "launchDate", en: "Roughly when would you like to launch, and do you have a budget in mind?", hinglish: "Aap website kab tak launch karna chahte hain, aur budget kitna socha hai?", hi: "आप वेबसाइट कब तक लॉन्च करना चाहते हैं, और बजट कितना सोचा है?" },
];

const INTRO: Record<Lang, (studio: string) => string> = {
  en: (s) => `Hi! 👋 Thanks for contacting ${s} about your website. I'm the studio's AI website consultant — an automated assistant. I can help you explore a website concept for your business.`,
  hinglish: (s) => `Namaste! 👋 ${s} se website ke baare mein contact karne ke liye dhanyavaad. Main studio ka AI website consultant hoon — ek automated assistant. Main aapke business ke liye website concept banane mein madad kar sakta hoon.`,
  hi: (s) => `नमस्ते! 👋 ${s} से वेबसाइट के बारे में संपर्क करने के लिए धन्यवाद। मैं स्टूडियो का AI वेबसाइट कंसल्टेंट हूँ — एक ऑटोमेटेड असिस्टेंट।`,
};

const ACK: Record<Lang, string> = { en: "Great, thanks!", hinglish: "Bahut badhiya, dhanyavaad!", hi: "बहुत बढ़िया, धन्यवाद!" };
const HANDOFF: Record<Lang, string> = {
  en: "Thanks — I've passed this to our team, and a person will reply to you here shortly.",
  hinglish: "Dhanyavaad — maine yeh hamari team ko bhej diya hai, jaldi hi koi aapko yahin reply karega.",
  hi: "धन्यवाद — मैंने यह हमारी टीम को भेज दिया है, जल्द ही कोई आपको यहीं जवाब देगा।",
};

function parseAnswer(field: LeadField, answer: string, known: LeadDetails): Partial<LeadDetails> {
  const a = answer.trim().slice(0, 400);
  const out: Partial<LeadDetails> = {};
  const email = a.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  if (email) out.email = email;
  const url = a.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|in|co\.in|net|org|shop|store|site)(?:\/\S*)?/i)?.[0];
  if (url && !email) out.currentWebsite = url;
  const industry = industryFromText(a);

  switch (field) {
    case "businessName": {
      // "We are Green Leaf, a café in Pune" / "Green Leaf - organic spices exporter"
      const cleaned = a.replace(/^(hi|hello|hey|namaste)[,!.\s]*/i, "").replace(/^(we are|we're|i am|i'm|this is|my business is|our business is|business name is|it's|mera business|hamara business)\s+/i, "");
      const [name, ...rest] = cleaned.split(/\s*(?:,|—|–|-|\.|\band\b|\bwe\b|\bhum\b)\s*/i).filter(Boolean);
      if (name) out.businessName = name.replace(/^(called|named)\s+/i, "").slice(0, 120);
      if (rest.length) out.services = rest.join(", ").slice(0, 400);
      if (industry) out.industry = industry;
      break;
    }
    case "industry":
      out.industry = industry ?? a.slice(0, 120);
      break;
    case "needsAdminPanel":
      out.needsAdminPanel = /\b(yes|yeah|haan|ha|han|ji|sure|chahiye|need|want)\b/i.test(a) && !/\b(no|nahi|nahin|not)\b/i.test(a);
      break;
    case "pages":
      out.pages = a.split(/,|\band\b|\//i).map((x) => x.trim()).filter((x) => x.length > 1 && x.length < 60).slice(0, 10);
      break;
    case "style":
      out.style = a;
      if (/(red|blue|green|black|white|gold|pink|purple|orange|yellow|brown|grey|gray|maroon|navy|teal)/i.test(a)) out.colors = a;
      break;
    case "launchDate":
      out.launchDate = a;
      if (/₹|rs\.?|rupees|budget|\d{3,}/i.test(a)) out.budget = a;
      break;
    case "currentWebsite":
      if (!url && /\b(no|nahi|nahin|none|not yet)\b/i.test(a)) break;
      out.currentWebsite = url ?? a;
      break;
    default:
      (out as Record<string, unknown>)[field] = a;
  }
  if (industry && !known.industry) out.industry = industry;
  return out;
}

export class MockAiProvider implements AiProvider {
  readonly name = "mock" as const;

  async salesTurn(ctx: SalesContext): Promise<AiResult<SalesTurnOutput>> {
    const latest = [...ctx.history].reverse().find((t) => t.role === "customer")?.text ?? "";
    const lang = detectLanguage(latest);
    const kw = detectKeywords(latest);
    const lastAsked = lastAskedField(ctx);
    const extractedPartial = lastAsked && !ctx.isFirstReply ? parseAnswer(lastAsked, latest, ctx.collected) : ctx.isFirstReply ? parseFirstMessage(latest, ctx.collected) : {};
    const known: LeadDetails = { ...ctx.collected, ...extractedPartial };

    const signals = {
      ...NO_SIGNALS,
      wantsHuman: kw.wantsHuman,
      readyToPay: kw.readyToPay,
      paymentIssue: kw.paymentIssue,
      complaint: kw.complaint,
      discountRequest: kw.discountRequest,
      optOut: kw.optOut,
      wantsDemo: kw.wantsDemo,
      confirmsBrief: ctx.state === "CONFIRMING_BRIEF" && kw.affirmative,
      buyingIntent: kw.readyToPay,
      consentsToFollowUp: ctx.state === "CONFIRMING_BRIEF" && kw.affirmative,
      requestsChanges: ctx.state === "DEMO_DELIVERED" && /\b(change|modify|different|instead|badlo|badal)\b/i.test(latest),
    };
    const needsHuman = signals.wantsHuman || signals.readyToPay || signals.paymentIssue || signals.complaint || signals.discountRequest;

    let reply: string;
    let askedField: LeadField | null = null;
    if (needsHuman) {
      reply = HANDOFF[lang];
    } else {
      const next = QUESTIONS.find((q) => known[q.field] === undefined && (ctx.askedCounts[q.field] ?? 0) < 2 && !(q.field === "industry" && known.services) && !(q.field === "services" && known.industry && known.services));
      askedField = next?.field ?? null;
      const question = next ? next[lang] : lang === "en" ? "Thanks — I have what I need for a first concept." : "Dhanyavaad — concept ke liye zaroori jaankari mil gayi hai.";
      reply = ctx.isFirstReply ? `${INTRO[lang](ctx.businessName)} ${question}` : `${ACK[lang]} ${question}`;
    }

    const extracted = Object.fromEntries(LEAD_FIELDS.map((f) => [f, (known as Record<string, unknown>)[f] ?? null])) as SalesTurnOutput["extracted"];
    return {
      output: { reply, language: lang, extracted, askedField, signals, handoffSummary: needsHuman ? `Customer message needs a person: "${latest.slice(0, 140)}"` : null },
      usage: usage("sales_turn"),
    };
  }

  async draftBrief(ctx: BriefContext): Promise<AiResult<BriefDraft>> {
    const c = ctx.collected;
    const tpl = matchTemplate(`${c.industry ?? ""} ${c.services ?? ""}`, BUILT_IN_TEMPLATES);
    const missing: string[] = [];
    if (!c.location) missing.push("Business location");
    if (!c.assets) missing.push("Logo and photos");
    if (!c.goal) missing.push("Main goal of the website");
    if (!c.colors) missing.push("Brand colours");
    const lang = (ctx.language === "hi" || ctx.language === "hinglish" ? ctx.language : "en") as Lang;
    return {
      output: {
        industry: c.industry ?? tpl.industries[0]!,
        description: [c.businessName, c.services ? `offers ${c.services}` : `is a ${c.industry ?? "local business"}`, c.location ? `in ${c.location}` : ""].filter(Boolean).join(" "),
        targetAudience: c.location ? `Customers in and around ${c.location}` : "Local customers looking for this kind of business",
        brandColors: [],
        colorNotes: c.colors ?? "Use the template's default palette",
        style: c.style ?? "Modern, premium and clean",
        pages: c.pages?.length ? c.pages : ["Home", "About", "Products / Services", "Contact"],
        features: c.features ?? ["WhatsApp enquiry button", "Mobile-friendly layout"],
        suppliedAssets: c.assets ? [c.assets] : [],
        animations: ["Cinematic hero entrance", "Scroll reveals", "Floating 3D cards"],
        language: lang,
        budgetRange: c.budget ?? null,
        timeline: c.launchDate ?? null,
        missingInformation: missing,
      },
      usage: usage("brief"),
    };
  }

  async demoContent(ctx: DemoContentContext): Promise<AiResult<DemoContent>> {
    const name = ctx.businessName;
    const offerings = ctx.sampleOfferings.slice(0, 4).map((o, i) => ({ name: o.name, description: o.description, tag: i === 0 ? "Popular" : null }));
    return {
      output: {
        tagline: `${ctx.industry}, done beautifully`.slice(0, 60),
        heroHeadline: `${name}, crafted for the people you serve`.slice(0, 90),
        heroSubheadline: `A website concept for ${name} — a clear, modern home for your ${ctx.industry.toLowerCase()} business that turns visitors into enquiries.`.slice(0, 220),
        primaryCta: "Enquire on WhatsApp",
        secondaryCta: "Explore",
        aboutTitle: `About ${name}`.slice(0, 80),
        aboutBody: `${ctx.description}. This section will tell your story in your own words once you share it with us.`.slice(0, 700),
        offeringsTitle: "What we offer",
        offeringsIntro: "Sample items shown for this concept — we'll replace them with your real products and services.",
        offerings,
        highlightsTitle: `Why customers choose ${name}`.slice(0, 80),
        highlights: [
          { title: "Thoughtful quality", body: "Care in every detail, from first enquiry to final delivery." },
          { title: "Easy to reach", body: "Quick answers on WhatsApp, phone or the enquiry form." },
          { title: "Made for you", body: "Options that fit what you actually need." },
        ],
        processTitle: "How it works",
        process: [
          { title: "Get in touch", body: "Send us a message with what you're looking for." },
          { title: "We suggest options", body: "We share the best fit and answer your questions." },
          { title: "Enjoy the result", body: "We take care of the rest, start to finish." },
        ],
        faq: [
          { q: "How do I place an enquiry?", a: "Tap the WhatsApp button or use the enquiry form and we'll get back to you." },
          { q: "Where are you located?", a: "Location details will appear here once confirmed." },
        ],
        contactTitle: "Let's talk",
        contactBody: "This is a demo form for the concept — on your live site it will send enquiries straight to you.",
      },
      usage: usage("demo_content"),
    };
  }
}

function lastAskedField(ctx: SalesContext): LeadField | null {
  // The most recent assistant turn's question maps to the field asked most recently.
  const entries = Object.entries(ctx.askedCounts) as [LeadField, number][];
  if (!entries.length) return null;
  const lastAssistant = [...ctx.history].reverse().find((t) => t.role === "assistant")?.text ?? "";
  const match = QUESTIONS.find((q) => lastAssistant.includes(q.en) || lastAssistant.includes(q.hinglish) || lastAssistant.includes(q.hi));
  return match?.field ?? null;
}

function parseFirstMessage(text: string, known: LeadDetails): Partial<LeadDetails> {
  // The first message from a click-to-WhatsApp ad is usually a greeting or a prefilled line; only parse
  // it when it clearly contains business details.
  if (/\b(we are|we're|my business|our business|i run|i own|hamara|mera)\b/i.test(text)) return parseAnswer("businessName", text, known);
  const industry = industryFromText(text);
  return industry ? { industry } : {};
}
