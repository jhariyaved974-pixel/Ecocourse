import { getAiProvider } from "../ai";
import { MockAiProvider } from "../ai/mock";
import { AiError } from "../ai/provider";
import { BusinessBriefSchema, type BusinessBrief } from "../ai/schemas";
import { recordAiUsage } from "../ai/usage";
import { advanceStage } from "../crm/leads";
import { db, type Prisma, type Template } from "../db";
import { getEnv } from "../env";
import { errorMessage, log } from "../log";
import { RetryableError } from "../messaging/outbound";
import { notifyOwner } from "../notify";
import { getSettings } from "../settings";
import { brandPalette, colorsFromText } from "./color";
import { sendDemoLink } from "./delivery";
import { getPublisher } from "./publish";
import { renderDemoSite, type ArtifactFile } from "./render";
import { sanitizeContent } from "./safety";
import { DemoConfigSchema, StrictDemoContentSchema, TemplatePresetSchema, type DemoConfig, type DemoContent } from "./schema";
import { BUILT_IN_TEMPLATES, matchTemplate } from "./templates";
import { validateArtifact, type ValidationReport } from "./validate";

export async function ensureBuiltInTemplates() {
  for (const t of BUILT_IN_TEMPLATES) {
    await db.template.upsert({
      where: { key: t.key },
      create: { key: t.key, name: t.name, family: t.family, industries: t.industries, description: t.description, preset: t.preset as Prisma.InputJsonValue, builtIn: true },
      update: {},
    });
  }
}

/** Chooses an approved, active template for the brief (deterministic keyword match). */
export async function chooseTemplate(brief: BusinessBrief, preferredId?: string | null): Promise<Template> {
  await ensureBuiltInTemplates();
  if (preferredId) {
    const t = await db.template.findFirst({ where: { id: preferredId, active: true } });
    if (t) return t;
  }
  const templates = await db.template.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const withKeywords = templates.map((t) => ({
    ...t,
    keywords: BUILT_IN_TEMPLATES.find((b) => b.key === t.key)?.keywords ?? [...t.industries, ...t.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)],
  }));
  return matchTemplate(`${brief.industry} ${brief.description}`, withKeywords);
}

/** Clamps model text to the strict schema's limits (so a slightly long sentence doesn't fail the build). */
function clampContent(c: DemoContent): DemoContent {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s).trim();
  return {
    ...c,
    tagline: cut(c.tagline, 60),
    heroHeadline: cut(c.heroHeadline, 90),
    heroSubheadline: cut(c.heroSubheadline, 220),
    primaryCta: cut(c.primaryCta, 30),
    secondaryCta: cut(c.secondaryCta, 30),
    aboutTitle: cut(c.aboutTitle, 80),
    aboutBody: cut(c.aboutBody, 700),
    offeringsTitle: cut(c.offeringsTitle, 80),
    offeringsIntro: cut(c.offeringsIntro, 300),
    offerings: c.offerings.slice(0, 6).map((o) => ({ name: cut(o.name, 70), description: cut(o.description, 240), tag: o.tag ? cut(o.tag, 24) : null })),
    highlightsTitle: cut(c.highlightsTitle, 80),
    highlights: c.highlights.slice(0, 4).map((h) => ({ title: cut(h.title, 60), body: cut(h.body, 240) })),
    processTitle: cut(c.processTitle, 80),
    process: c.process.slice(0, 4).map((p) => ({ title: cut(p.title, 60), body: cut(p.body, 240) })),
    faq: c.faq.slice(0, 4).map((f) => ({ q: cut(f.q, 140), a: cut(f.a, 400) })),
    contactTitle: cut(c.contactTitle, 80),
    contactBody: cut(c.contactBody, 300),
  };
}

const MODEL_RE = /\b(shoe|shoes|sneaker|sneakers|footwear|chappal|sandal|sandals|slipper|boots?)\b/i;

