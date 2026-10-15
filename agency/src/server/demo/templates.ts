import type { Family, TemplatePreset } from "./schema";

export type BuiltInTemplate = {
  key: string;
  name: string;
  family: Family;
  industries: string[];
  description: string;
  /** Keywords used to match a lead's industry/services text to this template. */
  keywords: string[];
  preset: TemplatePreset;
};

/** Approved template library. Admins can add more presets over these families from the dashboard. */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    key: "restaurant-cafe",
    name: "Saffron Table — restaurants & cafés",
    family: "editorial",
    industries: ["Restaurants & cafés"],
    description: "Warm editorial layout with a cinematic hero, menu highlights and booking call-to-action.",
    keywords: ["restaurant", "cafe", "café", "bakery", "cake", "food", "kitchen", "dhaba", "biryani", "tiffin", "catering", "sweets", "mithai", "coffee", "chai", "tea stall", "juice", "pizza", "cloud kitchen", "hotel"],
    preset: {
      palette: { bg: "#140f0b", surface: "#1f1712", text: "#f6efe6", muted: "#c7b8a6", primary: "#e0a23a", onPrimary: "#1a1208", accent: "#c4553b" },
      fonts: "playfair-dmsans",
      sections: ["hero", "about", "offerings", "highlights", "gallery", "process", "faq", "contact"],
      three: "floating-cards",
      heroStyle: "full-bleed",
      icon: "utensils",
      sampleOfferings: [
        { name: "Chef's signature thali", description: "A seasonal spread of house favourites, served fresh." },
        { name: "Slow-roasted coffee", description: "Small-batch brews and hand-made desserts." },
        { name: "Weekend brunch", description: "Relaxed plates for long, sunny mornings." },
        { name: "Private dining", description: "Intimate gatherings with a curated menu." },
      ],
    },
  },
  {
    key: "fashion-boutique",
    name: "Atelier — clothing & fashion",
    family: "editorial",
    industries: ["Clothing & fashion"],
    description: "High-contrast lookbook with oversized type, collection cards and layered parallax.",
    keywords: ["clothing", "clothes", "fashion", "boutique", "saree", "sari", "kurti", "kurta", "lehenga", "ethnic", "apparel", "garment", "tailor", "designer wear", "t-shirt", "tshirt", "dress", "jewellery", "jewelry"],
    preset: {
      palette: { bg: "#f4efe9", surface: "#ffffff", text: "#191514", muted: "#6b625c", primary: "#191514", onPrimary: "#f4efe9", accent: "#b2734f" },
      fonts: "cormorant-manrope",
      sections: ["hero", "offerings", "about", "gallery", "highlights", "process", "faq", "contact"],
      three: "floating-cards",
      heroStyle: "split",
      icon: "shirt",
      sampleOfferings: [
        { name: "The festive edit", description: "Hand-finished pieces for celebrations." },
        { name: "Everyday essentials", description: "Breathable fabrics, effortless silhouettes." },
        { name: "Made-to-measure", description: "Tailored fits, designed around you." },
        { name: "New arrivals", description: "Fresh drops every season." },
      ],
    },
  },
  {
    key: "shoes-retail",
    name: "Stride — shoes & retail products",
    family: "showcase",
    industries: ["Shoes & retail products"],
    description: "Product-first showcase with an interactive 3D product spin, floating product cards and bold gradients.",
    keywords: ["shoe", "shoes", "footwear", "sneaker", "sandal", "chappal", "retail", "store", "shop", "products", "electronics", "mobile", "gadget", "bags", "watch", "cosmetics", "furniture", "toys", "gift"],
    preset: {
      palette: { bg: "#0b0d12", surface: "#151924", text: "#f2f4f8", muted: "#9aa3b5", primary: "#7c5cff", onPrimary: "#ffffff", accent: "#22d3ee" },
      fonts: "syne-manrope",
      sections: ["hero", "offerings", "highlights", "about", "process", "faq", "contact"],
      three: "product-spin",
      heroStyle: "split",
      icon: "footprints",
      sampleOfferings: [
        { name: "Everyday runner", description: "Lightweight cushioning for all-day comfort." },
        { name: "Street classic", description: "Clean lines that go with everything." },
        { name: "Trail edition", description: "Grip and support for the outdoors." },
        { name: "Comfort slide", description: "Easy on, easy off, all summer." },
      ],
    },
  },
  {
    key: "coach-education",
    name: "Lumen — coaches & education",
    family: "corporate",
    industries: ["Coaches & education"],
    description: "Calm, trustworthy layout with programme cards, learning journey steps and enquiry call-to-action.",
    keywords: ["coach", "coaching", "tutor", "tuition", "classes", "academy", "institute", "school", "teacher", "training", "course", "yoga", "fitness", "gym", "trainer", "mentor", "music class", "dance"],
    preset: {
      palette: { bg: "#f6f7fb", surface: "#ffffff", text: "#141a2e", muted: "#5b6480", primary: "#3b5bdb", onPrimary: "#ffffff", accent: "#f59f00" },
      fonts: "fraunces-inter",
      sections: ["hero", "about", "offerings", "process", "highlights", "faq", "contact"],
      three: "orbits",
      heroStyle: "centered",
      icon: "graduation",
      sampleOfferings: [
        { name: "Foundation programme", description: "Build strong fundamentals at a comfortable pace." },
        { name: "1:1 mentoring", description: "Personal guidance focused on your goals." },
        { name: "Weekend batches", description: "Small groups that fit around your week." },
        { name: "Online sessions", description: "Learn live from anywhere." },
      ],
    },
  },
  {
    key: "real-estate",
    name: "Keystone — real estate",
    family: "corporate",
    industries: ["Real estate"],
    description: "Premium property layout with listing cards, location highlights and site-visit call-to-action.",
    keywords: ["real estate", "property", "properties", "builder", "construction", "flat", "apartment", "villa", "plot", "realtor", "broker", "interior", "architect", "rental", "paying guest"],
    preset: {
      palette: { bg: "#0f1417", surface: "#182025", text: "#eef2f3", muted: "#9aabb2", primary: "#c9a86a", onPrimary: "#14110b", accent: "#5fb3a1" },
      fonts: "cormorant-manrope",
      sections: ["hero", "offerings", "highlights", "about", "process", "faq", "contact"],
      three: "floating-cards",
      heroStyle: "full-bleed",
      icon: "home",
      sampleOfferings: [
        { name: "2 & 3 BHK residences", description: "Light-filled homes with thoughtful layouts." },
        { name: "Premium villas", description: "Private spaces designed for family living." },
        { name: "Commercial spaces", description: "Flexible units in connected locations." },
        { name: "Plots & land", description: "Clear-titled options for your plans." },
      ],
    },
  },
  {
    key: "professional-services",
    name: "Meridian — professional services",
    family: "corporate",
    industries: ["Professional services"],
    description: "Sharp, minimal layout for consultants, CAs, lawyers, agencies and clinics.",
    keywords: ["consultant", "consulting", "ca", "chartered accountant", "accountant", "tax", "gst", "lawyer", "advocate", "legal", "agency", "marketing", "clinic", "doctor", "dentist", "salon", "spa", "photographer", "event", "travel", "insurance", "finance", "repair", "service"],
    preset: {
      palette: { bg: "#ffffff", surface: "#f3f5f7", text: "#0e1726", muted: "#566176", primary: "#0f766e", onPrimary: "#ffffff", accent: "#0ea5e9" },
      fonts: "grotesk-inter",
      sections: ["hero", "offerings", "about", "process", "highlights", "faq", "contact"],
      three: "orbits",
      heroStyle: "split",
      icon: "briefcase",
      sampleOfferings: [
        { name: "Advisory", description: "Clear, practical guidance for your next decision." },
        { name: "Compliance & filings", description: "Accurate paperwork, handled on time." },
        { name: "Ongoing support", description: "A dependable partner through the year." },
        { name: "Free first consultation", description: "Tell us what you need and we'll suggest next steps." },
      ],
    },
  },
  {
    key: "agri-export",
    name: "Terroir — agriculture & export",
    family: "earthy",
    industries: ["Agriculture & export"],
    description: "Earthy, textured layout with an animated terrain hero, product range and sourcing story.",
    keywords: ["agri", "agriculture", "farm", "farmer", "organic", "export", "exporter", "import", "spices", "rice", "grain", "pulses", "tea estate", "dairy", "seeds", "fertilizer", "nursery", "plants", "honey", "cotton", "fruits", "vegetables"],
    preset: {
      palette: { bg: "#f3efe4", surface: "#fbf8f1", text: "#1f2a1c", muted: "#5d6b55", primary: "#3f6b2a", onPrimary: "#f7f5ec", accent: "#c98a2b" },
      fonts: "fraunces-inter",
      sections: ["hero", "about", "offerings", "process", "highlights", "gallery", "faq", "contact"],
      three: "terrain",
      heroStyle: "centered",
      icon: "sprout",
      sampleOfferings: [
        { name: "Whole spices", description: "Carefully sorted, cleaned and packed." },
        { name: "Grains & pulses", description: "Consistent quality for bulk buyers." },
        { name: "Fresh produce", description: "Harvested and handled with care." },
        { name: "Private label", description: "Packing to your brand and specifications." },
      ],
    },
  },
  {
    key: "general-business",
    name: "Northstar — general small business",
    family: "showcase",
    industries: ["General small business"],
    description: "Versatile modern layout with floating service cards that suits most local businesses.",
    keywords: [],
    preset: {
      palette: { bg: "#0d1020", surface: "#161a2e", text: "#f1f3fb", muted: "#a2a9c7", primary: "#ff7a59", onPrimary: "#1a0c06", accent: "#7dd3fc" },
      fonts: "grotesk-inter",
      sections: ["hero", "offerings", "about", "highlights", "process", "faq", "contact"],
      three: "floating-cards",
      heroStyle: "centered",
      icon: "store",
      sampleOfferings: [
        { name: "Our core service", description: "What customers come to us for most." },
        { name: "Popular package", description: "A simple way to get started." },
        { name: "Custom requests", description: "Tell us what you need." },
        { name: "Support", description: "Friendly help when you need it." },
      ],
    },
  },
];

