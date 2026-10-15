import { describe, expect, it } from "vitest";
import { checkAiReply, ensureDisclosure, extractAmounts } from "@/server/sales/guardrails";

const opts = { allowedAmounts: [1000, 3000], allowedUrlPrefixes: ["http://localhost:3100"] };

describe("AI reply guardrails", () => {
  it("allows the official prices", () => {
    expect(checkAiReply("Basic is ₹1,000 and Advanced is Rs. 3000.", opts).ok).toBe(true);
  });
  it("blocks any other price", () => {
    for (const t of ["I can do it for ₹800", "only 2500 rupees", "Rs 1500/-", "₹2k for you"]) {
      const r = checkAiReply(t, opts);
      expect(r.ok, t).toBe(false);
      expect(r.violations).toContain("unapproved_price");
    }
  });
  it("parses amounts with separators and k suffix", () => {
    expect(extractAmounts("₹1,000 or Rs. 3k or 500 rupees")).toEqual([1000, 3000, 500]);
  });
  it("blocks discount offers, payment claims, order confirmations and guarantees", () => {
    expect(checkAiReply("I'll give you 20% off", opts).violations).toContain("discount_offer");
    expect(checkAiReply("Your payment has been received!", opts).violations).toContain("payment_claim");
    expect(checkAiReply("Your order is confirmed.", opts).violations).toContain("order_confirmation");
    expect(checkAiReply("We guarantee first page of Google", opts).violations).toContain("guarantee");
  });
  it("blocks requests for sensitive credentials", () => {
    expect(checkAiReply("Please share your UPI PIN to proceed", opts).violations).toContain("sensitive_request");
  });
  it("blocks links except the app's own preview URLs", () => {
    expect(checkAiReply("See https://evil.example/x", opts).violations).toContain("link");
    expect(checkAiReply("Preview: http://localhost:3100/p/abc/", opts).ok).toBe(true);
  });
  it("adds an automated-assistant disclosure when missing", () => {
    expect(ensureDisclosure("What is your business name?", "Pixel Studio")).toMatch(/AI website consultant for Pixel Studio/);
    expect(ensureDisclosure("Hi! I'm an AI assistant.", "Pixel Studio")).toBe("Hi! I'm an AI assistant.");
  });
});
