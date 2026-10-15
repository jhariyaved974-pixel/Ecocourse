/**
 * Deterministic detectors that run on every inbound message regardless of the AI.
 * They are a safety backstop: if either the AI or these detectors fire, the stricter action wins.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();

const OPT_OUT_EXACT = /^(stop|stop all|unsubscribe|cancel|end|quit|opt ?out|band)[\s.!]*$/i;
const OPT_OUT_PHRASES = [
  "stop messaging",
  "stop sending",
  "stop texting",
  "don't message",
  "dont message",
  "do not message",
  "do not contact",
  "don't contact",
  "not interested, stop",
  "remove my number",
  "message mat karo",
  "message mat bhejo",
  "msg mat karo",
  "mat bhejo",
  "band karo",
  "band kar do",
  "मैसेज मत",
  "मत भेजो",
  "बंद करो",
];
const OPT_IN_EXACT = /^(start|unstop|resume|subscribe)[\s.!]*$/i;

const HUMAN = [
  "human",
  "real person",
  "talk to someone",
  "speak to someone",
  "talk to a person",
  "call me",
  "can you call",
  "phone call",
  "talk to the owner",
  "speak to the owner",
  "talk to owner",
  "owner se baat",
  "your manager",
  "kisi se baat",
  "baat karni hai",
  "call karo",
  "call kar",
  "इंसान",
  "बात करनी",
  "कॉल करो",
  "कॉल कर",
];
const PAY_READY = [
  "how to pay",
  "how do i pay",
  "how can i pay",
  "payment details",
  "send payment",
  "bank details",
  "upi id",
  "ready to pay",
  "want to pay",
  "pay now",
  "advance payment",
  "pay advance",
  "pay the advance",
  "payment kaise",
  "kaise pay",
  "paise kaise",
  "भुगतान",
  "पेमेंट कैसे",
];
const PAYMENT_ISSUE = [
  "i paid",
  "i have paid",
  "i've paid",
  "payment done",
  "paid already",
  "already paid",
  "sent the money",
  "transferred",
  "screenshot",
  "payment kar diya",
  "paise bhej diye",
  "bhej diya",
  "refund",
  "paisa wapas",
  "money back",
  "payment failed",
  "charged twice",
  "पेमेंट कर दिया",
  "रिफंड",
];
const COMPLAINT = ["complaint", "worst", "fraud", "scam", "cheat", "not happy", "unhappy", "disappointed", "terrible", "bakwas", "bekar", "dhokha", "शिकायत", "धोखा", "बेकार"];
const DISCOUNT = ["discount", "cheaper", "less price", "lower price", "reduce the price", "best price", "final price", "negotiate", "kam karo", "kam kar", "kuch kam", "thoda kam", "sasta", "छूट", "कम करो", "सस्ता"];
const YES = /^(yes|yeah|yep|yup|y|ok|okay|sure|correct|right|perfect|confirm|confirmed|go ahead|haan|haa|ha|han|ji|ji haan|theek hai|thik hai|sahi hai|bilkul|done|👍|✅|हाँ|हां|जी|ठीक है|सही है)[\s.!]*$/i;
const WANTS_DEMO = ["demo", "preview", "sample", "concept", "show me", "see it", "dikhao", "dekhna", "नमूना", "डेमो"];
const SENSITIVE = /\b(\d{4}[ -]?){3}\d{4}\b|\bcvv\b|\bupi ?pin\b|\botp\b|\bpassword\b/i;

const has = (text: string, list: string[]) => list.some((p) => text.includes(p));

export type KeywordSignals = {
  optOut: boolean;
  optIn: boolean;
  wantsHuman: boolean;
  readyToPay: boolean;
  paymentIssue: boolean;
  complaint: boolean;
  discountRequest: boolean;
  affirmative: boolean;
  wantsDemo: boolean;
  sensitiveData: boolean;
};

export function detectKeywords(raw: string): KeywordSignals {
  const t = norm(raw);
  const wantsHuman = has(t, HUMAN.filter((h) => h.includes(" ") || /[^\x00-\x7F]/.test(h))) || /\b(human|insaan)\b/.test(t);
  return {
    optOut: OPT_OUT_EXACT.test(t) || has(t, OPT_OUT_PHRASES),
    optIn: OPT_IN_EXACT.test(t),
    wantsHuman,
    readyToPay: has(t, PAY_READY),
    paymentIssue: has(t, PAYMENT_ISSUE),
    complaint: has(t, COMPLAINT),
    discountRequest: has(t, DISCOUNT),
    affirmative: YES.test(t),
    wantsDemo: has(t, WANTS_DEMO),
    sensitiveData: SENSITIVE.test(raw),
  };
}

export function detectLanguage(raw: string): "en" | "hi" | "hinglish" {
  if (/[ऀ-ॿ]/.test(raw)) return "hi";
  const t = ` ${norm(raw)} `;
  const hinglish = [" hai ", " hain ", " kya ", " mujhe ", " chahiye ", " karna ", " nahi ", " aap ", " mera ", " meri ", " hum ", " bhai ", " ji ", " kaise ", " kitna ", " accha ", " acha ", " theek ", " dukaan ", " wala ", " wali "];
  const hits = hinglish.filter((w) => t.includes(w)).length;
  return hits >= 2 || (hits === 1 && t.trim().split(" ").length <= 4) ? "hinglish" : "en";
}