/** Job handler for "demo-generate". Never publishes a build that failed validation. */
export async function generateDemo(demoId: string) {
  const demo = await db.demoProject.findUnique({ where: { id: demoId }, include: { brief: true, lead: true } });
  if (!demo || !["QUEUED", "GENERATING"].includes(demo.status)) return { status: demo?.status ?? "missing" };
  const settings = await getSettings();
  if (settings.killSwitch) {
    await db.demoProject.update({ where: { id: demoId }, data: { lastError: "Waiting: automation kill switch is on" } });
    return { status: "QUEUED" };
  }
  const started = Date.now();
  // Atomic claim (a GENERATING demo is only re-claimed when its previous attempt looks abandoned).
  const claimed = await db.demoProject.updateMany({
    where: { id: demoId, OR: [{ status: "QUEUED" }, { status: "GENERATING", updatedAt: { lt: new Date(started - 15 * 60 * 1000) } }] },
    data: { status: "GENERATING", attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count === 0) return { status: "GENERATING" };
  const env = getEnv();
  const logLines: string[] = [];
  const note = (l: string) => logLines.push(`[${new Date().toISOString()}] ${l}`);

  const brief = BusinessBriefSchema.parse(demo.brief.data);
  const template = await chooseTemplate(brief, demo.templateId);
  const preset = TemplatePresetSchema.parse(template.preset);
  note(`Template: ${template.key} (${template.family})`);

  // 1. Content: AI writes copy as structured data; the mock's copy is the safe fallback.
  const ctx = {
    businessName: brief.businessName,
    industry: brief.industry,
    description: brief.description,
    targetAudience: brief.targetAudience,
    style: brief.brand.style,
    pages: brief.pages,
    features: brief.features,
    language: brief.language,
    templateName: template.name,
    sampleOfferings: preset.sampleOfferings,
  };
  const fallback = (await new MockAiProvider().demoContent(ctx)).output;
  let content: DemoContent;
  let costUsd = 0;
  try {
    const r = await getAiProvider().demoContent(ctx);
    costUsd += await recordAiUsage("demo_content", r.usage, demo.leadId);
    content = r.output;
    note(r.usage.simulated ? "Content: simulated (mock AI)" : `Content: ${r.usage.model}`);
  } catch (e) {
    if (e instanceof AiError && e.retryable) {
      await db.demoProject.update({ where: { id: demoId }, data: { status: "QUEUED", lastError: e.message } });
      throw new RetryableError(e.message);
    }
    note(`AI content unavailable (${errorMessage(e)}); using template copy`);
    content = fallback;
  }
  const { content: safe, replaced } = sanitizeContent(clampContent(content), fallback);
  for (const r of replaced) note(`Replaced ${r.path} (rules: ${r.rules.join(", ")})`);
  const strict = StrictDemoContentSchema.safeParse(clampContent(safe));
  const finalContent = strict.success ? strict.data : StrictDemoContentSchema.parse(clampContent(fallback));
  if (!strict.success) note(`Content failed schema (${strict.error.issues[0]?.message}); using template copy`);

  // 2. Design configuration.
  const brandColors = brief.brand.colors.length ? brief.brand.colors : colorsFromText(`${brief.brand.colorNotes} ${brief.brand.style}`);
  const logo = await db.leadAsset.findFirst({ where: { leadId: demo.leadId, approvedForDemo: true, kind: "logo", content: { not: null } }, orderBy: { createdAt: "desc" } });
  const useModel = preset.three === "product-spin" && MODEL_RE.test(`${brief.industry} ${brief.description}`);
  const config: DemoConfig = DemoConfigSchema.parse({
    version: 1,
    templateKey: template.key,
    family: template.family,
    businessName: brief.businessName,
    industry: brief.industry,
    language: brief.language === "hi" ? "hi" : brief.language,
    palette: brandPalette(preset.palette, brandColors),
    fonts: preset.fonts,
    heroStyle: preset.heroStyle,
    three: preset.three,
    icon: preset.icon,
    sections: preset.sections.includes("contact") ? preset.sections : [...preset.sections, "contact"],
    content: finalContent,
    logoAssetId: logo?.id ?? null,
    assetBase: "./assets/",
  });

  // 3. Build in isolation (pure render of data through the fixed template) and validate.
  const publisher = getPublisher();
  const deployment = await db.demoDeployment.create({ data: { demoProjectId: demo.id, provider: publisher.name, status: "BUILDING" } });
  let files: ArtifactFile[];
  let report: ValidationReport;
  try {
    await db.demoProject.update({ where: { id: demoId }, data: { status: "VALIDATING", config: config as Prisma.InputJsonValue, templateId: template.id } });
    const ext = logo?.mimeType === "image/png" ? "png" : logo?.mimeType === "image/webp" ? "webp" : "jpg";
    files = await renderDemoSite(config, { studioName: env.BUSINESS_NAME, logo: logo?.content ? { ext, mime: logo.mimeType, bytes: Buffer.from(logo.content) } : null, model: useModel });
    report = validateArtifact(files, config, { phone: demo.lead.phoneE164, email: demo.lead.email, waId: demo.lead.waId, contactName: demo.lead.contactName });
    if (report.ok && env.DEMO_BROWSER_CHECK === "1") {
      const { browserCheck } = await import("./browser-check");
      const b = await browserCheck(files);
      report.checks.push(...b);
      report.ok = report.checks.every((c) => c.ok);
    }
  } catch (e) {
    note(`Build error: ${errorMessage(e)}`);
    await db.demoDeployment.update({ where: { id: deployment.id }, data: { status: "FAILED", log: logLines.join("\n"), finishedAt: new Date() } });
    await db.demoProject.update({ where: { id: demoId }, data: { status: "QUEUED", lastError: errorMessage(e).slice(0, 1000) } });
    throw e; // unexpected error: retried by the queue, then dead-lettered
  }

  await db.demoArtifact.createMany({ data: files.map((f) => ({ deploymentId: deployment.id, path: f.path, contentType: f.contentType, content: new Uint8Array(f.content), sha1: f.sha1 })) });
  if (!report.ok) {
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.id}${c.detail ? ` (${c.detail})` : ""}`);
    note(`Validation failed: ${failed.join("; ")}`);
    await db.demoDeployment.update({ where: { id: deployment.id }, data: { status: "FAILED", validation: report as unknown as Prisma.InputJsonValue, log: logLines.join("\n"), sizeBytes: report.totalBytes, finishedAt: new Date() } });
    await failDemo(demoId, `Validation failed: ${failed.join("; ")}`);
    return { status: "FAILED" };
  }
  note(`Validation passed (${report.checks.length} checks, ${report.totalBytes} bytes)`);
  await db.demoDeployment.update({ where: { id: deployment.id }, data: { status: "VALIDATED", validation: report as unknown as Prisma.InputJsonValue, log: logLines.join("\n"), sizeBytes: report.totalBytes, finishedAt: new Date() } });
  await db.demoProject.update({ where: { id: demoId }, data: { status: "AWAITING_APPROVAL", generationMs: Date.now() - started, estimatedCostUsd: costUsd } });

  if (settings.demoRequiresApproval) {
    await notifyOwner("demoReady", {
      title: `Demo ready for review: ${brief.businessName}`,
      body: `The concept passed all validation checks and is waiting for your approval before it is published or sent.`,
      leadId: demo.leadId,
      dedupeKey: `demo-review:${demo.id}:${deployment.id}`,
    });
    return { status: "AWAITING_APPROVAL" };
  }
  await publishDemo(demoId, null);
  await sendDemoLink(demoId, null);
  return { status: "PUBLISHED" };
}

export async function failDemo(demoId: string, reason: string) {
  const demo = await db.demoProject.update({ where: { id: demoId }, data: { status: "FAILED", lastError: reason.slice(0, 1000) }, include: { lead: true } });
  await notifyOwner("demoFailed", {
    title: `Demo build failed: ${demo.lead.businessName ?? "lead"}`,
    body: `${reason.slice(0, 800)}\n\nNothing was published. You can retry or regenerate from the dashboard.`,
    leadId: demo.leadId,
    dedupeKey: `demo-failed:${demoId}:${demo.attempts}`,
  });
}

/** Publishes the latest VALIDATED deployment. Refuses anything that did not pass validation. */
export async function publishDemo(demoId: string, actorId: string | null) {
  const demo = await db.demoProject.findUniqueOrThrow({ where: { id: demoId } });
  if (demo.status !== "AWAITING_APPROVAL" && demo.status !== "PUBLISHED") throw new Error(`Demo is ${demo.status}; only validated demos can be published`);
  const deployment = await db.demoDeployment.findFirst({ where: { demoProjectId: demoId, status: { in: ["VALIDATED", "PUBLISHED"] } }, orderBy: { startedAt: "desc" }, include: { files: true } });
  if (!deployment) throw new Error("No validated build to publish");
  const validation = deployment.validation as { ok?: boolean } | null;
  if (!validation?.ok) throw new Error("Build has no passing validation report");

  const publisher = getPublisher();
  const files = deployment.files.map((f) => ({ path: f.path, contentType: f.contentType, content: Buffer.from(f.content), sha1: f.sha1 }));
  const { url, providerDeployId } = await publisher.publish({ slug: demo.slug, files });
  const now = new Date();
  await db.$transaction([
    db.demoDeployment.updateMany({ where: { demoProjectId: demoId, status: "PUBLISHED", id: { not: deployment.id } }, data: { status: "SUPERSEDED" } }),
    db.demoDeployment.update({ where: { id: deployment.id }, data: { status: "PUBLISHED", url, providerDeployId } }),
    db.demoProject.update({ where: { id: demoId }, data: { status: "PUBLISHED", publicUrl: url, approvedById: actorId, approvedAt: now } }),
  ]);
  const lead = await db.lead.findUniqueOrThrow({ where: { id: demo.leadId } });
  await advanceStage(lead.id, "DEMO_READY");
  if (!lead.firstDemoReadyAt) await db.lead.update({ where: { id: lead.id }, data: { firstDemoReadyAt: now } });
  log.info("demo published", { demoId, provider: publisher.name });
  return url;
}