export const FALLBACK_TEMPLATE_KEY = "general-business";

/**
 * Picks the approved template that best matches the lead's industry/services text.
 * Deterministic keyword scoring — the AI never chooses arbitrary templates.
 */
export function matchTemplate<T extends { key: string; keywords?: string[]; industries: string[] }>(text: string, templates: T[]): T {
  const t = text.toLowerCase();
  const hit = (kw: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(kw.toLowerCase().trim())}(s|es)?($|[^\\p{L}\\p{N}])`, "u").test(t);
  let best: T | undefined;
  let bestScore = 0;
  for (const tpl of templates) {
    const kws = tpl.keywords ?? [];
    let score = 0;
    for (const kw of kws) if (hit(kw)) score += kw.length > 6 ? 2 : 1;
    for (const ind of tpl.industries) if (t.includes(ind.toLowerCase())) score += 3;
    if (score > bestScore) {
      best = tpl;
      bestScore = score;
    }
  }
  return best ?? templates.find((x) => x.key === FALLBACK_TEMPLATE_KEY) ?? templates[0]!;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Human-friendly industry label for a free-text description. */
export function industryFromText(text: string): string | undefined {
  const tpl = matchTemplate(text, BUILT_IN_TEMPLATES);
  return tpl.key === FALLBACK_TEMPLATE_KEY ? undefined : tpl.industries[0];
}
