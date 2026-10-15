import { ALLOWED_SCRIPTS, FONT_ORIGINS, type ArtifactFile } from "./render";
import { findViolations } from "./safety";
import type { DemoConfig } from "./schema";

export type ValidationCheck = { id: string; ok: boolean; detail?: string };
export type ValidationReport = { ok: boolean; checks: ValidationCheck[]; totalBytes: number };

const MAX_HTML = 250 * 1024;
const MAX_TOTAL = 3 * 1024 * 1024;

export type PrivateData = { phone?: string | null; email?: string | null; waId?: string | null; contactName?: string | null };

/** Static validation of a rendered demo. A build is only ever published when every check passes. */
export function validateArtifact(files: ArtifactFile[], config: DemoConfig, priv: PrivateData): ValidationReport {
  const checks: ValidationCheck[] = [];
  const add = (id: string, ok: boolean, detail?: string) => checks.push({ id, ok, ...(detail ? { detail } : {}) });
  const index = files.find((f) => f.path === "index.html");
  const totalBytes = files.reduce((n, f) => n + f.content.length, 0);
  add("index_present", Boolean(index));
  if (!index) return { ok: false, checks, totalBytes };
  const html = index.content.toString("utf8");

  add("html_size", index.content.length <= MAX_HTML, `${index.content.length} bytes`);
  add("total_size", totalBytes <= MAX_TOTAL, `${totalBytes} bytes`);
  add("doctype", html.startsWith("<!doctype html>"));
  add("demo_label", (html.match(/data-demo-label="true"/g) ?? []).length >= 2, "ribbon and footer labels");
  add("noindex", /<meta name="robots" content="noindex/.test(html));
  add("viewport", /<meta name="viewport"/.test(html));
  add("h1", (html.match(/<h1[\s>]/g) ?? []).length === 1);

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const badScripts = scripts.filter((m) => {
    const src = m[1]?.match(/\bsrc="([^"]+)"/)?.[1];
    return !src || !ALLOWED_SCRIPTS.includes(src) || (m[2] ?? "").trim().length > 0;
  });
  add("scripts_allowlisted", badScripts.length === 0, badScripts.length ? `${badScripts.length} unexpected script tag(s)` : undefined);
  add("no_inline_handlers", !/<[^>]+\son[a-z]+\s*=/i.test(html));
  add("no_js_urls", !/javascript:/i.test(html));
  add("no_iframes_objects", !/<(iframe|object|embed|base)\b/i.test(html));

  const urls = [...html.matchAll(/\b(?:href|src|action)="([^"]*)"/g)].map((m) => m[1]!);
  const badUrls = urls.filter((u) => !(u.startsWith("#") || u.startsWith("./assets/") || FONT_ORIGINS.some((o) => u === o || u.startsWith(`${o}/`)) || u === "#contact"));
  add("urls_allowlisted", badUrls.length === 0, badUrls.slice(0, 3).join(", ") || undefined);

  const css = files.find((f) => f.path === "assets/site.css")?.content.toString("utf8") ?? "";
  add("css_present", css.length > 1000);
  add("css_no_remote", !/url\(\s*["']?\s*(https?:)?\/\//i.test(css) && !/@import/i.test(css));

  for (const s of config.sections) if (s !== "hero") add(`section_${s}`, html.includes(`id="${s}"`));

  // Private data must never appear in a public preview.
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  const digits = html.replace(/\D/g, "");
  const leaks: string[] = [];
  const phoneTail = (priv.phone ?? priv.waId ?? "").replace(/\D/g, "").slice(-10);
  if (phoneTail.length >= 8 && digits.includes(phoneTail)) leaks.push("phone");
  if (priv.email && html.toLowerCase().includes(priv.email.toLowerCase())) leaks.push("email");
  if (priv.contactName && priv.contactName.trim().length >= 4 && !config.businessName.toLowerCase().includes(priv.contactName.toLowerCase()) && text.toLowerCase().includes(priv.contactName.toLowerCase())) leaks.push("contact name");
  add("no_private_data", leaks.length === 0, leaks.join(", ") || undefined);

  const claimText = text.replace(/\s+/g, " ");
  const violations = findViolations(claimText.replace(/Anonymous view counts are recorded[^.]*\./, ""));
  add("no_unverified_claims", violations.length === 0, violations.join(", ") || undefined);

  return { ok: checks.every((c) => c.ok), checks, totalBytes };
}
