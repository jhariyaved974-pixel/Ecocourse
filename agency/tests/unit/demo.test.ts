import { describe, expect, it } from "vitest";
import { MockAiProvider } from "@/server/ai/mock";
import { brandPalette, colorsFromText, contrastRatio } from "@/server/demo/color";
import { renderDemoSite } from "@/server/demo/render";
import { findViolations, sanitizeContent } from "@/server/demo/safety";
import { DemoConfigSchema, StrictDemoContentSchema, TemplatePresetSchema, type DemoConfig } from "@/server/demo/schema";
import { BUILT_IN_TEMPLATES, matchTemplate } from "@/server/demo/templates";
import { validateArtifact } from "@/server/demo/validate";

async function config(templateKey = "restaurant-cafe", over: Partial<DemoConfig> = {}): Promise<DemoConfig> {
  const t = BUILT_IN_TEMPLATES.find((x) => x.key === templateKey)!;
  const content = (
    await new MockAiProvider().demoContent({
      businessName: "Green Leaf Café",
      industry: t.industries[0]!,
      description: "Green Leaf Café serves breakfast and coffee in Pune",
      targetAudience: "Locals",
      style: "warm",
      pages: ["Home"],
      features: [],
      language: "en",
      templateName: t.name,
      sampleOfferings: t.preset.sampleOfferings,
    })
  ).output;
  return DemoConfigSchema.parse({
    version: 1,
    templateKey: t.key,
    family: t.family,
    businessName: "Green Leaf Café",
    industry: t.industries[0],
    language: "en",
    palette: t.preset.palette,
    fonts: t.preset.fonts,
    heroStyle: t.preset.heroStyle,
    three: t.preset.three,
    icon: t.preset.icon,
    sections: t.preset.sections,
    content: StrictDemoContentSchema.parse(content),
    logoAssetId: null,
    assetBase: "./assets/",
    ...over,
  });
}

describe("template library", () => {
  it("has valid presets for all 8 industries", () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(8);
    for (const t of BUILT_IN_TEMPLATES) expect(TemplatePresetSchema.safeParse(t.preset).success, t.key).toBe(true);
  });
  it("matches industries by whole words", () => {
    const m = (s: string) => matchTemplate(s, BUILT_IN_TEMPLATES).key;
    expect(m("We run a bakery and café in Pune")).toBe("restaurant-cafe");
    expect(m("saree and kurti boutique")).toBe("fashion-boutique");
    expect(m("sneakers and sandals")).toBe("shoes-retail");
    expect(m("JEE coaching classes")).toBe("coach-education");
    expect(m("2 BHK flats and villas, property dealer")).toBe("real-estate");
    expect(m("CA firm for GST and tax filing")).toBe("professional-services");
    expect(m("organic spices exporter")).toBe("agri-export");
    expect(m("something else entirely")).toBe("general-business");
    expect(m("we upgrade guidance currently")).toBe("general-business");
  });
});

describe("palette", () => {
  it("keeps readable contrast when applying brand colours", () => {
    const base = BUILT_IN_TEMPLATES[0]!.preset.palette;
    const p = brandPalette(base, ["#ffff00", "#111111"]);
    expect(contrastRatio(p.primary, p.onPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.bg, p.text)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.bg, p.accent)).toBeGreaterThanOrEqual(3);
  });
  it("maps colour words to hex", () => {
    expect(colorsFromText("maroon and gold please")).toEqual(["#7b1e2b", "#c9a227"]);
  });
});

describe("content safety", () => {
  it("flags invented claims and contact data", () => {
    expect(findViolations("Award-winning bakery since 1998")).toEqual(expect.arrayContaining(["award", "history"]));
    expect(findViolations("Trusted by 5000+ happy customers")).toContain("statistic");
    expect(findViolations("Call +91 98765 43210")).toContain("contact");
    expect(findViolations("Fresh bread every morning")).toEqual([]);
  });
  it("replaces violating fields with safe fallback copy", async () => {
    const c = (await config()).content;
    const dirty = { ...c, aboutBody: "Award-winning since 1998, rated 4.9 stars", highlights: [{ title: "No.1 in Pune", body: "Best in the city" }, ...c.highlights] };
    const { content, replaced } = sanitizeContent(dirty, c);
    expect(content.aboutBody).toBe(c.aboutBody);
    expect(content.highlights.some((h) => h.title.includes("No.1"))).toBe(false);
    expect(replaced.map((r) => r.path)).toEqual(expect.arrayContaining(["aboutBody", "highlights[0]"]));
  });
});

describe("render + validate", () => {
  it.each(BUILT_IN_TEMPLATES.map((t) => t.key))("renders a valid, labelled, private demo for %s", async (key) => {
    const cfg = await config(key);
    const files = await renderDemoSite(cfg, { studioName: "Pixel Studio" });
    const report = validateArtifact(files, cfg, { phone: "+919876543210", email: "owner@example.com", contactName: "Ramesh Kumar" });
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    const html = files.find((f) => f.path === "index.html")!.content.toString();
    expect(html).toContain("Demo concept");
    expect(html).toContain("Green Leaf Café");
  });

  it("escapes AI text instead of rendering markup", async () => {
    const cfg = await config();
    cfg.content.heroHeadline = "<script>alert(1)</script>";
    const files = await renderDemoSite(cfg, { studioName: "Pixel Studio" });
    const html = files.find((f) => f.path === "index.html")!.content.toString();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("fails validation when private data would be published", async () => {
    const cfg = await config("general-business", { businessName: "Call 9876543210 Ramesh" });
    const files = await renderDemoSite(cfg, { studioName: "Pixel Studio" });
    const report = validateArtifact(files, cfg, { phone: "+919876543210" });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "no_private_data")?.ok).toBe(false);
  });

  it("fails validation for tampered HTML (inline script, foreign URL, missing label)", async () => {
    const cfg = await config();
    const files = await renderDemoSite(cfg, { studioName: "Pixel Studio" });
    const idx = files.find((f) => f.path === "index.html")!;
    const html = idx.content.toString().replace("</body>", '<script>steal()</script><a href="https://evil.example">x</a></body>').replaceAll('data-demo-label="true"', "");
    const tampered = files.map((f) => (f === idx ? { ...f, content: Buffer.from(html) } : f));
    const failed = validateArtifact(tampered, cfg, {}).checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["scripts_allowlisted", "urls_allowlisted", "demo_label"]));
  });
});
