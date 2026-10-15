/**
 * Post-generation checks on every AI-written customer message. A violation means the message is NOT sent;
 * the conversation is handed to a human instead. These rules never depend on the model behaving.
 */

export type GuardrailViolation =
  | "unapproved_price"
  | "discount_offer"
  | "payment_claim"
  | "order_confirmation"
  | "guarantee"
  | "sensitive_request"
  | "link"
  | "empty";

const PRICE_RE = /(?:₹|rs\.?|inr|rupees?)\s*([\d][\d,]*(?:\.\d+)?)\s*(k\b)?|([\d][\d,]*(?:\.\d+)?)\s*(k\b)?\s*(?:₹|rs\b\.?|inr\b|rupees?\b|\/-)/gi;

export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(PRICE_RE)) {
    const raw = (m[1] ?? m[3] ?? "").replace(/,/g, "");
    const thousand = Boolean(m[2] ?? m[4]);
    const n = Number(raw) * (thousand ? 1000 : 1);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const CHECKS: { v: GuardrailViolation; re: RegExp }[] = [
  { v: "discount_offer", re: /\b\d{1,2}\s?%\s?(off|discount)|\b(special|extra|flat)\s+(discount|offer|price)\b|\bdiscount(ed)?\s+(price|rate)\b/i },
  { v: "payment_claim", re: /\b(payment|amount|money)\s+(has been\s+|is\s+|was\s+)?(received|confirmed|credited|verified)\b|\b(received|got)\s+your\s+payment\b|\bpayment\s+(mil gaya|mil gayi|aa gaya)\b/i },
  { v: "order_confirmation", re: /\b(your\s+)?order\s+(is|has been)\s+(confirmed|placed|booked)\b|\bbooking\s+(is\s+)?confirmed\b/i },
  { v: "guarantee", re: /\bguarantee(d|s)?\b|\b(rank|ranking)\s+(#?1|first|top)\b|\bfirst\s+page\s+(of|on)\s+google\b|\b(100|hundred)\s?%\s+(results|sales|success)\b|\bdouble\s+your\s+(sales|revenue|leads)\b/i },
  { v: "sensitive_request", re: /\b(share|send|give|tell)\b[^.?!]{0,40}\b(upi\s?pin|pin|otp|cvv|password|card\s+(number|details)|net\s?banking)\b/i },
  { v: "link", re: /\bhttps?:\/\/\S+|\bwww\.\S+/i },
];

export type GuardrailResult = { ok: boolean; violations: GuardrailViolation[]; text: string };

export function checkAiReply(reply: string, opts: { allowedAmounts: number[]; allowedUrlPrefixes?: string[] }): GuardrailResult {
  const text = reply.trim().slice(0, 1000);
  const violations = new Set<GuardrailViolation>();
  if (!text) violations.add("empty");
  for (const n of extractAmounts(text)) if (!opts.allowedAmounts.includes(n)) violations.add("unapproved_price");
  for (const { v, re } of CHECKS) {
    if (v === "link") {
      const links = text.match(/\bhttps?:\/\/\S+|\bwww\.\S+/gi) ?? [];
      if (links.some((l) => !(opts.allowedUrlPrefixes ?? []).some((p) => l.startsWith(p)))) violations.add("link");
      continue;
    }
    if (re.test(text)) violations.add(v);
  }
  return { ok: violations.size === 0, violations: [...violations], text };
}

/** Ensures the first assistant message discloses that it is automated. */
export function ensureDisclosure(reply: string, studioName: string) {
  if (/\b(ai|automated|bot)\b|एआई|ऑटोमेटेड/i.test(reply)) return reply;
  return `Hi! I'm the AI website consultant for ${studioName} (an automated assistant). ${reply}`;
}

export const HANDOFF_REPLY = {
  en: "Thanks — I've passed this to our team, and a person will reply to you here shortly.",
  hinglish: "Dhanyavaad — maine yeh hamari team ko bhej diya hai, jaldi hi koi aapko yahin reply karega.",
  hi: "धन्यवाद — मैंने यह हमारी टीम को भेज दिया है, जल्द ही कोई आपको यहीं जवाब देगा।",
} as const;

export const OPT_OUT_REPLY = {
  en: "Done — you won't receive any more automated messages from us. If you ever want to chat again, just send START.",
  hinglish: "Theek hai — ab aapko humse koi automated message nahi aayega. Dobara baat karni ho to START bhej dijiye.",
  hi: "ठीक है — अब आपको हमसे कोई ऑटोमेटेड संदेश नहीं आएगा। दोबारा बात करनी हो तो START भेजें।",
} as const;

export const SENSITIVE_WARNING = {
  en: "For your safety, please don't share card numbers, UPI PINs, OTPs or passwords in this chat — we will never ask for them.",
  hinglish: "Aapki suraksha ke liye, is chat mein card number, UPI PIN, OTP ya password share na karein — hum kabhi nahi maangenge.",
  hi: "आपकी सुरक्षा के लिए, इस चैट में कार्ड नंबर, UPI पिन, OTP या पासवर्ड साझा न करें — हम कभी नहीं माँगेंगे।",
} as const;

export type Lang = keyof typeof HANDOFF_REPLY;
export const asLang = (l: string | null | undefined): Lang => (l === "hi" || l === "hinglish" ? l : "en");
