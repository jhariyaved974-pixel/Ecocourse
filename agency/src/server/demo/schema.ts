import { z } from "zod";

/**
 * Demo content and design configuration. The AI only ever produces DATA matching these schemas;
 * the HTML is rendered by fixed, reviewed template code. No AI-generated code is executed or deployed.
 */

export const FAMILIES = ["editorial", "showcase", "corporate", "earthy"] as const;
export type Family = (typeof FAMILIES)[number];

export const SECTION_TYPES = ["hero", "about", "offerings", "highlights", "process", "gallery", "faq", "contact"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const THREE_MODES = ["floating-cards", "product-spin", "orbits", "terrain", "none"] as const;

const line = (max: number) => z.string().trim().min(1).max(max);

/** What the model writes (also what the mock produces). */
export const DemoContentSchema = z.object({
  tagline: z.string().describe("2-5 word brand tagline"),
  heroHeadline: z.string().describe("Distinctive hero headline, max ~9 words"),
  heroSubheadline: z.string().describe("One sentence, max ~25 words"),
  primaryCta: z.string().describe("Button label, max 4 words"),
  secondaryCta: z.string().describe("Button label, max 4 words"),
  aboutTitle: z.string(),
  aboutBody: z.string().describe("2-3 sentences describing what the business offers. No history, awards, years or statistics."),
  offeringsTitle: z.string(),
  offeringsIntro: z.string(),
  offerings: z
    .array(z.object({ name: z.string(), description: z.string(), tag: z.string().nullable() }))
    .describe("3-6 sample products or services typical for this industry. They are illustrative samples."),
  highlightsTitle: z.string(),
  highlights: z.array(z.object({ title: z.string(), body: z.string() })).describe("3-4 qualities of the offering. No numbers, ratings, rankings, awards or certifications."),
  processTitle: z.string(),
  process: z.array(z.object({ title: z.string(), body: z.string() })).describe("3-4 steps describing how a customer orders/books/works with them."),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe("2-4 general FAQs. No prices, guarantees or policies the business did not state."),
  contactTitle: z.string(),
  contactBody: z.string(),
});
export type DemoContent = z.infer<typeof DemoContentSchema>;

/** Stricter limits enforced after generation (the model's output is clamped/validated against this). */
export const StrictDemoContentSchema = z.object({
  tagline: line(60),
  heroHeadline: line(90),
  heroSubheadline: line(220),
  primaryCta: line(30),
  secondaryCta: line(30),
  aboutTitle: line(80),
  aboutBody: line(700),
  offeringsTitle: line(80),
  offeringsIntro: line(300),
  offerings: z.array(z.object({ name: line(70), description: line(240), tag: line(24).nullable() })).min(3).max(6),
  highlightsTitle: line(80),
  highlights: z.array(z.object({ title: line(60), body: line(240) })).min(3).max(4),
  processTitle: line(80),
  process: z.array(z.object({ title: line(60), body: line(240) })).min(3).max(4),
  faq: z.array(z.object({ q: line(140), a: line(400) })).min(2).max(4),
  contactTitle: line(80),
  contactBody: line(300),
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const PaletteSchema = z.object({
  bg: hex,
  surface: hex,
  text: hex,
  muted: hex,
  primary: hex,
  onPrimary: hex,
  accent: hex,
});
export type Palette = z.infer<typeof PaletteSchema>;

export const FONT_PAIRS = {
  "fraunces-inter": { display: "Fraunces", body: "Inter", google: "family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=Inter:wght@400;500;600" },
  "playfair-dmsans": { display: "Playfair Display", body: "DM Sans", google: "family=Playfair+Display:wght@500;700;800&family=DM+Sans:wght@400;500;700" },
  "grotesk-inter": { display: "Space Grotesk", body: "Inter", google: "family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600" },
  "cormorant-manrope": { display: "Cormorant Garamond", body: "Manrope", google: "family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;700" },
  "syne-manrope": { display: "Syne", body: "Manrope", google: "family=Syne:wght@600;700;800&family=Manrope:wght@400;500;700" },
} as const;
export type FontPairKey = keyof typeof FONT_PAIRS;
const FONT_KEYS = Object.keys(FONT_PAIRS) as [FontPairKey, ...FontPairKey[]];

/** Admin-editable template preset (stored in Template.preset). */
export const TemplatePresetSchema = z.object({
  palette: PaletteSchema,
  fonts: z.enum(FONT_KEYS),
  sections: z.array(z.enum(SECTION_TYPES)).min(3).max(SECTION_TYPES.length),
  three: z.enum(THREE_MODES),
  heroStyle: z.enum(["split", "centered", "full-bleed"]),
  sampleOfferings: z.array(z.object({ name: line(70), description: line(240) })).min(3).max(6),
  /** lucide-style icon keys used for offering cards (rendered from a fixed SVG set). */
  icon: z.enum(["utensils", "shirt", "footprints", "graduation", "home", "briefcase", "sprout", "store"]),
});
export type TemplatePreset = z.infer<typeof TemplatePresetSchema>;

export const DemoConfigSchema = z.object({
  version: z.literal(1),
  templateKey: z.string().min(1),
  family: z.enum(FAMILIES),
  businessName: line(120),
  industry: line(120),
  language: z.enum(["en", "hi", "hinglish"]),
  palette: PaletteSchema,
  fonts: z.enum(FONT_KEYS),
  heroStyle: z.enum(["split", "centered", "full-bleed"]),
  three: z.enum(THREE_MODES),
  icon: TemplatePresetSchema.shape.icon,
  sections: z.array(z.enum(SECTION_TYPES)).min(3),
  content: StrictDemoContentSchema,
  /** Asset ids (LeadAsset, approvedForDemo) to embed, e.g. the customer's logo. */
  logoAssetId: z.string().nullable(),
  /** Base URL of the preview's own assets (relative path). */
  assetBase: z.literal("./assets/"),
});
export type DemoConfig = z.infer<typeof DemoConfigSchema>;
