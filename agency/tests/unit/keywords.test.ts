import { describe, expect, it } from "vitest";
import { detectKeywords, detectLanguage } from "@/server/sales/keywords";

describe("detectKeywords", () => {
  it.each(["STOP", "stop", "Unsubscribe", "please stop messaging me", "message mat bhejo", "band karo", "मैसेज मत भेजो"])("detects opt-out: %s", (t) => {
    expect(detectKeywords(t).optOut).toBe(true);
  });
  it.each(["non-stop service", "we stop at nothing", "bus stop near shop", "band music shop"])("does not treat normal text as opt-out: %s", (t) => {
    expect(detectKeywords(t).optOut).toBe(false);
  });
  it("detects requests for a human, but not 'I am the owner'", () => {
    expect(detectKeywords("can I talk to a real person?").wantsHuman).toBe(true);
    expect(detectKeywords("kisi se baat karni hai").wantsHuman).toBe(true);
    expect(detectKeywords("I am the owner of a bakery").wantsHuman).toBe(false);
  });
  it("detects payment claims and readiness, not 'advanced website'", () => {
    expect(detectKeywords("I have paid, sending screenshot").paymentIssue).toBe(true);
    expect(detectKeywords("how do I pay?").readyToPay).toBe(true);
    expect(detectKeywords("I want the advanced website").readyToPay).toBe(false);
  });
  it("detects discount requests and complaints", () => {
    expect(detectKeywords("thoda kam karo please").discountRequest).toBe(true);
    expect(detectKeywords("this is a scam").complaint).toBe(true);
  });
  it("detects card numbers and PIN mentions", () => {
    expect(detectKeywords("my card is 4111 1111 1111 1111").sensitiveData).toBe(true);
    expect(detectKeywords("upi pin is 1234").sensitiveData).toBe(true);
  });
  it("recognises affirmatives in English and Hindi", () => {
    for (const y of ["yes", "Haan", "ok", "theek hai", "हाँ", "👍"]) expect(detectKeywords(y).affirmative).toBe(true);
    expect(detectKeywords("yes but change the colours").affirmative).toBe(false);
  });
});

describe("detectLanguage", () => {
  it("detects Devanagari, Hinglish and English", () => {
    expect(detectLanguage("मुझे वेबसाइट चाहिए")).toBe("hi");
    expect(detectLanguage("mujhe website chahiye meri dukaan ke liye")).toBe("hinglish");
    expect(detectLanguage("I need a website for my shop")).toBe("en");
  });
});
