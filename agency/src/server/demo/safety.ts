import type { DemoContent } from "./schema";

/**
 * Content rules for demo copy. Demos must not present invented claims as facts or leak contact data.
 * Violating fields are replaced with safe fallback copy (and the replacement is recorded in the build log).
 */
const RULES: { id: string; re: RegExp }[] = [
  { id: "testimonial", re: /\b(testimonial|review(s|ed)? by|rated|ratings?|stars?\b|★|⭐|customer(s)? say|what our (clients|customers) say)/i },
  { id: "award", re: /\b(award(-|\s)?winning|awarded|winner of|certified|certification|iso\s?\d+|accredited|licensed)\b/i },
  { id: "history", re: /\b(since\s+(19|20)\d{2}|established\s+(in\s+)?(19|20)\d{2}|\d+\+?\s+years?\s+(of\s+)?(experience|in business|legacy|trusted))/i },
  { id: "statistic", re: /\b\d[\d,.]*\s?(\+|%|k\+|lakh|crore|million)\s*(happy\s+)?(customers|clients|students|orders|sales|projects|families)?|\b(trusted by|loved by|served)\s+\d/i },
  { id: "ranking", re: /\b(#\s?1|number one|no\.?\s?1|best in (india|the city|town)|top[- ]rated|leading)\b/i },
  { id: "guarantee", re: /\bguarantee(d|s)?\b|\b100\s?%\s+(satisfaction|results|safe|pure|organic)\b/i },
  { id: "price", re: /(₹|\brs\.?\s?\d|\binr\s?\d|\$\s?\d|\d+\s?\/-)/i },
  { id: "contact", re: /\bhttps?:\/\/|\bwww\.|[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s-]{8,}\d/i },
  { id: "markup", re: /<[a-z/!][^>]*>|javascript:|\{\{|\}\}/i },
];

export function findViolations(text: string): string[] {
  return RULES.filter((r) => r.re.test(text)).map((r) => r.id);
}

type Path = string;

/** Returns sanitized content plus a list of replaced paths. `fallback` must itself be clean. */
export function sanitizeContent(content: DemoContent, fallback: DemoContent): { content: DemoContent; replaced: { path: Path; rules: string[] }[] } {
  const replaced: { path: Path; rules: string[] }[] = [];
  const out = structuredClone(content) as DemoContent;
  const fb = fallback as unknown as Record<string, unknown>;
  const o = out as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(o)) {
    if (typeof value === "string") {
      const v = findViolations(value);
      if (v.length) {
        o[key] = fb[key];
        replaced.push({ path: key, rules: v });
      }
    } else if (Array.isArray(value)) {
      const fbArr = (fb[key] as unknown[]) ?? [];
      const kept = value.filter((item, i) => {
        const v = findViolations(JSON.stringify(item));
        if (v.length) replaced.push({ path: `${key}[${i}]`, rules: v });
        return v.length === 0;
      });
      // Top up from fallback items so lists keep their minimum length.
      for (const extra of fbArr) {
        if (kept.length >= Math.max(3, Math.min(value.length, 4)) && key !== "faq") break;
        if (key === "faq" && kept.length >= 2) break;
        if (!kept.some((k) => JSON.stringify(k) === JSON.stringify(extra))) kept.push(extra);
      }
      o[key] = kept;
    }
  }
  return { content: out, replaced };
}
